// Projects, websites (monitoring, credentials, webhooks) and maintenance.

import { Hono } from 'hono';
import type { AppVars } from '../lib/auth';
import { audit } from '../lib/auth';
import type { Env } from '../lib/db';
import { all, insert, one, run, scalar } from '../lib/db';
import { runWebsiteCheck } from '../lib/monitor';
import { issueCredential, issueRegistrationToken, revokeCredential, API_SCOPES } from '../lib/api-auth';
import { processPendingDeliveries, WEBHOOK_EVENTS } from '../lib/webhooks';
import { nowIso, randomToken, today } from '../lib/util';
import {
  boolField, csvList, dateField, fail, guardAdmin, guardStaff, json, like, nullable, pageParams, paged,
  readBody, str, urlField, moneyField,
} from './app-helpers';

const PROJECT_STATUSES = ['planning', 'in_progress', 'review', 'awaiting_client', 'launched', 'on_hold', 'completed', 'cancelled'];
const PROJECT_CATEGORIES = ['artist_website', 'business_website', 'ecommerce', 'web_app', 'redesign', 'landing_page', 'maintenance', 'other'];
const WEBSITE_STATUSES = ['in_development', 'staging', 'live', 'maintenance', 'paused', 'archived'];

export function appWorkRoutes() {
  const app = new Hono<{ Bindings: Env; Variables: AppVars }>();

  // ------------------------------------------------------------------ projects
  app.get('/projects', async (c) => {
    const user = guardStaff(c);
    if (user instanceof Response) return user;
    const { page, perPage, offset, q } = pageParams(c);
    const status = c.req.query('status') ?? '';
    const clientId = Number(c.req.query('client_id') ?? 0);
    const where = ['p.archived = 0'];
    const params: (string | number)[] = [];
    if (q) { where.push('(p.name LIKE ? OR c.name LIKE ?)'); params.push(like(q), like(q)); }
    if (PROJECT_STATUSES.includes(status)) { where.push('p.status = ?'); params.push(status); }
    if (clientId) { where.push('p.client_id = ?'); params.push(clientId); }
    const clause = where.join(' AND ');
    const total = await scalar(c.env.DB, `SELECT COUNT(*) AS n FROM projects p JOIN clients c ON c.id=p.client_id WHERE ${clause}`, ...params);
    const rowsData = await all(
      c.env.DB,
      `SELECT p.*, c.name AS client_name,
        (SELECT COUNT(*) FROM project_milestones m WHERE m.project_id=p.id AND m.status='done') AS milestones_done,
        (SELECT COUNT(*) FROM project_milestones m WHERE m.project_id=p.id) AS milestones_total,
        (SELECT COUNT(*) FROM tasks t WHERE t.project_id=p.id AND t.status NOT IN ('done','cancelled')) AS open_tasks
       FROM projects p JOIN clients c ON c.id=p.client_id WHERE ${clause}
       ORDER BY CASE p.status WHEN 'in_progress' THEN 0 WHEN 'review' THEN 1 WHEN 'planning' THEN 2 ELSE 3 END,
         p.due_date IS NULL, p.due_date LIMIT ? OFFSET ?`,
      ...params, perPage, offset,
    );
    const byStatus = await all(c.env.DB, `SELECT status, COUNT(*) AS count FROM projects WHERE archived=0 GROUP BY status`);
    return json({ ...paged(rowsData, total, page, perPage), by_status: byStatus });
  });

  app.post('/projects', async (c) => {
    const user = guardStaff(c);
    if (user instanceof Response) return user;
    const body = await readBody(c);
    const name = str(body, 'name', 200);
    const clientId = Number(body.client_id ?? 0);
    if (!name) return fail(422, 'Enter a project name.', { name: 'Required.' });
    if (!clientId) return fail(422, 'Choose a client.', { client_id: 'Required.' });
    const status = str(body, 'status', 30);
    const category = str(body, 'category', 40);
    const id = await insert(
      c.env.DB,
      `INSERT INTO projects(code, name, client_id, category, description, scope, start_date, due_date, budget_cents,
        payment_structure, priority, status, notes, portal_visible, archived, created_at, updated_at)
       VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,?,?)`,
      nullable(body, 'code', 40), name, clientId,
      PROJECT_CATEGORIES.includes(category) ? category : 'business_website',
      nullable(body, 'description', 8000), nullable(body, 'scope', 8000),
      dateField(body, 'start_date'), dateField(body, 'due_date'), moneyField(body, 'budget'),
      nullable(body, 'payment_structure', 120), str(body, 'priority', 20) || 'medium',
      PROJECT_STATUSES.includes(status) ? status : 'planning', nullable(body, 'notes', 8000),
      boolField(body, 'portal_visible', true) ? 1 : 0, nowIso(), nowIso(),
    );
    await audit(c, 'project.created', 'project', id, { name });
    return json({ id }, 201);
  });

  app.get('/projects/:id', async (c) => {
    const user = guardStaff(c);
    if (user instanceof Response) return user;
    const id = Number(c.req.param('id'));
    const project = await one<Record<string, unknown>>(c.env.DB, 'SELECT * FROM projects WHERE id = ?', id);
    if (!project) return fail(404, 'Project not found.');
    const [client, milestones, deliverables, tasks, websites, invoices, agreements, activities] = await Promise.all([
      one(c.env.DB, 'SELECT id, name, company, email, status FROM clients WHERE id = ?', Number(project.client_id)),
      all(c.env.DB, 'SELECT * FROM project_milestones WHERE project_id=? ORDER BY sort, id', id),
      all(c.env.DB, 'SELECT * FROM project_deliverables WHERE project_id=? ORDER BY created_at', id),
      all(c.env.DB, "SELECT * FROM tasks WHERE project_id=? AND status NOT IN ('cancelled') ORDER BY status='done', due_date IS NULL, due_date", id),
      all(c.env.DB, 'SELECT id, name, domain, status, last_health FROM websites WHERE project_id=?', id),
      all(c.env.DB, 'SELECT id, number, status, total_cents, paid_cents, due_date FROM invoices WHERE project_id=? ORDER BY created_at DESC', id),
      all(c.env.DB, 'SELECT id, number, title, status, amount_cents FROM agreements WHERE project_id=? ORDER BY created_at DESC', id),
      all(c.env.DB, `SELECT a.*, u.name AS author FROM activities a LEFT JOIN users u ON u.id=a.created_by WHERE a.project_id=? ORDER BY a.happened_at DESC LIMIT 40`, id),
    ]);
    return json({ project, client, milestones, deliverables, tasks, websites, invoices, agreements, activities });
  });

  app.patch('/projects/:id', async (c) => {
    const user = guardStaff(c);
    if (user instanceof Response) return user;
    const id = Number(c.req.param('id'));
    const cur = await one<Record<string, unknown>>(c.env.DB, 'SELECT * FROM projects WHERE id = ?', id);
    if (!cur) return fail(404, 'Project not found.');
    const body = await readBody(c);
    const status = str(body, 'status', 30);
    const category = str(body, 'category', 40);
    await run(
      c.env.DB,
      `UPDATE projects SET code=?, name=?, category=?, description=?, scope=?, start_date=?, due_date=?, budget_cents=?,
        payment_structure=?, priority=?, status=?, notes=?, portal_visible=?, archived=?, updated_at=? WHERE id=?`,
      nullable(body, 'code', 40) ?? (cur.code as string | null),
      str(body, 'name', 200) || String(cur.name),
      PROJECT_CATEGORIES.includes(category) ? category : String(cur.category),
      body.description === undefined ? (cur.description as string | null) : nullable(body, 'description', 8000),
      body.scope === undefined ? (cur.scope as string | null) : nullable(body, 'scope', 8000),
      dateField(body, 'start_date') ?? (cur.start_date as string | null),
      dateField(body, 'due_date') ?? (cur.due_date as string | null),
      body.budget === undefined ? Number(cur.budget_cents) : moneyField(body, 'budget'),
      nullable(body, 'payment_structure', 120) ?? (cur.payment_structure as string | null),
      str(body, 'priority', 20) || String(cur.priority),
      PROJECT_STATUSES.includes(status) ? status : String(cur.status),
      body.notes === undefined ? (cur.notes as string | null) : nullable(body, 'notes', 8000),
      boolField(body, 'portal_visible', Boolean(cur.portal_visible)) ? 1 : 0,
      boolField(body, 'archived', Boolean(cur.archived)) ? 1 : 0,
      nowIso(), id,
    );
    await audit(c, 'project.updated', 'project', id, { status });
    return json({ ok: true });
  });

  app.delete('/projects/:id', async (c) => {
    const user = guardAdmin(c);
    if (user instanceof Response) return user;
    await run(c.env.DB, 'DELETE FROM projects WHERE id = ?', Number(c.req.param('id')));
    return json({ ok: true });
  });

  app.post('/projects/:id/milestones', async (c) => {
    const user = guardStaff(c);
    if (user instanceof Response) return user;
    const projectId = Number(c.req.param('id'));
    const body = await readBody(c);
    const title = str(body, 'title', 200);
    if (!title) return fail(422, 'Enter a milestone title.', { title: 'Required.' });
    const id = await insert(
      c.env.DB,
      `INSERT INTO project_milestones(project_id, title, description, due_date, amount_cents, status, requires_approval, sort, created_at)
       VALUES(?,?,?,?,?,?,?,?,?)`,
      projectId, title, nullable(body, 'description', 4000), dateField(body, 'due_date'),
      moneyField(body, 'amount'), str(body, 'status', 20) || 'pending',
      boolField(body, 'requires_approval') ? 1 : 0,
      Number(body.sort ?? 0), nowIso(),
    );
    return json({ id }, 201);
  });

  app.patch('/milestones/:id', async (c) => {
    const user = guardStaff(c);
    if (user instanceof Response) return user;
    const id = Number(c.req.param('id'));
    const cur = await one<Record<string, unknown>>(c.env.DB, 'SELECT * FROM project_milestones WHERE id = ?', id);
    if (!cur) return fail(404, 'Milestone not found.');
    const body = await readBody(c);
    const status = str(body, 'status', 20) || String(cur.status);
    await run(
      c.env.DB,
      `UPDATE project_milestones SET title=?, description=?, due_date=?, amount_cents=?, status=?, requires_approval=?,
        approved_at=?, approved_note=? WHERE id=?`,
      str(body, 'title', 200) || String(cur.title),
      body.description === undefined ? (cur.description as string | null) : nullable(body, 'description', 4000),
      dateField(body, 'due_date') ?? (cur.due_date as string | null),
      body.amount === undefined ? Number(cur.amount_cents) : moneyField(body, 'amount'),
      status,
      boolField(body, 'requires_approval', Boolean(cur.requires_approval)) ? 1 : 0,
      status === 'approved' ? (cur.approved_at as string | null) ?? nowIso() : null,
      nullable(body, 'approved_note', 1000),
      id,
    );
    return json({ ok: true });
  });

  app.delete('/milestones/:id', async (c) => {
    const user = guardStaff(c);
    if (user instanceof Response) return user;
    await run(c.env.DB, 'DELETE FROM project_milestones WHERE id = ?', Number(c.req.param('id')));
    return json({ ok: true });
  });

  app.post('/projects/:id/deliverables', async (c) => {
    const user = guardStaff(c);
    if (user instanceof Response) return user;
    const projectId = Number(c.req.param('id'));
    const body = await readBody(c);
    const title = str(body, 'title', 200);
    if (!title) return fail(422, 'Enter a deliverable title.', { title: 'Required.' });
    const id = await insert(
      c.env.DB,
      `INSERT INTO project_deliverables(project_id, title, url, notes, status, portal_visible, created_at)
       VALUES(?,?,?,?,?,?,?)`,
      projectId, title, urlField(body, 'url'), nullable(body, 'notes', 4000),
      str(body, 'status', 20) || 'in_progress', boolField(body, 'portal_visible', true) ? 1 : 0, nowIso(),
    );
    return json({ id }, 201);
  });

  app.patch('/deliverables/:id', async (c) => {
    const user = guardStaff(c);
    if (user instanceof Response) return user;
    const id = Number(c.req.param('id'));
    const cur = await one<Record<string, unknown>>(c.env.DB, 'SELECT * FROM project_deliverables WHERE id = ?', id);
    if (!cur) return fail(404, 'Deliverable not found.');
    const body = await readBody(c);
    await run(
      c.env.DB,
      `UPDATE project_deliverables SET title=?, url=?, notes=?, status=?, portal_visible=? WHERE id=?`,
      str(body, 'title', 200) || String(cur.title),
      urlField(body, 'url') ?? (cur.url as string | null),
      nullable(body, 'notes', 4000) ?? (cur.notes as string | null),
      str(body, 'status', 20) || String(cur.status),
      boolField(body, 'portal_visible', Boolean(cur.portal_visible)) ? 1 : 0,
      id,
    );
    return json({ ok: true });
  });

  app.delete('/deliverables/:id', async (c) => {
    const user = guardStaff(c);
    if (user instanceof Response) return user;
    await run(c.env.DB, 'DELETE FROM project_deliverables WHERE id = ?', Number(c.req.param('id')));
    return json({ ok: true });
  });

  // ------------------------------------------------------------------ websites
  app.get('/websites', async (c) => {
    const user = guardStaff(c);
    if (user instanceof Response) return user;
    const { page, perPage, offset, q } = pageParams(c);
    const status = c.req.query('status') ?? '';
    const clientId = Number(c.req.query('client_id') ?? 0);
    const where: string[] = ['1=1'];
    const params: (string | number)[] = [];
    if (q) { where.push('(w.name LIKE ? OR w.domain LIKE ? OR c.name LIKE ?)'); params.push(like(q), like(q), like(q)); }
    if (WEBSITE_STATUSES.includes(status)) { where.push('w.status = ?'); params.push(status); }
    if (clientId) { where.push('w.client_id = ?'); params.push(clientId); }
    const clause = where.join(' AND ');
    const total = await scalar(c.env.DB, `SELECT COUNT(*) AS n FROM websites w JOIN clients c ON c.id=w.client_id WHERE ${clause}`, ...params);
    const rowsData = await all(
      c.env.DB,
      `SELECT w.*, c.name AS client_name,
        (SELECT COUNT(*) FROM website_checks ck WHERE ck.website_id=w.id AND ck.checked_at > datetime('now','-7 days')) AS checks_7d
       FROM websites w JOIN clients c ON c.id=w.client_id WHERE ${clause} ORDER BY w.name LIMIT ? OFFSET ?`,
      ...params, perPage, offset,
    );
    return json(paged(rowsData, total, page, perPage));
  });

  app.post('/websites', async (c) => {
    const user = guardStaff(c);
    if (user instanceof Response) return user;
    const body = await readBody(c);
    const name = str(body, 'name', 200);
    const clientId = Number(body.client_id ?? 0);
    if (!name) return fail(422, 'Enter a website name.', { name: 'Required.' });
    if (!clientId) return fail(422, 'Choose a client.', { client_id: 'Required.' });
    const status = str(body, 'status', 30);
    const id = await insert(
      c.env.DB,
      `INSERT INTO websites(client_id, project_id, name, domain, production_url, staging_url, category, stack,
        hosting_provider, domain_registrar, deploy_platform, repo_url, backend_provider, db_provider, media_provider,
        status, deployed_at, domain_renewal_date, hosting_renewal_date, ssl_expires_at, monitoring_enabled,
        monitor_interval_minutes, portal_visible, notes, created_at, updated_at)
       VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      clientId, body.project_id ? Number(body.project_id) : null, name, nullable(body, 'domain', 200),
      urlField(body, 'production_url'), urlField(body, 'staging_url'), nullable(body, 'category', 40),
      nullable(body, 'stack', 200), nullable(body, 'hosting_provider', 80), nullable(body, 'domain_registrar', 80),
      nullable(body, 'deploy_platform', 80), urlField(body, 'repo_url'), nullable(body, 'backend_provider', 80),
      nullable(body, 'db_provider', 80), nullable(body, 'media_provider', 80),
      WEBSITE_STATUSES.includes(status) ? status : 'in_development',
      dateField(body, 'deployed_at'), dateField(body, 'domain_renewal_date'), dateField(body, 'hosting_renewal_date'),
      dateField(body, 'ssl_expires_at'), boolField(body, 'monitoring_enabled', true) ? 1 : 0,
      Math.max(15, Math.min(1440, Number(body.monitor_interval_minutes ?? 60))),
      boolField(body, 'portal_visible', true) ? 1 : 0, nullable(body, 'notes', 8000), nowIso(), nowIso(),
    );
    await audit(c, 'website.created', 'website', id, { name });
    return json({ id }, 201);
  });

  app.get('/websites/:id', async (c) => {
    const user = guardStaff(c);
    if (user instanceof Response) return user;
    const id = Number(c.req.param('id'));
    const website = await one<Record<string, unknown>>(c.env.DB, 'SELECT * FROM websites WHERE id = ?', id);
    if (!website) return fail(404, 'Website not found.');
    const [client, checks, events, credentials, webhooks, deliveries, syncLogs, plans, requests, tasks] = await Promise.all([
      one(c.env.DB, 'SELECT id, name, company, email FROM clients WHERE id = ?', Number(website.client_id)),
      all(c.env.DB, 'SELECT * FROM website_checks WHERE website_id=? ORDER BY checked_at DESC LIMIT 40', id),
      all(c.env.DB, 'SELECT * FROM website_events WHERE website_id=? ORDER BY created_at DESC LIMIT 40', id),
      all(c.env.DB, 'SELECT id, label, key_id, secret_hint, scopes, status, created_at, last_used_at, revoked_at FROM api_credentials WHERE website_id=? ORDER BY created_at DESC', id),
      all(c.env.DB, 'SELECT id, url, events, status, last_delivery_at, failure_count, created_at FROM webhook_endpoints WHERE website_id=? ORDER BY created_at DESC', id),
      all(c.env.DB, `SELECT d.id, d.event, d.status, d.attempts, d.response_status, d.last_error, d.created_at, d.delivered_at, d.endpoint_id
                       FROM webhook_deliveries d WHERE d.website_id=? ORDER BY d.created_at DESC LIMIT 25`, id),
      all(c.env.DB, 'SELECT * FROM sync_logs WHERE website_id=? ORDER BY created_at DESC LIMIT 25', id),
      all(c.env.DB, 'SELECT * FROM maintenance_plans WHERE website_id=? ORDER BY name', id),
      all(c.env.DB, 'SELECT * FROM maintenance_requests WHERE website_id=? ORDER BY created_at DESC LIMIT 25', id),
      all(c.env.DB, 'SELECT id, title, status, due_date FROM tasks WHERE website_id=? ORDER BY due_date IS NULL, due_date LIMIT 20', id),
    ]);
    return json({ website, client, checks, events, credentials, webhooks, deliveries, sync_logs: syncLogs, plans, requests, tasks });
  });

  app.patch('/websites/:id', async (c) => {
    const user = guardStaff(c);
    if (user instanceof Response) return user;
    const id = Number(c.req.param('id'));
    const cur = await one<Record<string, unknown>>(c.env.DB, 'SELECT * FROM websites WHERE id = ?', id);
    if (!cur) return fail(404, 'Website not found.');
    const body = await readBody(c);
    const status = str(body, 'status', 30);
    await run(
      c.env.DB,
      `UPDATE websites SET name=?, domain=?, production_url=?, staging_url=?, category=?, stack=?, hosting_provider=?,
        domain_registrar=?, deploy_platform=?, repo_url=?, backend_provider=?, db_provider=?, media_provider=?, status=?,
        deployed_at=?, domain_renewal_date=?, hosting_renewal_date=?, ssl_expires_at=?, monitoring_enabled=?,
        monitor_interval_minutes=?, portal_visible=?, notes=?, updated_at=? WHERE id=?`,
      str(body, 'name', 200) || String(cur.name),
      nullable(body, 'domain', 200) ?? (cur.domain as string | null),
      urlField(body, 'production_url') ?? (cur.production_url as string | null),
      urlField(body, 'staging_url') ?? (cur.staging_url as string | null),
      nullable(body, 'category', 40) ?? (cur.category as string | null),
      nullable(body, 'stack', 200) ?? (cur.stack as string | null),
      nullable(body, 'hosting_provider', 80) ?? (cur.hosting_provider as string | null),
      nullable(body, 'domain_registrar', 80) ?? (cur.domain_registrar as string | null),
      nullable(body, 'deploy_platform', 80) ?? (cur.deploy_platform as string | null),
      urlField(body, 'repo_url') ?? (cur.repo_url as string | null),
      nullable(body, 'backend_provider', 80) ?? (cur.backend_provider as string | null),
      nullable(body, 'db_provider', 80) ?? (cur.db_provider as string | null),
      nullable(body, 'media_provider', 80) ?? (cur.media_provider as string | null),
      WEBSITE_STATUSES.includes(status) ? status : String(cur.status),
      dateField(body, 'deployed_at') ?? (cur.deployed_at as string | null),
      dateField(body, 'domain_renewal_date') ?? (cur.domain_renewal_date as string | null),
      dateField(body, 'hosting_renewal_date') ?? (cur.hosting_renewal_date as string | null),
      dateField(body, 'ssl_expires_at') ?? (cur.ssl_expires_at as string | null),
      boolField(body, 'monitoring_enabled', Boolean(cur.monitoring_enabled)) ? 1 : 0,
      Math.max(15, Math.min(1440, Number(body.monitor_interval_minutes ?? cur.monitor_interval_minutes))),
      boolField(body, 'portal_visible', Boolean(cur.portal_visible)) ? 1 : 0,
      body.notes === undefined ? (cur.notes as string | null) : nullable(body, 'notes', 8000),
      nowIso(), id,
    );
    await audit(c, 'website.updated', 'website', id, null);
    return json({ ok: true });
  });

  app.delete('/websites/:id', async (c) => {
    const user = guardAdmin(c);
    if (user instanceof Response) return user;
    await run(c.env.DB, 'DELETE FROM websites WHERE id = ?', Number(c.req.param('id')));
    return json({ ok: true });
  });

  app.post('/websites/:id/check', async (c) => {
    const user = guardStaff(c);
    if (user instanceof Response) return user;
    const id = Number(c.req.param('id'));
    const result = await runWebsiteCheck(c.env, id, 'manual');
    await audit(c, 'website.checked', 'website', id, { http_status: result.httpStatus });
    return json({ result });
  });

  app.post('/websites/:id/events', async (c) => {
    const user = guardStaff(c);
    if (user instanceof Response) return user;
    const id = Number(c.req.param('id'));
    const body = await readBody(c);
    const title = str(body, 'title', 200);
    if (!title) return fail(422, 'Enter an event title.', { title: 'Required.' });
    const eventId = await insert(
      c.env.DB,
      `INSERT INTO website_events(website_id, type, title, detail, source, created_at) VALUES(?,?,?,?,?,?)`,
      id, str(body, 'type', 30) || 'update', title, nullable(body, 'detail', 4000), 'admin', nowIso(),
    );
    return json({ id: eventId }, 201);
  });

  app.post('/websites/:id/credentials', async (c) => {
    const user = guardStaff(c);
    if (user instanceof Response) return user;
    const id = Number(c.req.param('id'));
    const body = await readBody(c);
    const scopes = String(body.scopes ?? '')
      .split(',').map((s) => s.trim()).filter((s): s is (typeof API_SCOPES)[number] => (API_SCOPES as readonly string[]).includes(s));
    const issued = await issueCredential(
      c.env, id, str(body, 'label', 80) || 'Website integration',
      scopes.length ? scopes : ['website:read', 'website:sync'], user.id,
    );
    await audit(c, 'api_credential.issued', 'website', id, { key_id: issued.keyId });
    return json({ key_id: issued.keyId, token: issued.token }, 201);
  });

  app.delete('/websites/:websiteId/credentials/:id', async (c) => {
    const user = guardStaff(c);
    if (user instanceof Response) return user;
    await revokeCredential(c.env, Number(c.req.param('id')), Number(c.req.param('websiteId')));
    await audit(c, 'api_credential.revoked', 'website', Number(c.req.param('websiteId')), null);
    return json({ ok: true });
  });

  app.post('/websites/:id/registration-token', async (c) => {
    const user = guardStaff(c);
    if (user instanceof Response) return user;
    const issued = await issueRegistrationToken(c.env, Number(c.req.param('id')), user.id);
    return json({ token: issued.token, expires_at: issued.expiresAt }, 201);
  });

  app.post('/websites/:id/webhooks', async (c) => {
    const user = guardStaff(c);
    if (user instanceof Response) return user;
    const id = Number(c.req.param('id'));
    const body = await readBody(c);
    const url = urlField(body, 'url', true);
    if (!url) return fail(422, 'Enter an https:// endpoint URL.', { url: 'HTTPS required.' });
    const requested = String(body.events ?? '*').split(',').map((s) => s.trim()).filter(Boolean);
    const valid = requested.filter((e) => (WEBHOOK_EVENTS as readonly string[]).includes(e));
    const secret = `whsec_${randomToken(24)}`;
    const endpointId = await insert(
      c.env.DB,
      `INSERT INTO webhook_endpoints(website_id, url, secret, events, status, created_at) VALUES(?,?,?,?,?,?)`,
      id, url, secret, valid.length ? valid.join(',') : '*', 'active', nowIso(),
    );
    return json({ id: endpointId, secret }, 201);
  });

  app.delete('/webhooks/:id', async (c) => {
    const user = guardStaff(c);
    if (user instanceof Response) return user;
    await run(c.env.DB, 'DELETE FROM webhook_endpoints WHERE id = ?', Number(c.req.param('id')));
    return json({ ok: true });
  });

  app.post('/webhook-deliveries/:id/replay', async (c) => {
    const user = guardStaff(c);
    if (user instanceof Response) return user;
    const id = Number(c.req.param('id'));
    await run(
      c.env.DB,
      `UPDATE webhook_deliveries SET status='pending', attempts=0, next_attempt_at=?, last_error=NULL WHERE id=?`,
      nowIso(), id,
    );
    await processPendingDeliveries(c.env, 5);
    return json({ ok: true });
  });

  // ------------------------------------------------------------------ maintenance
  app.get('/maintenance', async (c) => {
    const user = guardStaff(c);
    if (user instanceof Response) return user;
    const [plans, requests] = await Promise.all([
      all(c.env.DB, `SELECT mp.*, cl.name AS client_name, w.name AS website_name FROM maintenance_plans mp
        JOIN clients cl ON cl.id=mp.client_id LEFT JOIN websites w ON w.id=mp.website_id
        ORDER BY mp.status='active' DESC, mp.name`),
      all(c.env.DB, `SELECT mr.*, cl.name AS client_name, w.name AS website_name, u.name AS assignee
        FROM maintenance_requests mr JOIN clients cl ON cl.id=mr.client_id
        LEFT JOIN websites w ON w.id=mr.website_id LEFT JOIN users u ON u.id=mr.assignee_id
        ORDER BY mr.status='completed', mr.priority='urgent' DESC, mr.created_at DESC LIMIT 200`),
    ]);
    const mrr = await scalar(c.env.DB, `SELECT COALESCE(SUM(monthly_cents),0) AS n FROM maintenance_plans WHERE status='active'`);
    return json({ plans, requests, mrr_cents: mrr });
  });

  app.post('/maintenance/plans', async (c) => {
    const user = guardStaff(c);
    if (user instanceof Response) return user;
    const body = await readBody(c);
    const name = str(body, 'name', 200);
    const clientId = Number(body.client_id ?? 0);
    if (!name || !clientId) return fail(422, 'Choose a client and name the plan.', { name: 'Required.', client_id: 'Required.' });
    const id = await insert(
      c.env.DB,
      `INSERT INTO maintenance_plans(client_id, website_id, name, monthly_cents, hours_included, services, start_date,
        next_service_date, end_date, status, notes, created_at, updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      clientId, body.website_id ? Number(body.website_id) : null, name, moneyField(body, 'monthly'),
      body.hours_included ? Number(body.hours_included) : null, nullable(body, 'services', 4000),
      dateField(body, 'start_date') ?? today(), dateField(body, 'next_service_date'), dateField(body, 'end_date'),
      str(body, 'status', 20) || 'active', nullable(body, 'notes', 4000), nowIso(), nowIso(),
    );
    return json({ id }, 201);
  });

  app.patch('/maintenance/plans/:id', async (c) => {
    const user = guardStaff(c);
    if (user instanceof Response) return user;
    const id = Number(c.req.param('id'));
    const cur = await one<Record<string, unknown>>(c.env.DB, 'SELECT * FROM maintenance_plans WHERE id=?', id);
    if (!cur) return fail(404, 'Plan not found.');
    const body = await readBody(c);
    await run(
      c.env.DB,
      `UPDATE maintenance_plans SET name=?, monthly_cents=?, hours_included=?, services=?, next_service_date=?,
        end_date=?, status=?, notes=?, updated_at=? WHERE id=?`,
      str(body, 'name', 200) || String(cur.name),
      body.monthly === undefined ? Number(cur.monthly_cents) : moneyField(body, 'monthly'),
      body.hours_included === undefined ? (cur.hours_included as number | null) : Number(body.hours_included),
      nullable(body, 'services', 4000) ?? (cur.services as string | null),
      dateField(body, 'next_service_date') ?? (cur.next_service_date as string | null),
      dateField(body, 'end_date') ?? (cur.end_date as string | null),
      str(body, 'status', 20) || String(cur.status),
      nullable(body, 'notes', 4000) ?? (cur.notes as string | null),
      nowIso(), id,
    );
    return json({ ok: true });
  });

  app.delete('/maintenance/plans/:id', async (c) => {
    const user = guardAdmin(c);
    if (user instanceof Response) return user;
    await run(c.env.DB, 'DELETE FROM maintenance_plans WHERE id=?', Number(c.req.param('id')));
    return json({ ok: true });
  });

  app.post('/maintenance/requests', async (c) => {
    const user = guardStaff(c);
    if (user instanceof Response) return user;
    const body = await readBody(c);
    const title = str(body, 'title', 200);
    const clientId = Number(body.client_id ?? 0);
    if (!title || !clientId) return fail(422, 'Choose a client and describe the request.', { title: 'Required.', client_id: 'Required.' });
    const id = await insert(
      c.env.DB,
      `INSERT INTO maintenance_requests(client_id, website_id, title, description, priority, status, assignee_id,
        submitted_at, target_date, source, created_at, updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`,
      clientId, body.website_id ? Number(body.website_id) : null, title, nullable(body, 'description', 8000),
      str(body, 'priority', 20) || 'medium', 'submitted', body.assignee_id ? Number(body.assignee_id) : user.id,
      nowIso(), dateField(body, 'target_date'), 'admin', nowIso(), nowIso(),
    );
    return json({ id }, 201);
  });

  app.patch('/maintenance/requests/:id', async (c) => {
    const user = guardStaff(c);
    if (user instanceof Response) return user;
    const id = Number(c.req.param('id'));
    const cur = await one<Record<string, unknown>>(c.env.DB, 'SELECT * FROM maintenance_requests WHERE id=?', id);
    if (!cur) return fail(404, 'Request not found.');
    const body = await readBody(c);
    const status = str(body, 'status', 20) || String(cur.status);
    await run(
      c.env.DB,
      `UPDATE maintenance_requests SET title=?, description=?, priority=?, status=?, target_date=?, work_performed=?,
        completed_at=?, notes=?, updated_at=? WHERE id=?`,
      str(body, 'title', 200) || String(cur.title),
      body.description === undefined ? (cur.description as string | null) : nullable(body, 'description', 8000),
      str(body, 'priority', 20) || String(cur.priority), status,
      dateField(body, 'target_date') ?? (cur.target_date as string | null),
      body.work_performed === undefined ? (cur.work_performed as string | null) : nullable(body, 'work_performed', 8000),
      status === 'completed' ? (cur.completed_at as string | null) ?? nowIso() : null,
      body.notes === undefined ? (cur.notes as string | null) : nullable(body, 'notes', 4000),
      nowIso(), id,
    );
    return json({ ok: true });
  });

  app.delete('/maintenance/requests/:id', async (c) => {
    const user = guardAdmin(c);
    if (user instanceof Response) return user;
    await run(c.env.DB, 'DELETE FROM maintenance_requests WHERE id=?', Number(c.req.param('id')));
    return json({ ok: true });
  });

  return app;
}

export const WORK_CONSTANTS = { PROJECT_STATUSES, PROJECT_CATEGORIES, WEBSITE_STATUSES };

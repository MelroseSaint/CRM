// Dashboard, reports, workspace settings, API operations and the client portal.

import { Hono } from 'hono';
import type { AppVars, AuthUser } from '../lib/auth';
import { audit, clientIp, hashPassword } from '../lib/auth';
import type { Env } from '../lib/db';
import { all, getSettings, insert, one, run, scalar, setSetting } from '../lib/db';
import { ownedRow, ownedRows, ownedUpdate, projectChildRows } from '../lib/portal-scope';
import { addDays, nowIso, sha256Hex, today } from '../lib/util';
import {
  fail, guardAdmin, guardClient, guardStaff, json, like, moneyField, nullable, pageParams, paged, readBody, str,
} from './app-helpers';

const SETTING_KEYS = [
  'business_name', 'business_email', 'currency', 'tax_rate', 'invoice_prefix', 'agreement_prefix',
  'payment_terms_days', 'overdue_grace_days', 'api_rate_limit_per_minute', 'portal_welcome',
];

export function appConsoleRoutes() {
  const app = new Hono<{ Bindings: Env; Variables: AppVars }>();

  // ------------------------------------------------------------------ dashboard
  app.get('/dashboard', async (c) => {
    const user = guardStaff(c);
    if (user instanceof Response) return user;
    const db = c.env.DB;
    const monthStart = `${today().slice(0, 7)}-01`;
    const [kpis, invoicedByMonth, collectedByMonth, pipelineRows, healthRows, renewals, dueInvoices, tasks, activity, projects] =
      await Promise.all([
        one<Record<string, number>>(
          db,
          `SELECT
            (SELECT COALESCE(SUM(monthly_cents),0) FROM maintenance_plans WHERE status='active') AS mrr_cents,
            (SELECT COALESCE(SUM(amount_cents),0) FROM payments WHERE status='confirmed' AND paid_at >= ?) AS collected_month_cents,
            (SELECT COALESCE(SUM(total_cents-paid_cents),0) FROM invoices WHERE status IN ('unpaid','partially_paid','overdue')) AS outstanding_cents,
            (SELECT COUNT(*) FROM invoices WHERE status='overdue') AS overdue_invoices,
            (SELECT COUNT(*) FROM projects WHERE status NOT IN ('completed','cancelled') AND archived=0) AS active_projects,
            (SELECT COUNT(*) FROM maintenance_requests WHERE status NOT IN ('completed','closed','rejected')) AS open_requests,
            (SELECT COUNT(*) FROM leads WHERE stage NOT IN ('converted','lost')) AS open_leads,
            (SELECT COUNT(*) FROM websites w WHERE w.monitoring_enabled=1) AS monitored_sites`,
          monthStart,
        ),
        all<{ month: string; cents: number }>(
          db,
          `SELECT substr(issue_date,1,7) AS month, SUM(total_cents) AS cents FROM invoices
            WHERE status NOT IN ('draft','cancelled') AND issue_date IS NOT NULL AND issue_date >= ?
            GROUP BY month ORDER BY month`,
          addDays(monthStart, -190),
        ),
        all<{ month: string; cents: number }>(
          db,
          `SELECT substr(paid_at,1,7) AS month, SUM(amount_cents) AS cents FROM payments
            WHERE status='confirmed' AND paid_at >= ? GROUP BY month ORDER BY month`,
          addDays(monthStart, -190),
        ),
        all<{ stage: string; count: number; value: number; weighted: number }>(
          db,
          `SELECT stage, COUNT(*) AS count, COALESCE(SUM(est_value_cents),0) AS value,
                  COALESCE(SUM(est_value_cents * probability / 100),0) AS weighted
             FROM leads WHERE stage NOT IN ('converted','lost') GROUP BY stage`,
        ),
        all<{ health: string | null; count: number }>(
          db,
          `SELECT last_health AS health, COUNT(*) AS count FROM websites WHERE status <> 'archived' GROUP BY last_health`,
        ),
        all(
          db,
          `SELECT 'website' AS kind, id, name AS label, COALESCE(domain_renewal_date, hosting_renewal_date) AS date FROM websites
            WHERE status <> 'archived' AND COALESCE(domain_renewal_date, hosting_renewal_date) BETWEEN ? AND ?
           UNION ALL
           SELECT 'plan' AS kind, id, name AS label, next_service_date AS date FROM maintenance_plans
            WHERE status='active' AND next_service_date BETWEEN ? AND ?
           ORDER BY date LIMIT 10`,
          today(), addDays(today(), 60), today(), addDays(today(), 60),
        ),
        all(
          db,
          `SELECT i.id, i.number, i.due_date, i.total_cents, i.paid_cents, i.status, cl.name AS client_name
             FROM invoices i JOIN clients cl ON cl.id=i.client_id
            WHERE i.status IN ('unpaid','partially_paid','overdue') ORDER BY i.due_date LIMIT 8`,
        ),
        all(
          db,
          `SELECT t.id, t.title, t.priority, t.due_date, t.status, cl.name AS client_name
             FROM tasks t LEFT JOIN clients cl ON cl.id=t.client_id
            WHERE t.status IN ('open','in_progress','blocked') AND t.due_date IS NOT NULL
            ORDER BY t.due_date LIMIT 8`,
        ),
        all(
          db,
          `SELECT a.id, a.type, a.subject, a.happened_at, a.visibility, cl.name AS client_name
             FROM activities a LEFT JOIN clients cl ON cl.id=a.client_id ORDER BY a.happened_at DESC LIMIT 12`,
        ),
        all(
          db,
          `SELECT p.id, p.name, p.status, p.due_date, c.name AS client_name,
                  (SELECT COUNT(*) FROM project_milestones m WHERE m.project_id=p.id AND m.status='done') AS done,
                  (SELECT COUNT(*) FROM project_milestones m WHERE m.project_id=p.id) AS total
             FROM projects p JOIN clients c ON c.id=p.client_id
            WHERE p.status NOT IN ('completed','cancelled') AND p.archived=0 ORDER BY p.due_date IS NULL, p.due_date LIMIT 6`,
        ),
      ]);

    const months: { month: string; invoiced: number; collected: number }[] = [];
    const start = new Date(`${monthStart}T00:00:00Z`);
    for (let i = 5; i >= 0; i--) {
      const d = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() - i, 1));
      months.push({ month: d.toISOString().slice(0, 7), invoiced: 0, collected: 0 });
    }
    for (const row of invoicedByMonth) {
      const m = months.find((x) => x.month === row.month);
      if (m) m.invoiced = Number(row.cents ?? 0);
    }
    for (const row of collectedByMonth) {
      const m = months.find((x) => x.month === row.month);
      if (m) m.collected = Number(row.cents ?? 0);
    }

    const pipelineValue = pipelineRows.reduce((s, r) => s + Number(r.value ?? 0), 0);
    const weighted = pipelineRows.reduce((s, r) => s + Number(r.weighted ?? 0), 0);
    const health = { ok: 0, warn: 0, fail: 0, unknown: 0, unchecked: 0 };
    for (const row of healthRows) {
      const key = (row.health ?? 'unchecked') as keyof typeof health;
      if (key in health) health[key] += Number(row.count ?? 0);
    }
    return json({
      kpis: { ...kpis, pipeline_value_cents: pipelineValue, weighted_pipeline_cents: weighted, health },
      revenue: months,
      pipeline: pipelineRows.map((r) => ({ ...r, count: Number(r.count), value: Number(r.value), weighted: Number(r.weighted) })),
      renewals,
      invoices: dueInvoices,
      tasks,
      activity,
      projects,
    });
  });

  app.get('/nav', async (c) => {
    const user = guardStaff(c);
    if (user instanceof Response) return user;
    const row = await one<Record<string, number>>(
      c.env.DB,
      `SELECT (SELECT COUNT(*) FROM clients WHERE status IN ('active_client','onboarding')) AS clients,
              (SELECT COUNT(*) FROM leads WHERE stage NOT IN ('converted','lost')) AS leads,
              (SELECT COUNT(*) FROM projects WHERE status NOT IN ('completed','cancelled')) AS projects,
              (SELECT COUNT(*) FROM maintenance_requests WHERE status NOT IN ('completed','closed','rejected')) AS maintenance,
              (SELECT COUNT(*) FROM tasks WHERE status IN ('open','in_progress')) AS tasks,
              (SELECT COUNT(*) FROM invoices WHERE status='overdue') AS overdue`,
    );
    return json(row ?? {});
  });

  // ------------------------------------------------------------------ reports
  app.get('/reports', async (c) => {
    const user = guardStaff(c);
    if (user instanceof Response) return user;
    const from = /^\d{4}-\d{2}-\d{2}$/.test(c.req.query('from') ?? '') ? String(c.req.query('from')) : `${today().slice(0, 4)}-01-01`;
    const to = /^\d{4}-\d{2}-\d{2}$/.test(c.req.query('to') ?? '') ? String(c.req.query('to')) : today();
    const db = c.env.DB;
    const [byMonth, byClient, aging, projectStatus, mrr, health, funnel, totals] = await Promise.all([
      all(db, `SELECT substr(issue_date,1,7) AS month, SUM(total_cents) AS invoiced FROM invoices
                WHERE issue_date BETWEEN ? AND ? AND status NOT IN ('draft','cancelled') GROUP BY month ORDER BY month`, from, to),
      all(db, `SELECT cl.id, cl.name, SUM(i.total_cents) AS invoiced, SUM(i.paid_cents) AS collected,
                      SUM(CASE WHEN i.status IN ('unpaid','partially_paid','overdue') THEN i.total_cents-i.paid_cents ELSE 0 END) AS outstanding
                 FROM invoices i JOIN clients cl ON cl.id=i.client_id
                WHERE i.issue_date BETWEEN ? AND ? AND i.status NOT IN ('draft','cancelled')
                GROUP BY cl.id ORDER BY invoiced DESC`, from, to),
      all(db, `SELECT CASE
                 WHEN due_date IS NULL THEN 'undated'
                 WHEN due_date >= date('now') THEN 'current'
                 WHEN due_date >= date('now','-30 days') THEN '1-30'
                 WHEN due_date >= date('now','-60 days') THEN '31-60'
                 ELSE '60+' END AS bucket,
                 COUNT(*) AS count, SUM(total_cents-paid_cents) AS amount
                FROM invoices WHERE status IN ('unpaid','partially_paid','overdue') GROUP BY bucket`),
      all(db, `SELECT status, COUNT(*) AS count, COALESCE(SUM(budget_cents),0) AS budget FROM projects WHERE archived=0 GROUP BY status`),
      scalar(db, `SELECT COALESCE(SUM(monthly_cents),0) AS n FROM maintenance_plans WHERE status='active'`),
      all(db, `SELECT COALESCE(last_health,'unchecked') AS health, COUNT(*) AS count FROM websites WHERE status<>'archived' GROUP BY health`),
      all(db, `SELECT stage, COUNT(*) AS count, COALESCE(SUM(est_value_cents),0) AS value FROM leads GROUP BY stage`),
      one<Record<string, number>>(
        db,
        `SELECT (SELECT COALESCE(SUM(total_cents),0) FROM invoices WHERE issue_date BETWEEN ? AND ? AND status NOT IN ('draft','cancelled')) AS invoiced_cents,
                (SELECT COALESCE(SUM(amount_cents),0) FROM payments WHERE paid_at BETWEEN ? AND ? AND status='confirmed') AS collected_cents,
                (SELECT COALESCE(SUM(est_value_cents),0) FROM leads WHERE stage NOT IN ('lost')) AS pipeline_value_cents`,
        from, to, from, to,
      ),
    ]);
    return json({ from, to, by_month: byMonth, by_client: byClient, aging, project_status: projectStatus, mrr_cents: mrr, health, funnel, totals });
  });

  // ------------------------------------------------------------------ settings
  app.get('/settings', async (c) => {
    const user = guardAdmin(c);
    if (user instanceof Response) return user;
    const settings = await getSettings(c.env.DB);
    const users = await all(
      c.env.DB,
      `SELECT u.id, u.name, u.email, u.role, u.status, u.last_login_at, u.created_at, u.client_id, cl.name AS client_name
         FROM users u LEFT JOIN clients cl ON cl.id=u.client_id ORDER BY u.role, u.name`,
    );
    return json({ settings, users });
  });

  app.put('/settings', async (c) => {
    const user = guardAdmin(c);
    if (user instanceof Response) return user;
    const body = await readBody(c);
    for (const key of SETTING_KEYS) {
      if (body[key] === undefined) continue;
      await setSetting(c.env.DB, key, str(body, key, 400));
    }
    await audit(c, 'settings.updated', 'settings', null, null);
    return json({ ok: true });
  });

  app.post('/users', async (c) => {
    const user = guardAdmin(c);
    if (user instanceof Response) return user;
    const body = await readBody(c);
    const name = str(body, 'name', 120);
    const email = str(body, 'email', 200).toLowerCase();
    const password = str(body, 'password', 400);
    const role = str(body, 'role', 20) === 'admin' ? 'admin' : 'staff';
    if (!name) return fail(422, 'Enter a name.', { name: 'Required.' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail(422, 'Enter a valid email.', { email: 'Invalid.' });
    if (password.length < 10) return fail(422, 'Use at least 10 characters.', { password: 'Too short.' });
    if (await one(c.env.DB, 'SELECT id FROM users WHERE email=?', email)) {
      return fail(409, 'That email already has an account.', { email: 'Already in use.' });
    }
    const { hash, salt, iterations } = await hashPassword(password);
    const id = await insert(
      c.env.DB,
      `INSERT INTO users(email, name, role, client_id, password_hash, password_salt, iterations, status, created_at)
       VALUES(?,?,?,NULL,?,?,?,?,?)`,
      email, name, role, hash, salt, iterations, 'active', nowIso(),
    );
    await audit(c, 'user.created', 'user', id, { role });
    return json({ id }, 201);
  });

  app.patch('/users/:id', async (c) => {
    const user = guardAdmin(c);
    if (user instanceof Response) return user;
    const id = Number(c.req.param('id'));
    const cur = await one<Record<string, unknown>>(c.env.DB, 'SELECT * FROM users WHERE id=?', id);
    if (!cur) return fail(404, 'User not found.');
    const body = await readBody(c);
    const role = str(body, 'role', 20);
    if (id === user.id && role === 'staff') return fail(409, 'You cannot demote your own administrator account.');
    const status = str(body, 'status', 20) === 'disabled' ? 'disabled' : 'active';
    if (id === user.id && status === 'disabled') return fail(409, 'You cannot disable your own account.');
    await run(
      c.env.DB,
      'UPDATE users SET name=?, role=?, status=? WHERE id=? AND role <> \'client\'',
      str(body, 'name', 120) || String(cur.name),
      role === 'admin' ? 'admin' : role === 'staff' ? 'staff' : String(cur.role),
      status, id,
    );
    if (status === 'disabled') await run(c.env.DB, 'DELETE FROM sessions WHERE user_id=?', id);
    await audit(c, 'user.updated', 'user', id, { role, status });
    return json({ ok: true });
  });

  app.post('/users/:id/password', async (c) => {
    const admin = guardAdmin(c);
    if (admin instanceof Response) return admin;
    const id = Number(c.req.param('id'));
    const body = await readBody(c);
    const password = str(body, 'password', 400);
    if (password.length < 10) return fail(422, 'Use at least 10 characters.', { password: 'Too short.' });
    const { hash, salt, iterations } = await hashPassword(password);
    await run(c.env.DB, 'UPDATE users SET password_hash=?, password_salt=?, iterations=? WHERE id=?', hash, salt, iterations, id);
    await run(c.env.DB, 'DELETE FROM sessions WHERE user_id=?', id);
    await audit(c, 'user.password_reset', 'user', id, null);
    return json({ ok: true });
  });

  // ------------------------------------------------------------------ API operations
  app.get('/api-admin', async (c) => {
    const user = guardStaff(c);
    if (user instanceof Response) return user;
    const db = c.env.DB;
    const [credentials, endpoints, deliveries, logs, usage, byWebsite, syncLogs] = await Promise.all([
      all(db, `SELECT ac.id, ac.label, ac.key_id, ac.secret_hint, ac.scopes, ac.status, ac.created_at, ac.last_used_at,
                      ac.website_id, w.name AS website_name, cl.name AS client_name
                 FROM api_credentials ac JOIN websites w ON w.id=ac.website_id JOIN clients cl ON cl.id=w.client_id
                ORDER BY ac.created_at DESC LIMIT 100`),
      all(db, `SELECT we.id, we.url, we.events, we.status, we.last_delivery_at, we.failure_count, we.website_id, w.name AS website_name
                 FROM webhook_endpoints we JOIN websites w ON w.id=we.website_id ORDER BY we.created_at DESC LIMIT 60`),
      all(db, `SELECT d.id, d.event, d.status, d.attempts, d.response_status, d.created_at, d.delivered_at, w.name AS website_name
                 FROM webhook_deliveries d LEFT JOIN websites w ON w.id=d.website_id ORDER BY d.created_at DESC LIMIT 40`),
      all(db, `SELECT l.id, l.method, l.path, l.status, l.duration_ms, l.created_at, w.name AS website_name
                 FROM api_request_logs l LEFT JOIN websites w ON w.id=l.website_id ORDER BY l.created_at DESC LIMIT 60`),
      all<{ day: string; count: number }>(
        db,
        `SELECT substr(created_at,1,10) AS day, COUNT(*) AS count FROM api_request_logs
          WHERE created_at >= datetime('now','-13 days') GROUP BY day ORDER BY day`,
      ),
      all(db, `SELECT w.id, w.name, COUNT(l.id) AS requests, MAX(l.created_at) AS last_request
                 FROM websites w LEFT JOIN api_request_logs l ON l.website_id=w.id
                WHERE w.integration_status <> 'not_connected' OR l.id IS NOT NULL
                GROUP BY w.id ORDER BY requests DESC LIMIT 10`),
      all(db, `SELECT s.id, s.website_id, s.kind, s.status, s.message, s.created_at, w.name AS website_name
                 FROM sync_logs s LEFT JOIN websites w ON w.id=s.website_id ORDER BY s.created_at DESC LIMIT 30`),
    ]);
    return json({ credentials, endpoints, deliveries, logs, usage, by_website: byWebsite, sync_logs: syncLogs });
  });

  // ------------------------------------------------------------------ portal
  app.get('/portal', async (c) => {
    const user = guardClient(c);
    if (user instanceof Response) return user;
    const id = user.client_id as number;
    const db = c.env.DB;
    const [client, projects, invoices, agreements, documents, requests, websites, plans, activities] = await Promise.all([
      one(db, 'SELECT id, name, company, email, phone FROM clients WHERE id=?', id),
      all(db, `SELECT p.id, p.name, p.status, p.description, p.due_date, p.start_date,
                (SELECT COUNT(*) FROM project_milestones m WHERE m.project_id=p.id AND m.status='done') AS done,
                (SELECT COUNT(*) FROM project_milestones m WHERE m.project_id=p.id) AS total
               FROM projects p WHERE p.client_id=? AND p.portal_visible=1 AND p.archived=0 ORDER BY p.created_at DESC`, id),
      all(db, `SELECT id, number, status, total_cents, paid_cents, due_date, issue_date FROM invoices
                WHERE client_id=? AND portal_visible=1 AND status <> 'draft' ORDER BY created_at DESC`, id),
      all(db, `SELECT id, number, title, status, amount_cents, accepted_at, sent_at FROM agreements
                WHERE client_id=? AND portal_visible=1 AND status IN ('sent','viewed','accepted','declined') ORDER BY created_at DESC`, id),
      all(db, `SELECT id, name, category, size_bytes, created_at FROM documents WHERE client_id=? AND visibility='client' ORDER BY created_at DESC`, id),
      all(db, `SELECT id, title, description, priority, status, submitted_at, completed_at FROM maintenance_requests
                WHERE client_id=? ORDER BY created_at DESC LIMIT 50`, id),
      all(db, `SELECT id, name, domain, production_url, status, last_health, last_check_at FROM websites
                WHERE client_id=? AND portal_visible=1 ORDER BY name`, id),
      all(db, `SELECT id, name, monthly_cents, services, next_service_date, status FROM maintenance_plans WHERE client_id=?`, id),
      all(db, `SELECT id, type, subject, body, happened_at FROM activities WHERE client_id=? AND visibility='client' ORDER BY happened_at DESC LIMIT 20`, id),
    ]);
    const totals = await one<Record<string, number>>(
      db,
      `SELECT (SELECT COALESCE(SUM(total_cents-paid_cents),0) FROM invoices WHERE client_id=? AND status IN ('unpaid','partially_paid','overdue')) AS outstanding_cents,
              (SELECT COALESCE(SUM(amount_cents),0) FROM payments WHERE client_id=? AND status='confirmed') AS paid_cents`,
      id, id,
    );
    return json({ client, projects, invoices, agreements, documents, requests, websites, plans, activities, totals });
  });

  app.get('/portal/projects/:id', async (c) => {
    const user = guardClient(c);
    if (user instanceof Response) return user;
    const id = Number(c.req.param('id'));
    // Only client-facing columns: internal notes, budget and payment plan stay staff-side.
    const project = await ownedRow<Record<string, unknown>>(c, 'projects', id, user.client_id, {
      columns: 'id, name, status, description, scope, category, start_date, due_date',
      where: 'AND portal_visible = 1',
    });
    if (!project) return fail(404, 'Project not found.');
    const [milestones, deliverables, invoices, activity] = await Promise.all([
      projectChildRows<Record<string, unknown>>(c, 'project_milestones', id, user.client_id, {
        orderBy: 'ORDER BY x.sort, x.id',
      }),
      projectChildRows<Record<string, unknown>>(c, 'project_deliverables', id, user.client_id, {
        where: 'AND x.portal_visible = 1',
        orderBy: 'ORDER BY x.created_at',
      }),
      projectChildRows<Record<string, unknown>>(c, 'invoices', id, user.client_id, {
        columns: 'id, number, status, total_cents, paid_cents, due_date',
        where: "AND x.portal_visible = 1 AND x.status <> 'draft'",
        orderBy: 'ORDER BY x.created_at DESC',
      }),
      projectChildRows<Record<string, unknown>>(c, 'activities', id, user.client_id, {
        where: "AND x.visibility = 'client'",
        orderBy: 'ORDER BY x.happened_at DESC LIMIT 20',
      }),
    ]);
    return json({ project, milestones, deliverables, invoices, activities: activity });
  });

  app.post('/portal/requests', async (c) => {
    const user = guardClient(c);
    if (user instanceof Response) return user;
    const body = await readBody(c);
    const title = str(body, 'title', 200);
    if (!title) return fail(422, 'Describe what you need.', { title: 'Required.' });
    // A client may only attach one of its own websites (never another client's id).
    const websiteId = Number(body.website_id) || null;
    if (websiteId) {
      const owned = await ownedRow(c, 'websites', websiteId, user.client_id, {
        columns: 'id',
        where: 'AND portal_visible = 1',
      });
      if (!owned) return fail(422, 'Choose one of your websites.', { website_id: 'Not available.' });
    }
    const priorityInput = str(body, 'priority', 20);
    const priority = ['low', 'medium', 'high', 'urgent'].includes(priorityInput) ? priorityInput : 'medium';
    const id = await insert(
      c.env.DB,
      `INSERT INTO maintenance_requests(client_id, website_id, title, description, priority, status, submitted_at,
        source, created_at, updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)`,
      user.client_id, websiteId, title,
      nullable(body, 'description', 4000), priority, 'submitted',
      nowIso(), 'portal', nowIso(), nowIso(),
    );
    await audit(c, 'maintenance.requested_by_client', 'maintenance_request', id, { title });
    return json({ id }, 201);
  });

  app.post('/portal/invoices/:id/claim', async (c) => {
    const user = guardClient(c);
    if (user instanceof Response) return user;
    const id = Number(c.req.param('id'));
    const invoice = await ownedRow<{ id: number; total_cents: number; paid_cents: number; status: string }>(
      c, 'invoices', id, user.client_id,
      { columns: 'id, total_cents, paid_cents, status', where: 'AND portal_visible = 1' },
    );
    if (!invoice) return fail(404, 'Invoice not found.');
    if (invoice.status === 'paid' || invoice.status === 'cancelled') return fail(409, 'This invoice is already settled.');
    const body = await readBody(c);
    const amount = moneyField(body, 'amount');
    if (amount <= 0) return fail(422, 'Enter the amount you paid.', { amount: 'Required.' });
    if (amount + invoice.paid_cents > invoice.total_cents) {
      return fail(422, 'That amount is more than the invoice balance.', { amount: 'Too large.' });
    }
    const paymentId = await insert(
      c.env.DB,
      `INSERT INTO payments(invoice_id, client_id, amount_cents, paid_at, method, reference, notes, status, source, created_at)
       VALUES(?,?,?,?,?,?,?,?,?,?)`,
      id, user.client_id, amount, today(), str(body, 'method', 40) || 'bank_transfer',
      nullable(body, 'reference', 120), nullable(body, 'note', 1000), 'pending', 'portal', nowIso(),
    );
    await audit(c, 'payment.claimed_by_client', 'invoice', id, { amount_cents: amount });
    return json({ id: paymentId, status: 'pending' }, 201);
  });

  app.post('/portal/agreements/:id/view', async (c) => {
    const user = guardClient(c);
    if (user instanceof Response) return user;
    const id = Number(c.req.param('id'));
    const ag = await ownedRow<{ status: string }>(c, 'agreements', id, user.client_id, {
      columns: 'status',
      where: 'AND portal_visible = 1',
    });
    if (!ag) return fail(404, 'Agreement not found.');
    if (ag.status === 'sent') {
      await ownedUpdate(c, 'agreements', id, user.client_id, {
        status: 'viewed',
        viewed_at: nowIso(),
        updated_at: nowIso(),
      });
    }
    return json({ ok: true });
  });

  app.post('/portal/agreements/:id/accept', async (c) => {
    const user = guardClient(c);
    if (user instanceof Response) return user;
    const id = Number(c.req.param('id'));
    const agreement = await ownedRow<Record<string, unknown>>(c, 'agreements', id, user.client_id, {
      where: 'AND portal_visible = 1',
    });
    if (!agreement) return fail(404, 'Agreement not found.');
    if (agreement.accepted_at) return fail(409, 'This agreement has already been accepted.');
    if (!['sent', 'viewed'].includes(String(agreement.status))) return fail(409, 'This agreement is not open for acceptance.');
    if (agreement.expires_at && String(agreement.expires_at) < today()) {
      return fail(409, 'This agreement has expired. Ask the studio for an updated copy.');
    }
    const body = await readBody(c);
    const name = str(body, 'name', 120);
    const consent = body.consent === true || body.consent === 'on' || body.consent === '1';
    if (!name) return fail(422, 'Type your full name to accept.', { name: 'Required.' });
    if (!consent) return fail(422, 'Confirm that you have read the agreement.', { consent: 'Required.' });

    // Content hash covers every contractual field, so any later edit changes the digest.
    const content = [
      agreement.title, agreement.body, agreement.scope, agreement.deliverables, agreement.amount_cents,
      agreement.deposit_cents, agreement.revision_limit, agreement.timeline, agreement.maintenance_terms,
      agreement.support_terms, agreement.client_responsibilities, agreement.cancellation_terms,
      agreement.extra_conditions,
    ].join('\u001f');
    const hash = await sha256Hex(content);
    await ownedUpdate(c, 'agreements', id, user.client_id, {
      status: 'accepted',
      accepted_at: nowIso(),
      accepted_by: name,
      accepted_ip: clientIp(c),
      accepted_hash: hash,
      updated_at: nowIso(),
    });
    await audit(c, 'agreement.accepted', 'agreement', id, { accepted_by: name, hash });
    return json({ ok: true, hash });
  });

  // ------------------------------------------------------------------ client management console helpers
  app.get('/lookups', async (c) => {
    const user = guardStaff(c);
    if (user instanceof Response) return user;
    const [clients, projects, websites, staff] = await Promise.all([
      all(c.env.DB, 'SELECT id, name, company FROM clients WHERE archived=0 ORDER BY name COLLATE NOCASE'),
      all(c.env.DB, `SELECT p.id, p.name, p.client_id, c.name AS client_name FROM projects p JOIN clients c ON c.id=p.client_id WHERE p.archived=0 ORDER BY p.name LIMIT 300`),
      all(c.env.DB, `SELECT w.id, w.name, w.client_id, w.domain FROM websites w WHERE w.status <> 'archived' ORDER BY w.name LIMIT 300`),
      all(c.env.DB, `SELECT id, name, role FROM users WHERE role IN ('admin','staff') AND status='active' ORDER BY name`),
    ]);
    return json({ clients, projects, websites, staff });
  });

  // Client detail used by the portal-scoped "request" form.
  app.get('/portal/lookups', async (c) => {
    const user = guardClient(c);
    if (user instanceof Response) return user;
    const websites = await ownedRows(c, 'websites', user.client_id, {
      columns: 'id, name',
      where: 'AND portal_visible = 1',
      orderBy: 'ORDER BY name',
    });
    return json({ websites });
  });

  app.get('/activity', async (c) => {
    const user = guardStaff(c);
    if (user instanceof Response) return user;
    const { page, perPage, offset } = pageParams(c);
    const total = await scalar(c.env.DB, 'SELECT COUNT(*) AS n FROM audit_logs');
    const rowsData = await all(
      c.env.DB,
      `SELECT id, actor_email, actor_role, action, entity_type, entity_id, detail, ip, created_at
         FROM audit_logs ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      perPage, offset,
    );
    return json(paged(rowsData, total, page, perPage));
  });

  // Small endpoint used by the command palette preview of clients.
  app.get('/clients-lite', async (c) => {
    const user = guardStaff(c);
    if (user instanceof Response) return user;
    const q = (c.req.query('q') ?? '').trim().slice(0, 60);
    const clients = await all(
      c.env.DB,
      `SELECT id, name, company FROM clients WHERE archived=0 AND (name LIKE ? OR company LIKE ?) ORDER BY name LIMIT 20`,
      like(q || '%'), like(q || '%'),
    );
    return json({ clients });
  });

  return app;
}

export function portalUserScope(_user: AuthUser | null): null {
  return null;
}

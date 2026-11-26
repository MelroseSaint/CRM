// Clients, leads, tasks, calendar, documents and global search.

import { Hono } from 'hono';
import type { AppVars } from '../lib/auth';
import { audit, hashPassword } from '../lib/auth';
import type { Env } from '../lib/db';
import { all, insert, one, run, scalar, Db} from '../lib/db';
import { ownedRow } from '../lib/portal-scope';
import { nowIso, randomToken, today } from '../lib/util';
import {
  boolField,
  csvList,
  dateField,
  datetimeField,
  emailField,
  fail,
  guardAdmin,
  guardStaff,
  json,
  like,
  nullable,
  pageParams,
  paged,
  readBody,
  str,
  urlField,
} from './app-helpers';

const CLIENT_STATUSES = ['new_lead', 'contacted', 'proposal_sent', 'onboarding', 'active_client', 'paused', 'former_client'];
const LEAD_STAGES = [
  'new_inquiry', 'discovery', 'proposal_sent', 'negotiation', 'contract_sent', 'deposit_paid',
  'in_progress', 'review', 'launch', 'retainer', 'converted', 'lost',
];
const TASK_STATUSES = ['open', 'in_progress', 'blocked', 'done', 'cancelled'];

export function appPeopleRoutes() {
  const app = new Hono<{ Bindings: Env; Variables: AppVars }>();

  // ------------------------------------------------------------------ clients
  app.get('/clients', async (c) => {
    const user = guardStaff(c);
    if (user instanceof Response) return user;
    const { page, perPage, offset, q } = pageParams(c);
    const status = c.req.query('status') ?? '';
    const arch = c.req.query('archived') === '1';
    const where: string[] = [`c.archived = ${arch ? 1 : 0}`];
    const params: (string | number)[] = [];
    if (q) {
      where.push('(c.name LIKE ? OR c.company LIKE ? OR c.email LIKE ?)');
      params.push(like(q), like(q), like(q));
    }
    if (status && CLIENT_STATUSES.includes(status)) {
      where.push('c.status = ?');
      params.push(status);
    }
    const clause = where.join(' AND ');
    const total = await scalar(c.env.DB, `SELECT COUNT(*) AS n FROM clients c WHERE ${clause}`, ...params);
    const sort = c.req.query('sort') === 'name' ? 'c.name COLLATE NOCASE' : 'c.created_at DESC';
    const rowsData = await all<Record<string, unknown>>(
      c.env.DB,
      `SELECT c.*,
        (SELECT COUNT(*) FROM projects p WHERE p.client_id = c.id AND p.archived = 0) AS project_count,
        (SELECT COUNT(*) FROM websites w WHERE w.client_id = c.id) AS website_count,
        (SELECT COALESCE(SUM(monthly_cents),0) FROM maintenance_plans mp WHERE mp.client_id = c.id AND mp.status='active') AS mrr_cents,
        (SELECT COALESCE(SUM(total_cents - paid_cents),0) FROM invoices i WHERE i.client_id = c.id AND i.status IN ('unpaid','partially_paid','overdue')) AS outstanding_cents
       FROM clients c WHERE ${clause} ORDER BY ${sort} LIMIT ? OFFSET ?`,
      ...params,
      perPage,
      offset,
    );
    return json(paged(rowsData, total, page, perPage));
  });

  app.post('/clients', async (c) => {
    const user = guardStaff(c);
    if (user instanceof Response) return user;
    const body = await readBody(c);
    const name = str(body, 'name', 160);
    if (!name) return fail(422, 'Enter a client name.', { name: 'Required.' });
    const status = str(body, 'status', 40);
    const id = await insert(
      c.env.DB,
      `INSERT INTO clients(name, company, email, phone, address, category, preferred_contact, status, notes,
        lead_source, inquiry_date, services_discussed, tags, acquired_at, archived, created_at, updated_at)
       VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,?,?)`,
      name,
      nullable(body, 'company', 160),
      emailField(body, 'email'),
      nullable(body, 'phone', 40),
      nullable(body, 'address', 400),
      nullable(body, 'category', 60),
      str(body, 'preferred_contact', 20) || 'email',
      CLIENT_STATUSES.includes(status) ? status : 'new_lead',
      nullable(body, 'notes', 8000),
      nullable(body, 'lead_source', 80),
      dateField(body, 'inquiry_date'),
      nullable(body, 'services_discussed', 400),
      csvList(body, 'tags'),
      dateField(body, 'acquired_at') ?? today(),
      nowIso(),
      nowIso(),
    );
    await syncTags(c.env.DB, id, csvList(body, 'tags'));
    await audit(c, 'client.created', 'client', id, { name });
    return json({ id }, 201);
  });

  app.get('/clients/:id', async (c) => {
    const user = guardStaff(c);
    if (user instanceof Response) return user;
    const id = Number(c.req.param('id'));
    const client = await one<Record<string, unknown>>(c.env.DB, 'SELECT * FROM clients WHERE id = ?', id);
    if (!client) return fail(404, 'Client not found.');
    const [projects, websites, invoices, agreements, activities, tasks, plans, documents, portalUser, totals] =
      await Promise.all([
        all(c.env.DB, `SELECT id, name, status, category, due_date, budget_cents FROM projects WHERE client_id=? AND archived=0 ORDER BY created_at DESC`, id),
        all(c.env.DB, `SELECT id, name, domain, status, last_health, last_check_at, integration_status FROM websites WHERE client_id=? ORDER BY name`, id),
        all(c.env.DB, `SELECT id, number, status, total_cents, paid_cents, due_date, issue_date FROM invoices WHERE client_id=? ORDER BY created_at DESC LIMIT 50`, id),
        all(c.env.DB, `SELECT id, number, title, status, amount_cents, accepted_at FROM agreements WHERE client_id=? ORDER BY created_at DESC`, id),
        all(c.env.DB, `SELECT a.*, u.name AS author FROM activities a LEFT JOIN users u ON u.id=a.created_by WHERE a.client_id=? ORDER BY a.happened_at DESC LIMIT 60`, id),
        all(c.env.DB, `SELECT id, title, status, priority, due_date FROM tasks WHERE client_id=? AND status NOT IN ('done','cancelled') ORDER BY due_date IS NULL, due_date LIMIT 30`, id),
        all(c.env.DB, `SELECT * FROM maintenance_plans WHERE client_id=? ORDER BY status='active' DESC, name`, id),
        all(c.env.DB, `SELECT id, name, category, size_bytes, visibility, created_at FROM documents WHERE client_id=? ORDER BY created_at DESC LIMIT 50`, id),
        one(c.env.DB, `SELECT id, email, name, status, last_login_at FROM users WHERE client_id=? AND role='client' ORDER BY id DESC LIMIT 1`, id),
        one<Record<string, number>>(
          c.env.DB,
          `SELECT (SELECT COALESCE(SUM(amount_cents),0) FROM payments WHERE client_id=? AND status='confirmed') AS lifetime_cents,
                  (SELECT COALESCE(SUM(total_cents-paid_cents),0) FROM invoices WHERE client_id=? AND status IN ('unpaid','partially_paid','overdue')) AS outstanding_cents,
                  (SELECT COALESCE(SUM(monthly_cents),0) FROM maintenance_plans WHERE client_id=? AND status='active') AS mrr_cents,
                  (SELECT COUNT(*) FROM projects WHERE client_id=? AND archived=0) AS project_count`,
          id, id, id, id,
        ),
      ]);
    return json({ client, projects, websites, invoices, agreements, activities, tasks, plans, documents, portal_user: portalUser, totals });
  });

  app.patch('/clients/:id', async (c) => {
    const user = guardStaff(c);
    if (user instanceof Response) return user;
    const id = Number(c.req.param('id'));
    const current = await one<Record<string, unknown>>(c.env.DB, 'SELECT * FROM clients WHERE id = ?', id);
    if (!current) return fail(404, 'Client not found.');
    const body = await readBody(c);
    const name = str(body, 'name', 160) || String(current.name);
    const status = str(body, 'status', 40);
    const tags = csvList(body, 'tags');
    await run(
      c.env.DB,
      `UPDATE clients SET name=?, company=?, email=?, phone=?, address=?, category=?, preferred_contact=?,
        status=?, notes=?, lead_source=?, inquiry_date=?, services_discussed=?, tags=?, acquired_at=?,
        archived=?, updated_at=? WHERE id=?`,
      name,
      nullable(body, 'company', 160) ?? (current.company as string | null),
      body.email === undefined ? (current.email as string | null) : emailField(body, 'email'),
      nullable(body, 'phone', 40) ?? (current.phone as string | null),
      nullable(body, 'address', 400) ?? (current.address as string | null),
      nullable(body, 'category', 60) ?? (current.category as string | null),
      str(body, 'preferred_contact', 20) || String(current.preferred_contact ?? 'email'),
      CLIENT_STATUSES.includes(status) ? status : String(current.status),
      body.notes === undefined ? (current.notes as string | null) : nullable(body, 'notes', 8000),
      nullable(body, 'lead_source', 80) ?? (current.lead_source as string | null),
      dateField(body, 'inquiry_date') ?? (current.inquiry_date as string | null),
      nullable(body, 'services_discussed', 400) ?? (current.services_discussed as string | null),
      tags ?? (current.tags as string | null),
      dateField(body, 'acquired_at') ?? (current.acquired_at as string | null),
      boolField(body, 'archived', Boolean(current.archived)) ? 1 : 0,
      nowIso(),
      id,
    );
    if (tags !== null) await syncTags(c.env.DB, id, tags);
    await audit(c, 'client.updated', 'client', id, { name });
    return json({ ok: true });
  });

  app.delete('/clients/:id', async (c) => {
    const user = guardAdmin(c);
    if (user instanceof Response) return user;
    const id = Number(c.req.param('id'));
    await run(c.env.DB, 'DELETE FROM clients WHERE id = ?', id);
    await audit(c, 'client.deleted', 'client', id, null);
    return json({ ok: true });
  });

  app.post('/clients/:id/activity', async (c) => {
    const user = guardStaff(c);
    if (user instanceof Response) return user;
    const id = Number(c.req.param('id'));
    const body = await readBody(c);
    const subject = str(body, 'subject', 200);
    if (!subject) return fail(422, 'Enter a subject.', { subject: 'Required.' });
    const visibility = str(body, 'visibility', 20) === 'client' ? 'client' : 'internal';
    const activityId = await insert(
      c.env.DB,
      `INSERT INTO activities(client_id, lead_id, project_id, website_id, type, subject, body, happened_at, visibility, created_by, created_at)
       VALUES(?,?,?,?,?,?,?,?,?,?,?)`,
      id,
      null,
      body.project_id ? Number(body.project_id) : null,
      body.website_id ? Number(body.website_id) : null,
      str(body, 'type', 30) || 'note',
      subject,
      nullable(body, 'body', 8000),
      datetimeField(body, 'happened_at') ?? nowIso(),
      visibility,
      user.id,
      nowIso(),
    );
    await audit(c, 'activity.created', 'client', id, { subject });
    return json({ id: activityId }, 201);
  });

  app.post('/clients/:id/portal', async (c) => {
    const user = guardAdmin(c);
    if (user instanceof Response) return user;
    const id = Number(c.req.param('id'));
    const client = await one<{ name: string }>(c.env.DB, 'SELECT name FROM clients WHERE id = ?', id);
    if (!client) return fail(404, 'Client not found.');
    const body = await readBody(c);
    const email = emailField(body, 'email');
    const password = str(body, 'password', 400);
    const name = str(body, 'name', 120) || client.name;
    if (!email) return fail(422, 'Enter a valid email address.', { email: 'Required.' });
    if (password.length < 10) return fail(422, 'Use at least 10 characters.', { password: 'Too short.' });
    const existing = await one(c.env.DB, 'SELECT id FROM users WHERE email = ?', email);
    if (existing) return fail(409, 'An account with that email already exists.', { email: 'Already in use.' });
    const { hash, salt, iterations } = await hashPassword(password);
    const portalId = await insert(
      c.env.DB,
      `INSERT INTO users(email, name, role, client_id, password_hash, password_salt, iterations, status, created_at)
       VALUES(?,?,?,?,?,?,?,?,?)`,
      email, name, 'client', id, hash, salt, iterations, 'active', nowIso(),
    );
    await audit(c, 'portal_user.created', 'user', portalId, { client_id: id, email });
    return json({ id: portalId }, 201);
  });

  // ------------------------------------------------------------------ leads
  app.get('/leads', async (c) => {
    const user = guardStaff(c);
    if (user instanceof Response) return user;
    const { page, perPage, offset, q } = pageParams(c, 100);
    const stage = c.req.query('stage') ?? '';
    const where: string[] = [];
    const params: (string | number)[] = [];
    if (q) {
      where.push('(l.name LIKE ? OR l.company LIKE ? OR l.email LIKE ?)');
      params.push(like(q), like(q), like(q));
    }
    if (stage && LEAD_STAGES.includes(stage)) {
      where.push('l.stage = ?');
      params.push(stage);
    }
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const total = await scalar(c.env.DB, `SELECT COUNT(*) AS n FROM leads l ${clause}`, ...params);
    const leads = await all(
      c.env.DB,
      `SELECT l.*, (SELECT COUNT(*) FROM leads) AS _all FROM leads l ${clause}
        ORDER BY CASE l.stage WHEN 'lost' THEN 2 WHEN 'converted' THEN 1 ELSE 0 END, l.updated_at DESC LIMIT ? OFFSET ?`,
      ...params, perPage, offset,
    );
    const pipeline = await all<Record<string, unknown>>(
      c.env.DB,
      `SELECT stage, COUNT(*) AS count, COALESCE(SUM(est_value_cents),0) AS value_cents FROM leads GROUP BY stage`,
    );
    return json({ ...paged(leads, total, page, perPage), pipeline });
  });

  app.post('/leads', async (c) => {
    const user = guardStaff(c);
    if (user instanceof Response) return user;
    const body = await readBody(c);
    const name = str(body, 'name', 160);
    if (!name) return fail(422, 'Enter a lead name.', { name: 'Required.' });
    const stage = str(body, 'stage', 40);
    const id = await insert(
      c.env.DB,
      `INSERT INTO leads(client_id, name, company, email, phone, source, services, est_value_cents, recurring_cents,
        stage, probability, notes, next_follow_up, owner_id, created_at, updated_at)
       VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      null, name, nullable(body, 'company', 160), emailField(body, 'email'), nullable(body, 'phone', 40),
      nullable(body, 'source', 80), nullable(body, 'services', 400), Math.round(Number(body.est_value ?? 0) * 100),
      Math.round(Number(body.recurring ?? 0) * 100),
      LEAD_STAGES.includes(stage) ? stage : 'new_inquiry',
      Math.max(0, Math.min(100, Number(body.probability ?? 10))),
      nullable(body, 'notes', 8000), dateField(body, 'next_follow_up'), user.id, nowIso(), nowIso(),
    );
    await audit(c, 'lead.created', 'lead', id, { name });
    return json({ id }, 201);
  });

  app.patch('/leads/:id', async (c) => {
    const user = guardStaff(c);
    if (user instanceof Response) return user;
    const id = Number(c.req.param('id'));
    const current = await one<Record<string, unknown>>(c.env.DB, 'SELECT * FROM leads WHERE id = ?', id);
    if (!current) return fail(404, 'Lead not found.');
    const body = await readBody(c);
    const stage = str(body, 'stage', 40);
    await run(
      c.env.DB,
      `UPDATE leads SET name=?, company=?, email=?, phone=?, source=?, services=?, est_value_cents=?,
        recurring_cents=?, stage=?, probability=?, notes=?, next_follow_up=?, lost_reason=?, updated_at=? WHERE id=?`,
      str(body, 'name', 160) || String(current.name),
      nullable(body, 'company', 160) ?? (current.company as string | null),
      body.email === undefined ? (current.email as string | null) : emailField(body, 'email'),
      nullable(body, 'phone', 40) ?? (current.phone as string | null),
      nullable(body, 'source', 80) ?? (current.source as string | null),
      nullable(body, 'services', 400) ?? (current.services as string | null),
      body.est_value === undefined ? Number(current.est_value_cents) : Math.round(Number(body.est_value ?? 0) * 100),
      body.recurring === undefined ? Number(current.recurring_cents) : Math.round(Number(body.recurring ?? 0) * 100),
      LEAD_STAGES.includes(stage) ? stage : String(current.stage),
      body.probability === undefined ? Number(current.probability) : Math.max(0, Math.min(100, Number(body.probability))),
      body.notes === undefined ? (current.notes as string | null) : nullable(body, 'notes', 8000),
      dateField(body, 'next_follow_up') ?? (current.next_follow_up as string | null),
      body.lost_reason === undefined ? (current.lost_reason as string | null) : nullable(body, 'lost_reason', 400),
      nowIso(), id,
    );
    await audit(c, 'lead.updated', 'lead', id, { stage });
    return json({ ok: true });
  });

  app.post('/leads/:id/convert', async (c) => {
    const user = guardStaff(c);
    if (user instanceof Response) return user;
    const id = Number(c.req.param('id'));
    const lead = await one<Record<string, unknown>>(c.env.DB, 'SELECT * FROM leads WHERE id = ?', id);
    if (!lead) return fail(404, 'Lead not found.');
    if (lead.converted_client_id) return fail(409, 'This lead has already been converted.');
    const clientId = await insert(
      c.env.DB,
      `INSERT INTO clients(name, company, email, phone, category, preferred_contact, status, notes, lead_source,
        inquiry_date, services_discussed, acquired_at, archived, created_at, updated_at)
       VALUES(?,?,?,?,?,?,?,?,?,?,?,?,0,?,?)`,
      String(lead.name),
      lead.company == null ? null : String(lead.company),
      lead.email == null ? null : String(lead.email),
      lead.phone == null ? null : String(lead.phone),
      null, 'email', 'onboarding',
      lead.notes == null ? null : String(lead.notes),
      lead.source == null ? null : String(lead.source),
      String(lead.created_at ?? nowIso()),
      lead.services == null ? null : String(lead.services),
      today(), nowIso(), nowIso(),
    );
    await run(c.env.DB, `UPDATE leads SET stage='converted', converted_client_id=?, client_id=?, updated_at=? WHERE id=?`, clientId, clientId, nowIso(), id);
    await audit(c, 'lead.converted', 'lead', id, { client_id: clientId });
    return json({ client_id: clientId }, 201);
  });

  app.delete('/leads/:id', async (c) => {
    const user = guardAdmin(c);
    if (user instanceof Response) return user;
    await run(c.env.DB, 'DELETE FROM leads WHERE id = ?', Number(c.req.param('id')));
    return json({ ok: true });
  });

  // ------------------------------------------------------------------ tasks
  app.get('/tasks', async (c) => {
    const user = guardStaff(c);
    if (user instanceof Response) return user;
    const { page, perPage, offset, q } = pageParams(c, 50);
    const where: string[] = [];
    const params: (string | number)[] = [];
    const status = c.req.query('status') ?? '';
    if (status === 'open') where.push(`t.status IN ('open','in_progress','blocked')`);
    else if (TASK_STATUSES.includes(status)) { where.push('t.status = ?'); params.push(status); }
    if (c.req.query('mine') === '1') { where.push('t.assignee_id = ?'); params.push(user.id); }
    if (q) { where.push('t.title LIKE ?'); params.push(like(q)); }
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const total = await scalar(c.env.DB, `SELECT COUNT(*) AS n FROM tasks t ${clause}`, ...params);
    const data = await all(
      c.env.DB,
      `SELECT t.*, cl.name AS client_name, p.name AS project_name, w.name AS website_name
         FROM tasks t LEFT JOIN clients cl ON cl.id=t.client_id LEFT JOIN projects p ON p.id=t.project_id
         LEFT JOIN websites w ON w.id=t.website_id
       ${clause} ORDER BY CASE t.status WHEN 'blocked' THEN 0 WHEN 'in_progress' THEN 1 WHEN 'open' THEN 2 ELSE 3 END,
         t.due_date IS NULL, t.due_date LIMIT ? OFFSET ?`,
      ...params, perPage, offset,
    );
    return json(paged(data, total, page, perPage));
  });

  app.post('/tasks', async (c) => {
    const user = guardStaff(c);
    if (user instanceof Response) return user;
    const body = await readBody(c);
    const title = str(body, 'title', 200);
    if (!title) return fail(422, 'Enter a task title.', { title: 'Required.' });
    const status = str(body, 'status', 20);
    const id = await insert(
      c.env.DB,
      `INSERT INTO tasks(title, description, priority, category, due_date, status, client_id, project_id, website_id,
        assignee_id, recurrence, notes, created_at, updated_at)
       VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      title, nullable(body, 'description', 8000), str(body, 'priority', 20) || 'medium',
      str(body, 'category', 30) || 'operations', dateField(body, 'due_date'),
      TASK_STATUSES.includes(status) ? status : 'open',
      body.client_id ? Number(body.client_id) : null, body.project_id ? Number(body.project_id) : null,
      body.website_id ? Number(body.website_id) : null, body.assignee_id ? Number(body.assignee_id) : user.id,
      nullable(body, 'recurrence', 40), nullable(body, 'notes', 8000), nowIso(), nowIso(),
    );
    return json({ id }, 201);
  });

  app.patch('/tasks/:id', async (c) => {
    const user = guardStaff(c);
    if (user instanceof Response) return user;
    const id = Number(c.req.param('id'));
    const current = await one<Record<string, unknown>>(c.env.DB, 'SELECT * FROM tasks WHERE id = ?', id);
    if (!current) return fail(404, 'Task not found.');
    const body = await readBody(c);
    const status = str(body, 'status', 20);
    const next = TASK_STATUSES.includes(status) ? status : String(current.status);
    await run(
      c.env.DB,
      `UPDATE tasks SET title=?, description=?, priority=?, category=?, due_date=?, status=?, client_id=?,
        project_id=?, website_id=?, assignee_id=?, notes=?, completed_at=?, updated_at=? WHERE id=?`,
      str(body, 'title', 200) || String(current.title),
      body.description === undefined ? (current.description as string | null) : nullable(body, 'description', 8000),
      str(body, 'priority', 20) || String(current.priority),
      str(body, 'category', 30) || String(current.category),
      dateField(body, 'due_date') ?? (current.due_date as string | null),
      next,
      body.client_id === undefined ? (current.client_id as number | null) : body.client_id ? Number(body.client_id) : null,
      body.project_id === undefined ? (current.project_id as number | null) : body.project_id ? Number(body.project_id) : null,
      body.website_id === undefined ? (current.website_id as number | null) : body.website_id ? Number(body.website_id) : null,
      body.assignee_id === undefined ? (current.assignee_id as number | null) : body.assignee_id ? Number(body.assignee_id) : null,
      body.notes === undefined ? (current.notes as string | null) : nullable(body, 'notes', 8000),
      next === 'done' ? nowIso() : null,
      nowIso(), id,
    );
    return json({ ok: true });
  });

  app.delete('/tasks/:id', async (c) => {
    const user = guardStaff(c);
    if (user instanceof Response) return user;
    await run(c.env.DB, 'DELETE FROM tasks WHERE id = ?', Number(c.req.param('id')));
    return json({ ok: true });
  });

  // ------------------------------------------------------------------ calendar
  app.get('/calendar', async (c) => {
    const user = guardStaff(c);
    if (user instanceof Response) return user;
    const from = c.req.query('from') ?? `${today().slice(0, 7)}-01`;
    const to = c.req.query('to') ?? `${today().slice(0, 7)}-31`;
    const events = await all(
      c.env.DB,
      `SELECT e.*, cl.name AS client_name, p.name AS project_name FROM calendar_events e
         LEFT JOIN clients cl ON cl.id=e.client_id LEFT JOIN projects p ON p.id=e.project_id
        WHERE date(e.starts_at) BETWEEN ? AND ? ORDER BY e.starts_at`,
      from, to,
    );
    return json({ from, to, events });
  });

  app.post('/calendar', async (c) => {
    const user = guardStaff(c);
    if (user instanceof Response) return user;
    const body = await readBody(c);
    const title = str(body, 'title', 200);
    const starts = datetimeField(body, 'starts_at');
    if (!title) return fail(422, 'Enter an event title.', { title: 'Required.' });
    if (!starts) return fail(422, 'Choose a start date.', { starts_at: 'Required.' });
    const id = await insert(
      c.env.DB,
      `INSERT INTO calendar_events(title, type, client_id, project_id, website_id, starts_at, ends_at, all_day,
        location, notes, visibility, created_by, created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      title, str(body, 'type', 30) || 'meeting',
      body.client_id ? Number(body.client_id) : null, body.project_id ? Number(body.project_id) : null,
      body.website_id ? Number(body.website_id) : null, starts, datetimeField(body, 'ends_at'),
      boolField(body, 'all_day') ? 1 : 0, nullable(body, 'location', 300), nullable(body, 'notes', 4000),
      str(body, 'visibility', 20) === 'client' ? 'client' : 'internal', user.id, nowIso(),
    );
    return json({ id }, 201);
  });

  app.patch('/calendar/:id', async (c) => {
    const user = guardStaff(c);
    if (user instanceof Response) return user;
    const id = Number(c.req.param('id'));
    const current = await one<Record<string, unknown>>(c.env.DB, 'SELECT * FROM calendar_events WHERE id = ?', id);
    if (!current) return fail(404, 'Event not found.');
    const body = await readBody(c);
    await run(
      c.env.DB,
      `UPDATE calendar_events SET title=?, type=?, starts_at=?, ends_at=?, all_day=?, location=?, notes=?, visibility=?
        WHERE id=?`,
      str(body, 'title', 200) || String(current.title),
      str(body, 'type', 30) || String(current.type),
      datetimeField(body, 'starts_at') ?? String(current.starts_at),
      datetimeField(body, 'ends_at') ?? (current.ends_at as string | null),
      boolField(body, 'all_day', Boolean(current.all_day)) ? 1 : 0,
      nullable(body, 'location', 300) ?? (current.location as string | null),
      nullable(body, 'notes', 4000) ?? (current.notes as string | null),
      str(body, 'visibility', 20) === 'client' ? 'client' : 'internal',
      id,
    );
    return json({ ok: true });
  });

  app.delete('/calendar/:id', async (c) => {
    const user = guardStaff(c);
    if (user instanceof Response) return user;
    await run(c.env.DB, 'DELETE FROM calendar_events WHERE id = ?', Number(c.req.param('id')));
    return json({ ok: true });
  });

  // ------------------------------------------------------------------ documents
  app.get('/documents', async (c) => {
    const user = guardStaff(c);
    if (user instanceof Response) return user;
    const clientId = Number(c.req.query('client_id') ?? 0);
    const rowsData = await all(
      c.env.DB,
      `SELECT d.*, cl.name AS client_name, u.name AS uploader FROM documents d
         LEFT JOIN clients cl ON cl.id=d.client_id LEFT JOIN users u ON u.id=d.uploaded_by
        ${clientId ? 'WHERE d.client_id = ?' : ''} ORDER BY d.created_at DESC LIMIT 200`,
      ...(clientId ? [clientId] : []),
    );
    return json({ rows: rowsData });
  });

  app.post('/documents', async (c) => {
    const user = guardStaff(c);
    if (user instanceof Response) return user;
    const form = await c.req.parseBody();
    const file = form.file;
    if (!(file instanceof File) || file.size === 0) return fail(422, 'Choose a file to upload.');
    if (file.size > 20 * 1024 * 1024) return fail(413, 'Files must be 20 MB or smaller.');
    const allowed = ['pdf', 'png', 'jpg', 'jpeg', 'webp', 'gif', 'svg', 'txt', 'md', 'csv', 'doc', 'docx', 'xls', 'xlsx', 'zip', 'json'];
    const ext = (file.name.split('.').pop() ?? '').toLowerCase();
    if (!allowed.includes(ext)) return fail(415, 'That file type is not accepted.');
    const name = String(form.name ?? file.name).slice(0, 200);
    const key = `documents/${randomToken(12)}.${ext}`;
    await c.env.FILES.put(key, file.stream(), {
      httpMetadata: { contentType: file.type || 'application/octet-stream' },
    });
    const category = String(form.category ?? 'general').slice(0, 40);
    const visibility = String(form.visibility ?? 'internal') === 'client' ? 'client' : 'internal';
    const id = await insert(
      c.env.DB,
      `INSERT INTO documents(client_id, project_id, website_id, name, category, content_type, size_bytes, r2_key,
        visibility, uploaded_by, created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)`,
      form.client_id ? Number(form.client_id) : null,
      form.project_id ? Number(form.project_id) : null,
      form.website_id ? Number(form.website_id) : null,
      name, category, file.type || null, file.size, key, visibility, user.id, nowIso(),
    );
    await audit(c, 'document.uploaded', 'document', id, { name });
    return json({ id }, 201);
  });

  app.get('/documents/:id/download', async (c) => {
    const user = c.get('user');
    if (!user) return fail(401, 'Sign in to continue.');
    const id = Number(c.req.param('id'));
    const columns = 'r2_key, name, content_type, visibility, client_id';
    const doc = user.role === 'client'
      ? await ownedRow<{ r2_key: string; name: string; content_type: string | null; visibility: string; client_id: number | null }>(
          c, 'documents', id, user.client_id ?? 0, { columns, where: "AND visibility = 'client'" },
        )
      : await one<{ r2_key: string; name: string; content_type: string | null; visibility: string; client_id: number | null }>(
          c.env.DB, `SELECT ${columns} FROM documents WHERE id = ?`, id,
        );
    if (!doc) return fail(404, 'Document not found.');
    const object = await c.env.FILES.get(doc.r2_key);
    if (!object) return fail(410, 'The stored file is no longer available.');
    return new Response(object.body, {
      headers: {
        'content-type': doc.content_type ?? 'application/octet-stream',
        'content-disposition': `attachment; filename="${doc.name.replace(/[^a-zA-Z0-9._-]/g, '_')}"`,
        'cache-control': 'private, no-store',
      },
    });
  });

  app.delete('/documents/:id', async (c) => {
    const user = guardStaff(c);
    if (user instanceof Response) return user;
    const id = Number(c.req.param('id'));
    const doc = await one<{ r2_key: string }>(c.env.DB, 'SELECT r2_key FROM documents WHERE id = ?', id);
    if (!doc) return fail(404, 'Document not found.');
    await c.env.FILES.delete(doc.r2_key);
    await run(c.env.DB, 'DELETE FROM documents WHERE id = ?', id);
    return json({ ok: true });
  });

  // ------------------------------------------------------------------ search
  app.get('/search', async (c) => {
    const user = guardStaff(c);
    if (user instanceof Response) return user;
    const q = (c.req.query('q') ?? '').trim().slice(0, 80);
    if (q.length < 2) return json({ q, groups: [] });
    const term = like(q);
    const [clients, projects, websites, invoices, agreements, documents, leads] = await Promise.all([
      all(c.env.DB, `SELECT id, name, company, status FROM clients WHERE name LIKE ? OR company LIKE ? LIMIT 6`, term, term),
      all(c.env.DB, `SELECT id, name, status FROM projects WHERE name LIKE ? LIMIT 6`, term),
      all(c.env.DB, `SELECT id, name, domain, status FROM websites WHERE name LIKE ? OR domain LIKE ? LIMIT 6`, term, term),
      all(c.env.DB, `SELECT id, number, status FROM invoices WHERE number LIKE ? LIMIT 6`, term),
      all(c.env.DB, `SELECT id, number, title, status FROM agreements WHERE title LIKE ? OR number LIKE ? LIMIT 6`, term, term),
      all(c.env.DB, `SELECT id, name, category FROM documents WHERE name LIKE ? LIMIT 6`, term),
      all(c.env.DB, `SELECT id, name, company, stage FROM leads WHERE name LIKE ? OR company LIKE ? LIMIT 6`, term, term),
    ]);
    const groups = [
      { label: 'Clients', items: clients.map((r) => ({ id: Number(r.id), title: String(r.name), subtitle: String(r.company ?? r.status), href: `/admin/clients/${r.id}` })) },
      { label: 'Leads', items: leads.map((r) => ({ id: Number(r.id), title: String(r.name), subtitle: String(r.company ?? r.stage), href: `/admin/pipeline?lead=${r.id}` })) },
      { label: 'Projects', items: projects.map((r) => ({ id: Number(r.id), title: String(r.name), subtitle: String(r.status), href: `/admin/projects/${r.id}` })) },
      { label: 'Websites', items: websites.map((r) => ({ id: Number(r.id), title: String(r.name), subtitle: String(r.domain ?? r.status), href: `/admin/websites/${r.id}` })) },
      { label: 'Invoices', items: invoices.map((r) => ({ id: Number(r.id), title: String(r.number), subtitle: String(r.status), href: `/admin/invoices/${r.id}` })) },
      { label: 'Agreements', items: agreements.map((r) => ({ id: Number(r.id), title: String(r.title), subtitle: String(r.number), href: `/admin/agreements/${r.id}` })) },
      { label: 'Documents', items: documents.map((r) => ({ id: Number(r.id), title: String(r.name), subtitle: String(r.category), href: '/admin/documents' })) },
    ].filter((g) => g.items.length);
    return json({ q, groups });
  });

  return app;
}

async function syncTags(db: Db, clientId: number, tags: string | null): Promise<void> {
  await run(db, 'DELETE FROM client_tags WHERE client_id = ?', clientId);
  for (const tag of (tags ?? '').split(',').map((t) => t.trim()).filter(Boolean).slice(0, 40)) {
    await run(db, 'INSERT OR IGNORE INTO client_tags(client_id, tag) VALUES(?,?)', clientId, tag);
  }
}

export const PEOPLE_CONSTANTS = { CLIENT_STATUSES, LEAD_STAGES, TASK_STATUSES };

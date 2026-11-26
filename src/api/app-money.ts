// Agreements and invoices/payments.

import { Hono } from 'hono';
import type { AppVars } from '../lib/auth';
import { audit } from '../lib/auth';
import type { Env } from '../lib/db';
import {
  all, getSettings, insert, nextNumber, one, recalcInvoiceTotals, refreshInvoice, run, scalar,
} from '../lib/db';
import { addDays, nowIso, today } from '../lib/util';
import {
  dateField, fail, guardAdmin, guardStaff, json, like, moneyField, nullable, pageParams, paged, readBody, str,
} from './app-helpers';

const AGREEMENT_STATUSES = ['draft', 'sent', 'viewed', 'accepted', 'declined', 'expired', 'cancelled'];
const INVOICE_STATUSES = ['draft', 'unpaid', 'partially_paid', 'paid', 'overdue', 'cancelled', 'refunded'];

export function appMoneyRoutes() {
  const app = new Hono<{ Bindings: Env; Variables: AppVars }>();

  // ------------------------------------------------------------------ agreements
  app.get('/agreements', async (c) => {
    const user = guardStaff(c);
    if (user instanceof Response) return user;
    const { page, perPage, offset, q } = pageParams(c);
    const status = c.req.query('status') ?? '';
    const clientId = Number(c.req.query('client_id') ?? 0);
    const where = ['1=1'];
    const params: (string | number)[] = [];
    if (q) { where.push('(a.title LIKE ? OR a.number LIKE ? OR cl.name LIKE ?)'); params.push(like(q), like(q), like(q)); }
    if (AGREEMENT_STATUSES.includes(status)) { where.push('a.status = ?'); params.push(status); }
    if (clientId) { where.push('a.client_id = ?'); params.push(clientId); }
    const clause = where.join(' AND ');
    const total = await scalar(c.env.DB, `SELECT COUNT(*) AS n FROM agreements a JOIN clients cl ON cl.id=a.client_id WHERE ${clause}`, ...params);
    const rowsData = await all(
      c.env.DB,
      `SELECT a.*, cl.name AS client_name FROM agreements a JOIN clients cl ON cl.id=a.client_id
        WHERE ${clause} ORDER BY a.created_at DESC LIMIT ? OFFSET ?`,
      ...params, perPage, offset,
    );
    return json(paged(rowsData, total, page, perPage));
  });

  app.post('/agreements', async (c) => {
    const user = guardStaff(c);
    if (user instanceof Response) return user;
    const body = await readBody(c);
    const title = str(body, 'title', 200);
    const clientId = Number(body.client_id ?? 0);
    if (!title) return fail(422, 'Enter an agreement title.', { title: 'Required.' });
    if (!clientId) return fail(422, 'Choose a client.', { client_id: 'Required.' });
    const settings = await getSettings(c.env.DB);
    const number = await nextNumber(c.env.DB, settings.agreement_prefix || 'AGR', 'agreements');
    const id = await insert(
      c.env.DB,
      `INSERT INTO agreements(number, client_id, project_id, kind, title, status, body, scope, deliverables, amount_cents,
        deposit_cents, revision_limit, timeline, maintenance_terms, support_terms, client_responsibilities,
        cancellation_terms, extra_conditions, expires_at, portal_visible, created_at, updated_at)
       VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      number, clientId, body.project_id ? Number(body.project_id) : null,
      str(body, 'kind', 50) || 'development_contract', title, 'draft',
      nullable(body, 'body', 20000), nullable(body, 'scope', 8000), nullable(body, 'deliverables', 8000),
      moneyField(body, 'amount'), moneyField(body, 'deposit'), nullable(body, 'revision_limit', 120),
      nullable(body, 'timeline', 400), nullable(body, 'maintenance_terms', 4000), nullable(body, 'support_terms', 4000),
      nullable(body, 'client_responsibilities', 4000), nullable(body, 'cancellation_terms', 4000),
      nullable(body, 'extra_conditions', 4000), dateField(body, 'expires_at'),
      Number(body.portal_visible) === 0 ? 0 : 1, nowIso(), nowIso(),
    );
    await audit(c, 'agreement.created', 'agreement', id, { number });
    return json({ id, number }, 201);
  });

  app.get('/agreements/:id', async (c) => {
    const user = guardStaff(c);
    if (user instanceof Response) return user;
    const id = Number(c.req.param('id'));
    const agreement = await one<Record<string, unknown>>(c.env.DB, 'SELECT * FROM agreements WHERE id = ?', id);
    if (!agreement) return fail(404, 'Agreement not found.');
    const client = await one(c.env.DB, 'SELECT id, name, company, email FROM clients WHERE id=?', Number(agreement.client_id));
    const project = agreement.project_id
      ? await one(c.env.DB, 'SELECT id, name, status FROM projects WHERE id=?', Number(agreement.project_id))
      : null;
    return json({ agreement, client, project });
  });

  app.patch('/agreements/:id', async (c) => {
    const user = guardStaff(c);
    if (user instanceof Response) return user;
    const id = Number(c.req.param('id'));
    const cur = await one<Record<string, unknown>>(c.env.DB, 'SELECT * FROM agreements WHERE id=?', id);
    if (!cur) return fail(404, 'Agreement not found.');
    if (cur.accepted_at) return fail(409, 'An accepted agreement cannot be edited. Create a new revision instead.');
    const body = await readBody(c);
    const status = str(body, 'status', 30);
    await run(
      c.env.DB,
      `UPDATE agreements SET title=?, kind=?, body=?, scope=?, deliverables=?, amount_cents=?, deposit_cents=?,
        revision_limit=?, timeline=?, maintenance_terms=?, support_terms=?, client_responsibilities=?,
        cancellation_terms=?, extra_conditions=?, expires_at=?, status=?, portal_visible=?, updated_at=? WHERE id=?`,
      str(body, 'title', 200) || String(cur.title), str(body, 'kind', 50) || String(cur.kind),
      nullable(body, 'body', 20000) ?? (cur.body as string | null),
      nullable(body, 'scope', 8000) ?? (cur.scope as string | null),
      nullable(body, 'deliverables', 8000) ?? (cur.deliverables as string | null),
      body.amount === undefined ? Number(cur.amount_cents) : moneyField(body, 'amount'),
      body.deposit === undefined ? Number(cur.deposit_cents) : moneyField(body, 'deposit'),
      nullable(body, 'revision_limit', 120) ?? (cur.revision_limit as string | null),
      nullable(body, 'timeline', 400) ?? (cur.timeline as string | null),
      nullable(body, 'maintenance_terms', 4000) ?? (cur.maintenance_terms as string | null),
      nullable(body, 'support_terms', 4000) ?? (cur.support_terms as string | null),
      nullable(body, 'client_responsibilities', 4000) ?? (cur.client_responsibilities as string | null),
      nullable(body, 'cancellation_terms', 4000) ?? (cur.cancellation_terms as string | null),
      nullable(body, 'extra_conditions', 4000) ?? (cur.extra_conditions as string | null),
      dateField(body, 'expires_at') ?? (cur.expires_at as string | null),
      AGREEMENT_STATUSES.includes(status) ? status : String(cur.status),
      body.portal_visible === undefined ? Number(cur.portal_visible) : Number(body.portal_visible) === 0 ? 0 : 1,
      nowIso(), id,
    );
    return json({ ok: true });
  });

  app.post('/agreements/:id/send', async (c) => {
    const user = guardStaff(c);
    if (user instanceof Response) return user;
    const id = Number(c.req.param('id'));
    await run(c.env.DB, `UPDATE agreements SET status='sent', sent_at=?, updated_at=? WHERE id=? AND status IN ('draft','sent')`, nowIso(), nowIso(), id);
    await audit(c, 'agreement.sent', 'agreement', id, null);
    return json({ ok: true });
  });

  app.delete('/agreements/:id', async (c) => {
    const user = guardAdmin(c);
    if (user instanceof Response) return user;
    await run(c.env.DB, 'DELETE FROM agreements WHERE id=?', Number(c.req.param('id')));
    return json({ ok: true });
  });

  // ------------------------------------------------------------------ invoices
  app.get('/invoices', async (c) => {
    const user = guardStaff(c);
    if (user instanceof Response) return user;
    const { page, perPage, offset, q } = pageParams(c);
    const status = c.req.query('status') ?? '';
    const clientId = Number(c.req.query('client_id') ?? 0);
    const where = ['1=1'];
    const params: (string | number)[] = [];
    if (q) { where.push('(i.number LIKE ? OR cl.name LIKE ? OR i.description LIKE ?)'); params.push(like(q), like(q), like(q)); }
    if (INVOICE_STATUSES.includes(status)) { where.push('i.status = ?'); params.push(status); }
    if (clientId) { where.push('i.client_id = ?'); params.push(clientId); }
    const clause = where.join(' AND ');
    const total = await scalar(c.env.DB, `SELECT COUNT(*) AS n FROM invoices i JOIN clients cl ON cl.id=i.client_id WHERE ${clause}`, ...params);
    const rowsData = await all(
      c.env.DB,
      `SELECT i.*, cl.name AS client_name FROM invoices i JOIN clients cl ON cl.id=i.client_id
        WHERE ${clause} ORDER BY i.created_at DESC LIMIT ? OFFSET ?`,
      ...params, perPage, offset,
    );
    const totals = await one<Record<string, number>>(
      c.env.DB,
      `SELECT COALESCE(SUM(CASE WHEN i.status NOT IN ('draft','cancelled') THEN i.total_cents ELSE 0 END),0) AS invoiced_cents,
              COALESCE(SUM(CASE WHEN i.status NOT IN ('draft','cancelled') THEN i.paid_cents ELSE 0 END),0) AS collected_cents,
              COALESCE(SUM(CASE WHEN i.status IN ('unpaid','partially_paid','overdue') THEN i.total_cents-i.paid_cents ELSE 0 END),0) AS outstanding_cents
         FROM invoices i`,
    );
    return json({ ...paged(rowsData, total, page, perPage), totals });
  });

  app.post('/invoices', async (c) => {
    const user = guardStaff(c);
    if (user instanceof Response) return user;
    const body = await readBody(c);
    const clientId = Number(body.client_id ?? 0);
    if (!clientId) return fail(422, 'Choose a client.', { client_id: 'Required.' });
    const settings = await getSettings(c.env.DB);
    const number = await nextNumber(c.env.DB, settings.invoice_prefix || 'INV', 'invoices');
    const termDays = Number(settings.payment_terms_days || 14);
    const id = await insert(
      c.env.DB,
      `INSERT INTO invoices(number, client_id, project_id, kind, description, subtotal_cents, tax_cents, discount_cents,
        total_cents, paid_cents, status, issue_date, due_date, notes, portal_visible, created_at, updated_at)
       VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      number, clientId, body.project_id ? Number(body.project_id) : null,
      str(body, 'kind', 40) || 'development', nullable(body, 'description', 500),
      0, 0, moneyField(body, 'discount'), 0, 0, 'draft', today(), addDays(today(), termDays),
      nullable(body, 'notes', 4000), Number(body.portal_visible) === 0 ? 0 : 1, nowIso(), nowIso(),
    );
    const items = Array.isArray(body.items) ? body.items : [];
    for (const raw of items.slice(0, 60)) {
      const item = raw as Record<string, unknown>;
      const description = String(item.description ?? '').slice(0, 300);
      if (!description) continue;
      const qty = Math.max(0, Number(item.qty ?? 1));
      const unit = Math.round(Number(item.unit_price ?? 0) * 100);
      await insert(
        c.env.DB,
        `INSERT INTO invoice_items(invoice_id, description, qty, unit_price_cents, amount_cents, sort) VALUES(?,?,?,?,?,?)`,
        id, description, qty, unit, Math.round(qty * unit), 0,
      );
    }
    await recalcInvoiceTotals(c.env.DB, id);
    await audit(c, 'invoice.created', 'invoice', id, { number });
    return json({ id, number }, 201);
  });

  app.get('/invoices/:id', async (c) => {
    const user = guardStaff(c);
    if (user instanceof Response) return user;
    const id = Number(c.req.param('id'));
    const invoice = await one<Record<string, unknown>>(c.env.DB, 'SELECT * FROM invoices WHERE id=?', id);
    if (!invoice) return fail(404, 'Invoice not found.');
    const [client, items, payments, project] = await Promise.all([
      one(c.env.DB, 'SELECT id, name, company, email, address FROM clients WHERE id=?', Number(invoice.client_id)),
      all(c.env.DB, 'SELECT * FROM invoice_items WHERE invoice_id=? ORDER BY sort, id', id),
      all(c.env.DB, 'SELECT * FROM payments WHERE invoice_id=? ORDER BY paid_at DESC', id),
      invoice.project_id ? one(c.env.DB, 'SELECT id, name FROM projects WHERE id=?', Number(invoice.project_id)) : null,
    ]);
    return json({ invoice, client, items, payments, project });
  });

  app.patch('/invoices/:id', async (c) => {
    const user = guardStaff(c);
    if (user instanceof Response) return user;
    const id = Number(c.req.param('id'));
    const cur = await one<Record<string, unknown>>(c.env.DB, 'SELECT * FROM invoices WHERE id=?', id);
    if (!cur) return fail(404, 'Invoice not found.');
    if (cur.status === 'paid' || cur.status === 'refunded') {
      return fail(409, 'Paid invoices are locked. Record an adjustment instead.');
    }
    const body = await readBody(c);
    const status = str(body, 'status', 30);
    await run(
      c.env.DB,
      `UPDATE invoices SET description=?, discount_cents=?, status=?, issue_date=?, due_date=?, notes=?, portal_visible=?, updated_at=? WHERE id=?`,
      body.description === undefined ? (cur.description as string | null) : nullable(body, 'description', 500),
      body.discount === undefined ? Number(cur.discount_cents) : moneyField(body, 'discount'),
      INVOICE_STATUSES.includes(status) ? status : String(cur.status),
      dateField(body, 'issue_date') ?? (cur.issue_date as string | null),
      dateField(body, 'due_date') ?? (cur.due_date as string | null),
      body.notes === undefined ? (cur.notes as string | null) : nullable(body, 'notes', 4000),
      body.portal_visible === undefined ? Number(cur.portal_visible) : Number(body.portal_visible) === 0 ? 0 : 1,
      nowIso(), id,
    );
    await recalcInvoiceTotals(c.env.DB, id);
    return json({ ok: true });
  });

  app.post('/invoices/:id/send', async (c) => {
    const user = guardStaff(c);
    if (user instanceof Response) return user;
    const id = Number(c.req.param('id'));
    const inv = await one<{ status: string; total_cents: number }>(c.env.DB, 'SELECT status, total_cents FROM invoices WHERE id=?', id);
    if (!inv) return fail(404, 'Invoice not found.');
    if (inv.total_cents <= 0) return fail(422, 'Add line items before sending this invoice.');
    await run(c.env.DB, `UPDATE invoices SET status='unpaid', issue_date=COALESCE(issue_date, ?), updated_at=? WHERE id=?`, today(), nowIso(), id);
    await refreshInvoice(c.env.DB, id);
    return json({ ok: true });
  });

  app.delete('/invoices/:id', async (c) => {
    const user = guardAdmin(c);
    if (user instanceof Response) return user;
    await run(c.env.DB, 'DELETE FROM invoices WHERE id=?', Number(c.req.param('id')));
    return json({ ok: true });
  });

  app.post('/invoices/:id/items', async (c) => {
    const user = guardStaff(c);
    if (user instanceof Response) return user;
    const id = Number(c.req.param('id'));
    const inv = await one<{ status: string }>(c.env.DB, 'SELECT status FROM invoices WHERE id=?', id);
    if (!inv) return fail(404, 'Invoice not found.');
    if (inv.status === 'paid') return fail(409, 'Paid invoices are locked.');
    const body = await readBody(c);
    const description = str(body, 'description', 300);
    if (!description) return fail(422, 'Enter a line description.', { description: 'Required.' });
    const qty = Math.max(0, Number(body.qty ?? 1));
    const unit = moneyField(body, 'unit_price');
    const itemId = await insert(
      c.env.DB,
      `INSERT INTO invoice_items(invoice_id, description, qty, unit_price_cents, amount_cents, sort) VALUES(?,?,?,?,?,?)`,
      id, description, qty, unit, Math.round(qty * unit), 0,
    );
    await recalcInvoiceTotals(c.env.DB, id);
    return json({ id: itemId }, 201);
  });

  app.delete('/invoice-items/:id', async (c) => {
    const user = guardStaff(c);
    if (user instanceof Response) return user;
    const id = Number(c.req.param('id'));
    const item = await one<{ invoice_id: number }>(c.env.DB, 'SELECT invoice_id FROM invoice_items WHERE id=?', id);
    if (!item) return fail(404, 'Line item not found.');
    await run(c.env.DB, 'DELETE FROM invoice_items WHERE id=?', id);
    await recalcInvoiceTotals(c.env.DB, item.invoice_id);
    return json({ ok: true });
  });

  app.post('/invoices/:id/payments', async (c) => {
    const user = guardStaff(c);
    if (user instanceof Response) return user;
    const id = Number(c.req.param('id'));
    const inv = await one<{ total_cents: number; paid_cents: number }>(c.env.DB, 'SELECT total_cents, paid_cents FROM invoices WHERE id=?', id);
    if (!inv) return fail(404, 'Invoice not found.');
    const body = await readBody(c);
    const amount = moneyField(body, 'amount');
    if (amount <= 0) return fail(422, 'Enter a payment amount.', { amount: 'Required.' });
    const status = str(body, 'status', 20) === 'pending' ? 'pending' : 'confirmed';
    if (status === 'confirmed' && amount + inv.paid_cents > inv.total_cents) {
      return fail(422, 'That payment exceeds the invoice balance.', { amount: 'Too large.' });
    }
    const paymentId = await insert(
      c.env.DB,
      `INSERT INTO payments(invoice_id, client_id, amount_cents, paid_at, method, reference, notes, status, source, recorded_by, created_at)
       SELECT ?, client_id, ?, ?, ?, ?, ?, ?, 'manual', ?, ? FROM invoices WHERE id=?`,
      id, amount, dateField(body, 'paid_at') ?? today(), str(body, 'method', 40) || 'bank_transfer',
      nullable(body, 'reference', 120), nullable(body, 'notes', 1000), status, user.id, nowIso(), id,
    );
    await refreshInvoice(c.env.DB, id);
    await audit(c, 'payment.recorded', 'invoice', id, { amount_cents: amount, status });
    return json({ id: paymentId }, 201);
  });

  app.post('/payments/:id/confirm', async (c) => {
    const user = guardStaff(c);
    if (user instanceof Response) return user;
    const id = Number(c.req.param('id'));
    const payment = await one<{ invoice_id: number }>(c.env.DB, 'SELECT invoice_id FROM payments WHERE id=?', id);
    if (!payment) return fail(404, 'Payment not found.');
    await run(c.env.DB, `UPDATE payments SET status='confirmed' WHERE id=?`, id);
    await refreshInvoice(c.env.DB, payment.invoice_id);
    await audit(c, 'payment.confirmed', 'invoice', payment.invoice_id, { payment_id: id });
    return json({ ok: true });
  });

  app.delete('/payments/:id', async (c) => {
    const user = guardAdmin(c);
    if (user instanceof Response) return user;
    const id = Number(c.req.param('id'));
    const payment = await one<{ invoice_id: number }>(c.env.DB, 'SELECT invoice_id FROM payments WHERE id=?', id);
    if (!payment) return fail(404, 'Payment not found.');
    await run(c.env.DB, 'DELETE FROM payments WHERE id=?', id);
    await refreshInvoice(c.env.DB, payment.invoice_id);
    return json({ ok: true });
  });

  return app;
}

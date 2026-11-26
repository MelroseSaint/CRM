// Thin, typed data-access helpers over a small SQL database interface.
//
// The same helpers run on Cloudflare D1 (Worker) and on libSQL/SQLite (Node and
// Vercel) because both expose the prepare/bind/all/first/run shape declared here.

export interface DbStatement {
  bind(...values: unknown[]): DbStatement;
  all<T = Record<string, unknown>>(): Promise<{ results?: T[] }>;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  run(): Promise<{ success?: boolean; meta?: { last_row_id?: number; changes?: number } }>;
}

export interface Db {
  prepare(sql: string): DbStatement;
}

export interface StoredFile {
  body: ReadableStream;
  size?: number;
  httpMetadata?: { contentType?: string };
}

export interface FileStore {
  put(
    key: string,
    value: ReadableStream | ArrayBuffer | Uint8Array,
    options?: { httpMetadata?: { contentType?: string } },
  ): Promise<unknown>;
  get(key: string): Promise<StoredFile | null>;
  delete(key: string): Promise<unknown>;
}

export interface AssetStore {
  fetch(input: Request | string): Promise<Response>;
}

export interface Env {
  DB: Db;
  FILES: FileStore;
  APP_NAME?: string;
  APP_ENV?: string;
  ASSETS?: AssetStore;
}

export type Param = string | number | null | Uint8Array | ArrayBuffer;

export async function all<T = Record<string, unknown>>(
  db: Db,
  sql: string,
  ...params: Param[]
): Promise<T[]> {
  const stmt = db.prepare(sql);
  const bound = params.length ? stmt.bind(...params) : stmt;
  const res = await bound.all<T>();
  return res.results ?? [];
}

export async function one<T = Record<string, unknown>>(
  db: Db,
  sql: string,
  ...params: Param[]
): Promise<T | null> {
  const stmt = db.prepare(sql);
  const bound = params.length ? stmt.bind(...params) : stmt;
  return (await bound.first<T>()) ?? null;
}

export async function run(
  db: Db,
  sql: string,
  ...params: Param[]
): Promise<{ success?: boolean; meta?: { last_row_id?: number; changes?: number } }> {
  const stmt = db.prepare(sql);
  const bound = params.length ? stmt.bind(...params) : stmt;
  return bound.run();
}

export async function insert(db: Db, sql: string, ...params: Param[]): Promise<number> {
  const res = await run(db, sql, ...params);
  return Number(res.meta?.last_row_id ?? 0);
}

export async function scalar(db: Db, sql: string, ...params: Param[]): Promise<number> {
  const row = await one<Record<string, number>>(db, sql, ...params);
  if (!row) return 0;
  const first = Object.values(row)[0];
  return Number(first ?? 0);
}

export async function getSettings(db: Db): Promise<Record<string, string>> {
  const rows = await all<{ key: string; value: string }>(db, 'SELECT key, value FROM settings');
  const out: Record<string, string> = {};
  for (const r of rows) out[r.key] = r.value;
  return out;
}

export async function setSetting(db: Db, key: string, value: string): Promise<void> {
  await run(
    db,
    'INSERT INTO settings(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    key,
    value,
  );
}

/** Recomputes invoice status from payments and due date. Never trusts a client claim of payment. */
export async function refreshInvoice(db: Db, invoiceId: number): Promise<void> {
  const inv = await one<{ id: number; total_cents: number; due_date: string | null; status: string }>(
    db,
    'SELECT id, total_cents, due_date, status FROM invoices WHERE id = ?',
    invoiceId,
  );
  if (!inv) return;
  const paid = await scalar(
    db,
    "SELECT COALESCE(SUM(amount_cents), 0) AS s FROM payments WHERE invoice_id = ? AND status = 'confirmed'",
    invoiceId,
  );
  let status = inv.status;
  if (status !== 'cancelled' && status !== 'refunded' && status !== 'draft') {
    if (paid >= inv.total_cents && inv.total_cents > 0) status = 'paid';
    else if (inv.due_date && inv.due_date < new Date().toISOString().slice(0, 10)) status = 'overdue';
    // Only confirmed money moves the invoice status. A pending payment is a claim awaiting
    // verification: it is shown on the invoice but must not read as money received.
    else if (paid > 0) status = 'partially_paid';
    else status = 'unpaid';
  }
  await run(
    db,
    'UPDATE invoices SET paid_cents = ?, status = ?, updated_at = ? WHERE id = ?',
    paid,
    status,
    new Date().toISOString(),
    invoiceId,
  );
}

export async function recalcInvoiceTotals(db: Db, invoiceId: number): Promise<void> {
  const items = await all<{ amount_cents: number }>(
    db,
    'SELECT amount_cents FROM invoice_items WHERE invoice_id = ?',
    invoiceId,
  );
  const subtotal = items.reduce((s, i) => s + i.amount_cents, 0);
  const inv = await one<{ discount_cents: number }>(db, 'SELECT discount_cents FROM invoices WHERE id = ?', invoiceId);
  const taxRate = Number((await getSettings(db)).tax_rate ?? 0) / 100;
  const taxable = Math.max(0, subtotal - (inv?.discount_cents ?? 0));
  const tax = Math.round(taxable * taxRate);
  await run(
    db,
    'UPDATE invoices SET subtotal_cents = ?, tax_cents = ?, total_cents = ?, updated_at = ? WHERE id = ?',
    subtotal,
    tax,
    taxable + tax,
    new Date().toISOString(),
    invoiceId,
  );
  await refreshInvoice(db, invoiceId);
}

export async function nextNumber(db: Db, prefix: string, table: 'invoices' | 'agreements'): Promise<string> {
  const year = new Date().getUTCFullYear();
  const like = `${prefix}-${year}-%`;
  const n = await scalar(db, `SELECT COUNT(*) AS c FROM ${table} WHERE number LIKE ?`, like);
  let seq = n + 1;
  // guarantee uniqueness even after deletions
  for (let i = 0; i < 100; i++) {
    const candidate = `${prefix}-${year}-${String(seq).padStart(4, '0')}`;
    const exists = await one(db, `SELECT 1 AS x FROM ${table} WHERE number = ?`, candidate);
    if (!exists) return candidate;
    seq += 1;
  }
  return `${prefix}-${year}-${Date.now().toString().slice(-6)}`;
}

/** Mark overdue invoices. Safe to run repeatedly. */
export async function sweepOverdueInvoices(db: Db): Promise<number> {
  const iso = new Date().toISOString().slice(0, 10);
  const res = await run(
    db,
    `UPDATE invoices SET status = 'overdue', updated_at = ?
      WHERE status IN ('unpaid','partially_paid') AND due_date IS NOT NULL AND due_date < ?
        AND (total_cents - paid_cents) > 0`,
    new Date().toISOString(),
    iso,
  );
  return res.meta?.changes ?? 0;
}

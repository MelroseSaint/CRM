// Small option-list queries reused by forms across modules.

import { all, Db} from './db';

export async function clientOptions(db: Db, includeAll = false): Promise<{ value: string; label: string }[]> {
  const rows = await all<{ id: number; name: string; company: string | null; status: string }>(
    db,
    `SELECT id, name, company, status FROM clients ${includeAll ? '' : "WHERE status <> 'former_client'"} ORDER BY name COLLATE NOCASE`,
  );
  return rows.map((r) => ({ value: String(r.id), label: `${r.name}${r.company ? ` — ${r.company}` : ''}` }));
}

export async function projectOptions(db: Db, clientId?: number | null): Promise<{ value: string; label: string }[]> {
  const rows = clientId
    ? await all<{ id: number; name: string; client_name: string }>(
        db,
        `SELECT p.id, p.name, c.name AS client_name FROM projects p JOIN clients c ON c.id=p.client_id
          WHERE p.client_id=? ORDER BY p.created_at DESC`,
        clientId,
      )
    : await all<{ id: number; name: string; client_name: string }>(
        db,
        `SELECT p.id, p.name, c.name AS client_name FROM projects p JOIN clients c ON c.id=p.client_id
          ORDER BY p.created_at DESC LIMIT 300`,
      );
  return rows.map((r) => ({ value: String(r.id), label: `${r.name} — ${r.client_name}` }));
}

export async function websiteOptions(db: Db, clientId?: number | null): Promise<{ value: string; label: string }[]> {
  const rows = clientId
    ? await all<{ id: number; name: string; domain: string | null; client_name: string }>(
        db,
        `SELECT w.id, w.name, w.domain, c.name AS client_name FROM websites w JOIN clients c ON c.id=w.client_id
          WHERE w.client_id=? ORDER BY w.name`,
        clientId,
      )
    : await all<{ id: number; name: string; domain: string | null; client_name: string }>(
        db,
        `SELECT w.id, w.name, w.domain, c.name AS client_name FROM websites w JOIN clients c ON c.id=w.client_id
          ORDER BY w.name LIMIT 300`,
      );
  return rows.map((r) => ({ value: String(r.id), label: `${r.name}${r.domain ? ` (${r.domain})` : ''} — ${r.client_name}` }));
}

export async function invoiceOptions(db: Db, clientId?: number | null): Promise<{ value: string; label: string }[]> {
  const rows = clientId
    ? await all<{ id: number; number: string; total_cents: number; status: string }>(
        db, `SELECT id, number, total_cents, status FROM invoices WHERE client_id=? ORDER BY created_at DESC`, clientId,
      )
    : await all<{ id: number; number: string; total_cents: number; status: string }>(
        db, `SELECT id, number, total_cents, status FROM invoices ORDER BY created_at DESC LIMIT 200`,
      );
  return rows.map((r) => ({ value: String(r.id), label: `${r.number} (${r.status})` }));
}

export async function staffOptions(db: Db): Promise<{ value: string; label: string }[]> {
  const rows = await all<{ id: number; name: string; role: string }>(
    db, `SELECT id, name, role FROM users WHERE role IN ('admin','staff') AND status='active' ORDER BY name`,
  );
  return rows.map((r) => ({ value: String(r.id), label: `${r.name} (${r.role})` }));
}

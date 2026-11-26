// Request helpers shared by HTML routes: flash redirects, form parsing, pagination, nav counts.

import type { AppContext } from './auth';
import { all, one, scalar, type Env, Db} from './db';
import { clamp, toInt } from './util';

export interface Flash {
  kind: string;
  msg: string;
}

export function readFlash(c: AppContext): Flash | null {
  const ok = c.req.query('ok');
  const err = c.req.query('err');
  const info = c.req.query('info');
  const warn = c.req.query('warn');
  if (ok) return { kind: 'ok', msg: ok };
  if (err) return { kind: 'err', msg: err };
  if (warn) return { kind: 'warn', msg: warn };
  if (info) return { kind: 'info', msg: info };
  return null;
}

export function flashPath(path: string, kind: 'ok' | 'err' | 'info' | 'warn', msg: string): string {
  const sep = path.includes('?') ? '&' : '?';
  return `${path}${sep}${kind}=${encodeURIComponent(msg)}`;
}

export function backTo(c: AppContext, fallback: string): string {
  const ref = c.req.header('referer');
  if (!ref) return fallback;
  try {
    const u = new URL(ref);
    if (u.host !== new URL(c.req.url).host) return fallback;
    return `${u.pathname}${u.search}`;
  } catch {
    return fallback;
  }
}

export type FormValues = Record<string, string>;

/** Parses urlencoded or multipart body into string values (first value wins). */
export async function readForm(c: AppContext): Promise<{ values: FormValues; files: Record<string, File> }> {
  const body = await c.req.parseBody();
  const values: FormValues = {};
  const files: Record<string, File> = {};
  for (const [key, value] of Object.entries(body)) {
    if (value instanceof File) {
      if (value.size > 0) files[key] = value;
    } else if (Array.isArray(value)) {
      values[key] = String(value[0] ?? '');
    } else {
      values[key] = value == null ? '' : String(value);
    }
  }
  return { values, files };
}

export function str(values: FormValues, key: string, max = 20_000): string {
  const v = values[key];
  if (typeof v !== 'string') return '';
  return v.trim().slice(0, max);
}

export function nullable(values: FormValues, key: string): string | null {
  const v = str(values, key);
  return v === '' ? null : v;
}

export function bool(values: FormValues, key: string): boolean {
  return values[key] === '1' || values[key] === 'on' || values[key] === 'true';
}

export function intField(values: FormValues, key: string, fallback = 0): number {
  return toInt(values[key], fallback);
}

export function dateField(values: FormValues, key: string): string | null {
  const v = str(values, key);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  return v;
}

export function datetimeField(values: FormValues, key: string): string | null {
  const v = str(values, key);
  if (!v) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

export function emailField(values: FormValues, key: string): string | null {
  const v = str(values, key).toLowerCase();
  if (!v) return null;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? v : null;
}

export function urlField(values: FormValues, key: string): string | null {
  const v = str(values, key);
  if (!v) return null;
  try {
    const u = new URL(v.includes('://') ? v : `https://${v}`);
    if (!['http:', 'https:'].includes(u.protocol)) return null;
    return u.toString();
  } catch {
    return null;
  }
}

export function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export interface PageParams {
  page: number;
  perPage: number;
  offset: number;
  search: string;
  params: Record<string, string>;
}

export function pageParams(c: AppContext, defaultPerPage = 25): PageParams {
  const page = clamp(toInt(c.req.query('page'), 1), 1, 10_000);
  const perPage = clamp(toInt(c.req.query('per_page'), defaultPerPage), 10, 100);
  const search = (c.req.query('q') ?? '').trim().slice(0, 120);
  const params: Record<string, string> = {};
  for (const [k, v] of new URL(c.req.url).searchParams) {
    if (['page', 'ok', 'err', 'info', 'warn'].includes(k)) continue;
    params[k] = v.slice(0, 160);
  }
  return { page, perPage, offset: (page - 1) * perPage, search, params };
}

export function totalPages(total: number, perPage: number): number {
  return Math.max(1, Math.ceil(total / perPage));
}

export async function navCounts(db: Db): Promise<Record<string, number>> {
  const row = await one<Record<string, number>>(
    db,
    `SELECT
       (SELECT COUNT(*) FROM clients WHERE status IN ('active_client','onboarding')) AS clients,
       (SELECT COUNT(*) FROM leads WHERE stage NOT IN ('converted','lost')) AS leads,
       (SELECT COUNT(*) FROM projects WHERE status NOT IN ('completed','cancelled')) AS projects,
       (SELECT COUNT(*) FROM maintenance_requests WHERE status NOT IN ('completed','closed','rejected')) AS maintenance,
       (SELECT COUNT(*) FROM tasks WHERE status IN ('open','in_progress')) AS tasks,
       (SELECT COUNT(*) FROM websites WHERE status <> 'archived') AS websites,
       (SELECT COUNT(*) FROM invoices WHERE status = 'overdue') AS overdueInvoices`,
  );
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(row ?? {})) out[k] = Number(v ?? 0);
  return out;
}

export async function setting(db: Db, key: string, fallback = ''): Promise<string> {
  const n = await scalar(db, `SELECT 1 FROM settings WHERE key = ?`, key).catch(() => 0);
  if (!n) return fallback;
  const rows = await all<{ value: string }>(db, 'SELECT value FROM settings WHERE key = ?', key);
  return rows[0]?.value ?? fallback;
}

export function env(c: AppContext): Env {
  return c.env;
}

export function absoluteUrl(c: AppContext, path: string): string {
  const url = new URL(c.req.url);
  return `${url.origin}${path}`;
}

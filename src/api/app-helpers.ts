// Shared helpers for the JSON API that powers the React application.
// The proprietary integration API lives separately at /api/v1.

import type { AppContext, AuthUser } from '../lib/auth';
import { all, one, scalar } from '../lib/db';
import { clamp, toInt } from '../lib/util';

export type JsonBody = Record<string, unknown>;

export function json(data: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'private, no-store',
      ...headers,
    },
  });
}

export function fail(status: number, message: string, fields?: Record<string, string>): Response {
  return json({ error: { message, fields: fields ?? null } }, status);
}

export async function readBody(c: AppContext): Promise<JsonBody> {
  const type = c.req.header('content-type') ?? '';
  if (type.includes('application/json')) {
    const raw = await c.req.json().catch(() => null);
    return raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as JsonBody) : {};
  }
  const form = await c.req.parseBody().catch(() => ({}) as Record<string, unknown>);
  const out: JsonBody = {};
  for (const [k, v] of Object.entries(form)) {
    if (typeof v === 'string') out[k] = v;
  }
  return out;
}

export function str(body: JsonBody, key: string, max = 20_000): string {
  const v = body[key];
  if (v === null || v === undefined) return '';
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (typeof v !== 'string') return '';
  return v.trim().slice(0, max);
}

export function nullable(body: JsonBody, key: string, max = 20_000): string | null {
  const v = str(body, key, max);
  return v === '' ? null : v;
}

export function num(body: JsonBody, key: string, fallback = 0): number {
  return toInt(body[key], fallback);
}

export function moneyField(body: JsonBody, key: string): number {
  if (body[key] === null || body[key] === undefined || body[key] === '') return 0;
  const raw = String(body[key]).replace(/[^0-9.-]/g, '');
  const n = Number(raw);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

export function boolField(body: JsonBody, key: string, fallback = false): boolean {
  const v = body[key];
  if (v === undefined || v === null || v === '') return fallback;
  return v === true || v === 1 || v === '1' || v === 'on' || v === 'true';
}

export function dateField(body: JsonBody, key: string): string | null {
  const v = str(body, key);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const d = new Date(`${v}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  return v;
}

export function datetimeField(body: JsonBody, key: string): string | null {
  const v = str(body, key);
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function emailField(body: JsonBody, key: string): string | null {
  const v = str(body, key).toLowerCase();
  if (!v) return null;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? v : null;
}

export function urlField(body: JsonBody, key: string, requireHttps = false): string | null {
  const v = str(body, key);
  if (!v) return null;
  try {
    const u = new URL(v.includes('://') ? v : `https://${v}`);
    if (!['http:', 'https:'].includes(u.protocol)) return null;
    if (requireHttps && u.protocol !== 'https:') return null;
    return u.toString();
  } catch {
    return null;
  }
}

export function csvList(body: JsonBody, key: string): string | null {
  const v = body[key];
  const parts = Array.isArray(v)
    ? v.map((x) => String(x))
    : String(v ?? '').split(',');
  const cleaned = parts.map((s) => s.trim()).filter(Boolean).slice(0, 40);
  return cleaned.length ? cleaned.join(',') : null;
}

export function pageParams(c: AppContext, defaultPerPage = 25) {
  const page = clamp(toInt(c.req.query('page'), 1), 1, 10_000);
  const perPage = clamp(toInt(c.req.query('per_page'), defaultPerPage), 5, 100);
  const q = (c.req.query('q') ?? '').trim().slice(0, 120);
  return { page, perPage, offset: (page - 1) * perPage, q };
}

export function paged<T>(rows: T[], total: number, page: number, perPage: number) {
  return {
    rows,
    page,
    per_page: perPage,
    total,
    pages: Math.max(1, Math.ceil(total / perPage)),
  };
}

export function like(q: string): string {
  return `%${q.replace(/[%_]/g, (m) => `\\${m}`)}%`;
}

export function canManagePlatform(user: AuthUser | null): boolean {
  return user?.role === 'admin' || user?.role === 'staff';
}

export function guardStaff(c: AppContext): AuthUser | Response {
  const user = c.get('user');
  if (!user) return fail(401, 'Sign in to continue.');
  if (user.role === 'client') return fail(403, 'Staff access required.');
  return user;
}

export function guardAdmin(c: AppContext): AuthUser | Response {
  const user = c.get('user');
  if (!user) return fail(401, 'Sign in to continue.');
  if (user.role !== 'admin') return fail(403, 'Administrator access required.');
  return user;
}

export function guardClient(c: AppContext): (AuthUser & { client_id: number }) | Response {
  const user = c.get('user');
  if (!user) return fail(401, 'Sign in to continue.');
  if (user.role !== 'client' || !user.client_id) return fail(403, 'Client portal access required.');
  // The check above proves the client scope exists; narrow it for row-level helpers.
  return user as AuthUser & { client_id: number };
}

/** Loads a record and verifies it belongs to the signed-in client (portal isolation). */
export async function clientOwned<T extends { client_id: number | null }>(
  c: AppContext,
  table: 'projects' | 'websites' | 'invoices' | 'agreements' | 'maintenance_requests' | 'documents' | 'calendar_events',
  id: number,
  clientId: number,
): Promise<T | null> {
  return one<T>(c.env.DB, `SELECT * FROM ${table} WHERE id = ? AND client_id = ?`, id, clientId);
}

export function count(db: D1Database, sql: string, ...params: (string | number | null)[]): Promise<number> {
  return scalar(db, sql, ...params);
}

export function rows<T>(db: D1Database, sql: string, ...params: (string | number | null)[]): Promise<T[]> {
  return all<T>(db, sql, ...params);
}

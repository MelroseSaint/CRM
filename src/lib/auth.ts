// Authentication, sessions, CSRF and role enforcement.

import type { Context } from 'hono';
import { getCookie } from 'hono/cookie';
import type { Env } from './db';
import { all, one, run } from './db';
import { base64url, nowIso, randomToken, sha256Hex, timingSafeEqual } from './util';

export type Role = 'admin' | 'staff' | 'client';

export interface UserRow {
  id: number;
  email: string;
  name: string;
  role: Role;
  client_id: number | null;
  status: string;
}

export interface AuthUser extends UserRow {
  client_name?: string | null;
}

export interface AppVars {
  user: AuthUser | null;
  sessionId: string | null;
  csrf: string;
  ip: string;
  settings: Record<string, string>;
  navCounts: Record<string, number>;
  cookies: string[];
}

export type AppContext = Context<{ Bindings: Env; Variables: AppVars }>;

export const SESSION_COOKIE = 'anvil_session';
const SESSION_HOURS = 12;
const PBKDF2_ITERATIONS = 150_000;

function bufToB64(buf: ArrayBuffer): string {
  return base64url(new Uint8Array(buf));
}

function b64ToBytes(value: string): Uint8Array {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (value.length % 4)) % 4);
  const raw = atob(padded);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function pbkdf2(password: string, salt: Uint8Array, iterations: number): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: salt as unknown as ArrayBuffer, iterations, hash: 'SHA-256' },
    key,
    256,
  );
  return bufToB64(bits);
}

export async function hashPassword(password: string): Promise<{ hash: string; salt: string; iterations: number }> {
  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);
  const hash = await pbkdf2(password, salt, PBKDF2_ITERATIONS);
  return { hash, salt: base64url(salt), iterations: PBKDF2_ITERATIONS };
}

export async function verifyPassword(
  password: string,
  hash: string,
  salt: string,
  iterations: number,
): Promise<boolean> {
  const computed = await pbkdf2(password, b64ToBytes(salt), iterations);
  return timingSafeEqual(computed, hash);
}

export async function createSession(
  c: AppContext,
  userId: number,
  ip: string,
  ua: string,
): Promise<{ token: string; csrf: string }> {
  const token = randomToken(32);
  const csrf = randomToken(24);
  const id = await sha256Hex(token);
  const expires = new Date(Date.now() + SESSION_HOURS * 3600_000).toISOString();
  await run(
    c.env.DB,
    'INSERT INTO sessions(id, user_id, csrf_token, ip, user_agent, expires_at, created_at) VALUES(?,?,?,?,?,?,?)',
    id,
    userId,
    csrf,
    ip,
    ua.slice(0, 300),
    expires,
    nowIso(),
  );
  queueCookie(c, serializeSessionCookie(c, token, SESSION_HOURS * 3600));
  return { token, csrf };
}

export async function loadSession(c: AppContext): Promise<{ user: AuthUser | null; sessionId: string | null; csrf: string }> {
  const raw = getCookie(c, SESSION_COOKIE);
  if (!raw) return { user: null, sessionId: null, csrf: '' };
  const id = await sha256Hex(raw);
  const row = await one<AuthUser & { csrf_token: string; expires_at: string }>(
    c.env.DB,
    `SELECT u.id, u.email, u.name, u.role, u.client_id, u.status, cl.name AS client_name,
            s.csrf_token, s.expires_at
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       LEFT JOIN clients cl ON cl.id = u.client_id
      WHERE s.id = ?`,
    id,
  );
  if (!row) return { user: null, sessionId: null, csrf: '' };
  if (row.expires_at < nowIso() || row.status !== 'active') {
    await run(c.env.DB, 'DELETE FROM sessions WHERE id = ?', id);
    queueCookie(c, serializeSessionCookie(c, '', 0));
    return { user: null, sessionId: null, csrf: '' };
  }
  return {
    user: {
      id: row.id,
      email: row.email,
      name: row.name,
      role: row.role,
      client_id: row.client_id,
      status: row.status,
      client_name: row.client_name,
    },
    sessionId: id,
    csrf: row.csrf_token,
  };
}

export async function destroySession(c: AppContext, sessionId: string | null): Promise<void> {
  if (sessionId) await run(c.env.DB, 'DELETE FROM sessions WHERE id = ?', sessionId);
  queueCookie(c, serializeSessionCookie(c, '', 0));
}

/** Cookies are appended to the final response by the request middleware. */
export function queueCookie(c: AppContext, cookie: string): void {
  const list = (c.get('cookies') as string[] | undefined) ?? [];
  list.push(cookie);
  c.set('cookies', list);
}

export function serializeSessionCookie(c: AppContext, value: string, maxAge: number): string {
  const secure = new URL(c.req.url).protocol === 'https:' ? '; Secure' : '';
  return `${SESSION_COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

export function serializeCsrfCookie(c: AppContext, value: string, maxAge = 12 * 3600): string {
  const secure = new URL(c.req.url).protocol === 'https:' ? '; Secure' : '';
  return `anvil_csrf=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

export function clientIp(c: { req: { header: (n: string) => string | undefined } }): string {
  return (
    c.req.header('cf-connecting-ip') ||
    c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ||
    '127.0.0.1'
  );
}

export async function audit(
  c: AppContext,
  action: string,
  entityType: string | null,
  entityId: string | number | null,
  detail?: unknown,
): Promise<void> {
  const user = c.get('user') as AuthUser | null;
  await run(
    c.env.DB,
    `INSERT INTO audit_logs(actor_user_id, actor_email, actor_role, action, entity_type, entity_id, detail, ip, created_at)
     VALUES(?,?,?,?,?,?,?,?,?)`,
    user?.id ?? null,
    user?.email ?? null,
    user?.role ?? null,
    action,
    entityType,
    entityId === null || entityId === undefined ? null : String(entityId),
    detail === undefined ? null : typeof detail === 'string' ? detail : JSON.stringify(detail).slice(0, 4000),
    clientIp(c),
    nowIso(),
  );
}

export async function countRecentLoginFailures(db: D1Database, email: string, ip: string): Promise<number> {
  const since = new Date(Date.now() - 15 * 60_000).toISOString();
  const rows = await all<{ c: number }>(
    db,
    `SELECT COUNT(*) AS c FROM login_attempts
      WHERE success = 0 AND created_at > ? AND (email = ? OR ip = ?)`,
    since,
    email,
    ip,
  );
  return Number(rows[0]?.c ?? 0);
}

export async function recordLoginAttempt(db: D1Database, email: string, ip: string, success: boolean): Promise<void> {
  await run(
    db,
    'INSERT INTO login_attempts(email, ip, success, created_at) VALUES(?,?,?,?)',
    email,
    ip,
    success ? 1 : 0,
    nowIso(),
  );
}

export function isAdmin(user: AuthUser | null): boolean {
  return user?.role === 'admin';
}

export function canManagePlatform(user: AuthUser | null): boolean {
  return user?.role === 'admin' || user?.role === 'staff';
}

/** Reads and validates the CSRF token present on every state-changing HTML form. */
export function csrfValid(c: AppContext, submitted: unknown): boolean {
  const expected = c.get('csrf');
  if (!expected || typeof submitted !== 'string') return false;
  return timingSafeEqual(expected, submitted);
}

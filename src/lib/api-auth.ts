// Credential issuance and request authentication for the proprietary API.

import { insert, one, run } from './db';
import type { Env } from './db';
import { base64url, nowIso, randomToken, sha256Hex, timingSafeEqual } from './util';

export const API_SCOPES = [
  'website:read',
  'website:sync',
  'events:write',
  'deployments:write',
  'health:write',
  'maintenance:write',
] as const;

export type ApiScope = (typeof API_SCOPES)[number];

export const SCOPE_LABELS: Record<string, string> = {
  'website:read': 'Read its own website record',
  'website:sync': 'Synchronise metadata and stack information',
  'events:write': 'Report diagnostic and application events',
  'deployments:write': 'Report deployment lifecycle events',
  'health:write': 'Report integration and application health',
  'maintenance:write': 'Open maintenance requests for its own site',
};

export interface ApiCredentialContext {
  credentialId: number;
  websiteId: number;
  clientId: number;
  scopes: string[];
  keyId: string;
  websiteName: string;
  clientName: string;
}

/** Creates a credential. The raw secret is returned exactly once and never stored. */
export async function issueCredential(
  env: Env,
  websiteId: number,
  label: string,
  scopes: string[],
  createdBy: number | null,
  rotatedFrom?: string,
): Promise<{ keyId: string; secret: string; token: string }> {
  const keyId = `wxi_${randomToken(8)}`;
  const secret = randomToken(30);
  const secretHash = await sha256Hex(secret);
  const valid = scopes.filter((s) => (API_SCOPES as readonly string[]).includes(s));
  await insert(
    env.DB,
    `INSERT INTO api_credentials(website_id, label, key_id, secret_hash, secret_hint, scopes, status, created_by, created_at, rotated_from)
     VALUES(?,?,?,?,?,?,?,?,?,?)`,
    websiteId,
    label.slice(0, 80) || 'Website integration',
    keyId,
    secretHash,
    secret.slice(0, 4),
    valid.length ? valid.join(',') : 'website:read,website:sync',
    'active',
    createdBy,
    nowIso(),
    rotatedFrom ?? null,
  );
  return { keyId, secret, token: `${keyId}.${secret}` };
}

export async function revokeCredential(env: Env, credentialId: number, websiteId: number): Promise<void> {
  await run(
    env.DB,
    `UPDATE api_credentials SET status='revoked', revoked_at=? WHERE id=? AND website_id=?`,
    nowIso(),
    credentialId,
    websiteId,
  );
}

/** Issues a single-use registration token so a site can self-register and receive credentials. */
export async function issueRegistrationToken(
  env: Env,
  websiteId: number,
  userId: number | null,
): Promise<{ token: string; expiresAt: string }> {
  const token = `wreg_${randomToken(24)}`;
  const hash = await sha256Hex(token);
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  await insert(
    env.DB,
    `INSERT INTO registration_tokens(website_id, token_hash, expires_at, created_by, created_at) VALUES(?,?,?,?,?)`,
    websiteId,
    hash,
    expiresAt,
    userId,
    nowIso(),
  );
  return { token, expiresAt };
}

export interface AuthFailure {
  ok: false;
  status: 401 | 403;
  code: string;
  message: string;
  credentialId: number | null;
  websiteId: number | null;
}

export type AuthResult = { ok: true; ctx: ApiCredentialContext } | AuthFailure;

export function parseBearer(header: string | undefined | null): { keyId: string; secret: string } | null {
  if (!header) return null;
  const raw = header.replace(/^Bearer\s+/i, '').trim();
  if (!raw) return null;
  const idx = raw.indexOf('.');
  if (idx < 1) return null;
  return { keyId: raw.slice(0, idx), secret: raw.slice(idx + 1) };
}

export async function authenticateRequest(
  env: Env,
  authorization: string | undefined,
  apiKeyHeader: string | undefined,
): Promise<AuthResult> {
  const parsed = parseBearer(authorization) ?? parseBearer(apiKeyHeader);
  if (!parsed) {
    return { ok: false, status: 401, code: 'missing_credentials', message: 'Provide a bearer credential: Authorization: Bearer <key_id>.<secret>', credentialId: null, websiteId: null };
  }
  const row = await one<{
    id: number; website_id: number; key_id: string; secret_hash: string; scopes: string; status: string;
    website_name: string; client_id: number; client_name: string;
  }>(
    env.DB,
    `SELECT cr.id, cr.website_id, cr.key_id, cr.secret_hash, cr.scopes, cr.status,
            w.name AS website_name, w.client_id, c.name AS client_name
       FROM api_credentials cr
       JOIN websites w ON w.id = cr.website_id
       JOIN clients c ON c.id = w.client_id
      WHERE cr.key_id = ?`,
    parsed.keyId,
  );
  if (!row) {
    return { ok: false, status: 401, code: 'invalid_credentials', message: 'Credential not recognised.', credentialId: null, websiteId: null };
  }
  if (row.status !== 'active') {
    return { ok: false, status: 401, code: 'credential_revoked', message: 'This credential has been revoked.', credentialId: row.id, websiteId: row.website_id };
  }
  const hash = await sha256Hex(parsed.secret);
  if (!timingSafeEqual(hash, row.secret_hash)) {
    return { ok: false, status: 401, code: 'invalid_credentials', message: 'Credential not recognised.', credentialId: row.id, websiteId: row.website_id };
  }
  await run(env.DB, 'UPDATE api_credentials SET last_used_at=? WHERE id=?', nowIso(), row.id);
  await run(env.DB, 'UPDATE websites SET last_api_activity_at=?, integration_status=? WHERE id=?', nowIso(), 'connected', row.website_id);
  return {
    ok: true,
    ctx: {
      credentialId: row.id,
      websiteId: row.website_id,
      clientId: row.client_id,
      scopes: row.scopes.split(',').map((s) => s.trim()).filter(Boolean),
      keyId: row.key_id,
      websiteName: row.website_name,
      clientName: row.client_name,
    },
  };
}

/** Fixed-window rate limiting keyed per credential. */
export async function checkRateLimit(
  env: Env,
  bucket: string,
  limit: number,
): Promise<{ allowed: boolean; remaining: number; resetSeconds: number }> {
  const windowStart = new Date(Math.floor(Date.now() / 60_000) * 60_000).toISOString();
  const row = await one<{ count: number; window_start: string }>(
    env.DB, 'SELECT count, window_start FROM api_rate_limits WHERE bucket=?', bucket,
  );
  if (!row || row.window_start !== windowStart) {
    await run(
      env.DB,
      `INSERT INTO api_rate_limits(bucket, window_start, count) VALUES(?,?,1)
       ON CONFLICT(bucket) DO UPDATE SET window_start=excluded.window_start, count=1`,
      bucket,
      windowStart,
    );
    return { allowed: true, remaining: limit - 1, resetSeconds: 60 };
  }
  const next = Number(row.count) + 1;
  await run(env.DB, 'UPDATE api_rate_limits SET count=? WHERE bucket=?', next, bucket);
  const elapsed = (Date.now() % 60_000) / 1000;
  return { allowed: next <= limit, remaining: Math.max(0, limit - next), resetSeconds: Math.ceil(60 - elapsed) };
}

export async function logApiRequest(
  env: Env,
  data: {
    credentialId: number | null;
    websiteId: number | null;
    method: string;
    path: string;
    status: number;
    durationMs: number;
    ip: string;
    note?: string | null;
  },
): Promise<void> {
  await run(
    env.DB,
    `INSERT INTO api_request_logs(credential_id, website_id, method, path, status, duration_ms, ip, note, created_at)
     VALUES(?,?,?,?,?,?,?,?,?)`,
    data.credentialId,
    data.websiteId,
    data.method,
    data.path.slice(0, 200),
    data.status,
    data.durationMs,
    data.ip,
    data.note?.slice(0, 300) ?? null,
    nowIso(),
  );
}

export function newIntegrationId(): string {
  return `wsi_${base64url(crypto.getRandomValues(new Uint8Array(8)))}`;
}

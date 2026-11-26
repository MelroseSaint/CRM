// Proprietary API v1. Authenticated per website, scoped, rate limited, logged and idempotent.

import { Hono } from 'hono';
import type { AppVars } from '../lib/auth';
import type { Env } from '../lib/db';
import { all, insert, one, run } from '../lib/db';
import {
  API_SCOPES, authenticateRequest, checkRateLimit, issueCredential, logApiRequest, type ApiCredentialContext,
} from '../lib/api-auth';
import { emitEvent } from '../lib/webhooks';
import { esc, nowIso, randomToken, sha256Hex, titleize } from '../lib/util';

type ApiVars = AppVars & { api: ApiCredentialContext };
type ApiApp = Hono<{ Bindings: Env; Variables: ApiVars }>;

const VERSION = 'v1';
const MAX_BODY_BYTES = 64 * 1024;

function requestId(c: { req: { header: (n: string) => string | undefined } }): string {
  return c.req.header('cf-ray')?.slice(0, 16) ?? `req_${randomToken(6)}`;
}

function fail(c: any, status: number, code: string, message: string, details?: unknown): Response {
  return c.json({ error: { code, message, ...(details ? { details } : {}) }, request_id: requestId(c), api_version: VERSION }, status);
}

function ok(c: any, data: unknown, status = 200): Response {
  return c.json({ ...(data as object), request_id: requestId(c), api_version: VERSION }, status);
}

async function readJson(c: any): Promise<Record<string, unknown> | null> {
  const contentType = c.req.header('content-type') ?? '';
  if (!contentType.includes('application/json')) return null;
  const raw = await c.req.text();
  if (raw.length > MAX_BODY_BYTES) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function str(value: unknown, max = 500): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

function url(value: unknown): string | null {
  const s = str(value, 500);
  if (!s) return null;
  try {
    const parsed = new URL(s);
    return ['http:', 'https:'].includes(parsed.protocol) ? parsed.toString() : null;
  } catch {
    return null;
  }
}

function hasScope(ctx: ApiCredentialContext, scope: string): boolean {
  return ctx.scopes.includes(scope);
}

function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => a.localeCompare(b));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
}

export function apiV1Routes(): ApiApp {
  const app = new Hono<{ Bindings: Env; Variables: ApiVars }>();

  app.get('/api/v1/health', (c) =>
    c.json({ status: 'ok', api_version: VERSION, time: nowIso(), docs: '/admin/api/docs' }),
  );

  // ---------------------------------------------------------------- register
  app.post('/api/v1/register', async (c) => {
    const started = Date.now();
    const header = c.req.header('authorization');
    const raw = (header ?? '').replace(/^Bearer\s+/i, '').trim();
    if (!raw.startsWith('wreg_')) {
      await logApiRequest(c.env, { credentialId: null, websiteId: null, method: 'POST', path: '/api/v1/register', status: 401, durationMs: Date.now() - started, ip: clientIpSafe(c), note: 'registration token missing' });
      return fail(c, 401, 'registration_token_required', 'Provide a one-time registration token: Authorization: Bearer wreg_…');
    }
    const hash = await sha256Hex(raw);
    const token = await one<{ id: number; website_id: number; expires_at: string; used_at: string | null }>(
      c.env.DB, 'SELECT id, website_id, expires_at, used_at FROM registration_tokens WHERE token_hash=?', hash,
    );
    if (!token) return fail(c, 401, 'invalid_registration_token', 'Registration token not recognised.');
    if (token.used_at) return fail(c, 409, 'token_already_used', 'This registration token has already been used. Issue a new one.');
    if (token.expires_at < nowIso()) return fail(c, 410, 'token_expired', 'This registration token has expired.');

    const body = (await readJson(c)) ?? {};
    const site = await one<{ id: number; name: string; integration_id: string | null; client_id: number }>(
      c.env.DB, 'SELECT id, name, integration_id, client_id FROM websites WHERE id=?', token.website_id,
    );
    if (!site) return fail(c, 404, 'website_not_found', 'The website tied to this token no longer exists.');

    const scopes = ['website:read', 'website:sync', 'events:write', 'deployments:write', 'health:write', 'maintenance:write'];
    const cred = await issueCredential(c.env, site.id, 'Self-registered integration', scopes, null);
    await run(c.env.DB, 'UPDATE registration_tokens SET used_at=? WHERE id=?', nowIso(), token.id);
    const sdkVersion = str(body.sdk_version, 40);
    await run(
      c.env.DB,
      `UPDATE websites SET integration_status='connected', last_sync_at=?, last_api_activity_at=?, integration_version=?, updated_at=? WHERE id=?`,
      nowIso(), nowIso(), sdkVersion, nowIso(), site.id,
    );
    await insert(
      c.env.DB,
      `INSERT INTO sync_logs(website_id, credential_id, direction, kind, status, message, payload, created_at) VALUES(?,?,?,?,?,?,?,?)`,
      site.id, null, 'inbound', 'registration', 'ok', `Website self-registered${sdkVersion ? ` (SDK ${sdkVersion})` : ''}`,
      JSON.stringify(body).slice(0, 4000), nowIso(),
    );
    await run(
      c.env.DB,
      `INSERT INTO website_events(website_id, type, title, detail, source, created_at) VALUES(?,?,?,?,?,?)`,
      site.id, 'integration', 'Website connected to platform', `Self-registered via API v1${sdkVersion ? ` · SDK ${sdkVersion}` : ''}.`, 'integration', nowIso(),
    );
    await emitEvent(c.env, site.id, 'website.connected', { website_id: site.id, sdk_version: sdkVersion });
    await logApiRequest(c.env, { credentialId: null, websiteId: site.id, method: 'POST', path: '/api/v1/register', status: 201, durationMs: Date.now() - started, ip: clientIpSafe(c) });
    return ok(
      c,
      {
        website: { id: site.id, name: site.name, integration_id: site.integration_id },
        credential: { key_id: cred.keyId, secret: cred.secret, token: cred.token, scopes },
        note: 'Store the secret in the website environment. It is shown once.',
      },
      201,
    );
  });

  // ---------------------------------------------------------------- auth for everything else
  app.use('/api/v1/*', async (c, next) => {
    const started = Date.now();
    const path = new URL(c.req.url).pathname;
    const method = c.req.method;
    const auth = await authenticateRequest(c.env, c.req.header('authorization'), c.req.header('x-api-key'));
    if (!auth.ok) {
      await logApiRequest(c.env, {
        credentialId: auth.credentialId, websiteId: auth.websiteId, method, path,
        status: auth.status, durationMs: Date.now() - started, ip: clientIpSafe(c), note: auth.code,
      });
      return c.json({ error: { code: auth.code, message: auth.message }, request_id: requestId(c), api_version: VERSION }, auth.status);
    }
    const limit = Number(c.get('settings').api_rate_limit_per_minute ?? 120);
    const rl = await checkRateLimit(c.env, `cred:${auth.ctx.credentialId}`, Number.isFinite(limit) && limit > 0 ? limit : 120);
    c.header('X-RateLimit-Limit', String(limit));
    c.header('X-RateLimit-Remaining', String(rl.remaining));
    c.header('X-RateLimit-Reset', String(rl.resetSeconds));
    if (!rl.allowed) {
      c.header('Retry-After', String(rl.resetSeconds));
      await logApiRequest(c.env, {
        credentialId: auth.ctx.credentialId, websiteId: auth.ctx.websiteId, method, path,
        status: 429, durationMs: Date.now() - started, ip: clientIpSafe(c), note: 'rate_limited',
      });
      return c.json({ error: { code: 'rate_limited', message: `Rate limit of ${limit} requests per minute exceeded.` }, request_id: requestId(c) }, 429);
    }
    c.set('api', auth.ctx);
    await next();
    await logApiRequest(c.env, {
      credentialId: auth.ctx.credentialId, websiteId: auth.ctx.websiteId, method, path,
      status: c.res.status, durationMs: Date.now() - started, ip: clientIpSafe(c),
      note: c.res.status >= 400 ? 'error' : null,
    });
  });

  // ---------------------------------------------------------------- identity
  app.get('/api/v1/me', async (c) => {
    const api = c.get('api');
    if (!hasScope(api, 'website:read')) return fail(c, 403, 'insufficient_scope', 'website:read is required.');
    const site = await siteRecord(c.env, api.websiteId);
    return ok(c, {
      website: site,
      client: { id: api.clientId, name: api.clientName },
      credential: { key_id: api.keyId, scopes: api.scopes },
      capabilities: API_SCOPES.filter((s) => api.scopes.includes(s)),
    });
  });

  app.get('/api/v1/website', async (c) => {
    const api = c.get('api');
    if (!hasScope(api, 'website:read')) return fail(c, 403, 'insufficient_scope', 'website:read is required.');
    // Reported and measured health are returned separately and never merged: the platform
    // must not present a website's own claim as an independent measurement.
    const [reported, automated] = await Promise.all([
      one<Record<string, unknown>>(
        c.env.DB,
        `SELECT status, kind, detail, checked_at FROM website_checks
          WHERE website_id=? AND source='reported' ORDER BY checked_at DESC LIMIT 1`,
        api.websiteId,
      ),
      one<Record<string, unknown>>(
        c.env.DB,
        `SELECT status, kind, latency_ms, http_status, detail, checked_at FROM website_checks
          WHERE website_id=? AND source='automated' ORDER BY checked_at DESC LIMIT 1`,
        api.websiteId,
      ),
    ]);
    return ok(c, {
      website: await siteRecord(c.env, api.websiteId),
      health: {
        reported: reported
          ? { ...reported, source: 'reported', note: 'Supplied by the website. Not an independent measurement.' }
          : null,
        automated: automated ? { ...automated, source: 'automated', note: 'Measured by the platform.' } : null,
      },
    });
  });

  // ---------------------------------------------------------------- synchronisation
  const syncHandler = async (c: any): Promise<Response> => {
    const api = c.get('api') as ApiCredentialContext;
    if (!hasScope(api, 'website:sync')) return fail(c, 403, 'insufficient_scope', 'website:sync is required.');
    const body = await readJson(c);
    if (!body) return fail(c, 400, 'invalid_body', 'A JSON object body is required.');

    const metadata = (body.metadata ?? body) as Record<string, unknown>;
    const technology = (metadata.technology ?? body.technology ?? {}) as Record<string, unknown>;
    const deployment = (metadata.deployment ?? body.deployment ?? {}) as Record<string, unknown>;

    const payloadHash = await sha256Hex(canonical({ metadata, technology, deployment }));
    const last = await one<{ payload: string | null }>(
      c.env.DB,
      `SELECT payload FROM sync_logs WHERE website_id=? AND kind='metadata' AND status='ok' ORDER BY created_at DESC LIMIT 1`,
      api.websiteId,
    );
    if (last?.payload) {
      try {
        const previousHash = await sha256Hex(canonical(JSON.parse(last.payload)));
        if (previousHash === payloadHash) {
          return ok(c, { unchanged: true, website_id: api.websiteId, synced_at: nowIso() });
        }
      } catch {
        // Corrupt history must not block a legitimate sync; fall through and record it.
      }
    }

    const name = str(metadata.name, 160);
    const stack = str(technology.framework ?? metadata.framework ?? metadata.stack, 160);
    const productionUrl = url(deployment.url ?? metadata.production_url);
    const stagingUrl = url(metadata.staging_url);
    const hosting = str(technology.hosting ?? metadata.hosting_provider, 120);
    const deployPlatform = str(technology.deploy_platform ?? metadata.deploy_platform, 120);
    const repository = url(technology.repository_url ?? metadata.repo_url);
    const backend = str(technology.backend, 120);
    const database = str(technology.database, 120);
    const media = str(technology.media_storage, 120);
    const version = str(deployment.version ?? metadata.version, 60);
    const environment = str(deployment.environment ?? metadata.deployment_environment, 40);
    const buildId = str(deployment.build_id ?? metadata.build_id, 120);

    await run(
      c.env.DB,
      `UPDATE websites SET
        name = COALESCE(?, name),
        stack = COALESCE(?, stack),
        production_url = COALESCE(?, production_url),
        staging_url = COALESCE(?, staging_url),
        hosting_provider = COALESCE(?, hosting_provider),
        deploy_platform = COALESCE(?, deploy_platform),
        repo_url = COALESCE(?, repo_url),
        backend_provider = COALESCE(?, backend_provider),
        db_provider = COALESCE(?, db_provider),
        media_provider = COALESCE(?, media_provider),
        integration_status = 'connected',
        last_sync_at = ?, last_api_activity_at = ?, updated_at = ?
       WHERE id = ?`,
      name, stack, productionUrl, stagingUrl, hosting, deployPlatform, repository, backend, database, media,
      nowIso(), nowIso(), nowIso(), api.websiteId,
    );

    await insert(
      c.env.DB,
      `INSERT INTO sync_logs(website_id, credential_id, direction, kind, status, message, payload, created_at) VALUES(?,?,?,?,?,?,?,?)`,
      api.websiteId, api.credentialId, 'inbound', 'metadata', 'ok',
      `Metadata synchronised${environment ? ` (${environment})` : ''}${buildId ? ` · build ${buildId}` : ''}`,
      JSON.stringify({ metadata, technology, deployment }).slice(0, 4000), nowIso(),
    );
    await run(
      c.env.DB,
      `INSERT INTO website_events(website_id, type, title, detail, source, created_at) VALUES(?,?,?,?,?,?)`,
      api.websiteId, 'integration', 'Metadata synchronised',
      [`Stack: ${stack ?? 'unchanged'}`, version ? `Version ${version}` : null, buildId ? `Build ${buildId}` : null, environment ? `Environment ${environment}` : null]
        .filter(Boolean).join(' · '),
      'integration', nowIso(),
    );
    await emitEvent(c.env, api.websiteId, 'website.updated', { website_id: api.websiteId, version, environment, build_id: buildId });

    return ok(c, {
      website_id: api.websiteId,
      synced_at: nowIso(),
      applied: { name, stack, production_url: productionUrl, staging_url: stagingUrl, hosting, deploy_platform: deployPlatform, repository, version, environment, build_id: buildId },
      unchanged: false,
    });
  };

  app.post('/api/v1/sync', syncHandler);
  app.patch('/api/v1/website', syncHandler);

  // ---------------------------------------------------------------- events
  app.post('/api/v1/events', async (c) => {
    const api = c.get('api');
    if (!hasScope(api, 'events:write')) return fail(c, 403, 'insufficient_scope', 'events:write is required.');
    const raw = await readJson(c);
    if (!raw) return fail(c, 400, 'invalid_body', 'A JSON body is required.');
    const list = Array.isArray(raw.events) ? (raw.events as Record<string, unknown>[]) : [raw];
    if (!list.length) return fail(c, 400, 'empty_events', 'Provide at least one event.');
    if (list.length > 50) return fail(c, 413, 'too_many_events', 'Send at most 50 events per request.');

    let accepted = 0;
    let duplicates = 0;
    const rejected: { index: number; reason: string }[] = [];

    for (let i = 0; i < list.length; i++) {
      const ev = list[i] ?? {};
      const type = str(ev.type, 60);
      const title = str(ev.message ?? ev.title, 200);
      if (!type || !title) {
        rejected.push({ index: i, reason: 'type and message are required' });
        continue;
      }
      const eventKey = str(ev.id ?? ev.event_key, 120);
      const detail = str(ev.detail, 4000);
      const meta = ev.metadata ? JSON.stringify(ev.metadata).slice(0, 2000) : null;
      const res = await run(
        c.env.DB,
        `INSERT OR IGNORE INTO website_events(website_id, type, title, detail, source, event_key, created_at) VALUES(?,?,?,?,?,?,?)`,
        api.websiteId,
        ['error', 'warning', 'info', 'deployment'].includes(type) ? (type === 'error' || type === 'warning' ? 'bugfix' : type) : type.slice(0, 40),
        title,
        detail ?? meta,
        'integration',
        eventKey,
        nowIso(),
      );
      if ((res.meta?.changes ?? 0) > 0) {
        accepted += 1;
        if (type === 'error') {
          await emitEvent(c.env, api.websiteId, 'website.error', { website_id: api.websiteId, message: title, detail, occurred_at: ev.occurred_at ?? nowIso() });
        }
      } else {
        duplicates += 1;
      }
    }
    await insert(
      c.env.DB,
      `INSERT INTO sync_logs(website_id, credential_id, direction, kind, status, message, payload, created_at) VALUES(?,?,?,?,?,?,?,?)`,
      api.websiteId, api.credentialId, 'inbound', 'events', accepted > 0 ? 'ok' : 'duplicate',
      `${accepted} accepted, ${duplicates} duplicate, ${rejected.length} rejected`,
      JSON.stringify({ accepted, duplicates, rejected }).slice(0, 2000), nowIso(),
    );
    return ok(c, { accepted, duplicates, rejected }, rejected.length && !accepted ? 422 : 200);
  });

  // ---------------------------------------------------------------- deployments
  app.post('/api/v1/deployments', async (c) => {
    const api = c.get('api');
    if (!hasScope(api, 'deployments:write')) return fail(c, 403, 'insufficient_scope', 'deployments:write is required.');
    const body = await readJson(c);
    if (!body) return fail(c, 400, 'invalid_body', 'A JSON body is required.');
    const status = str(body.status, 30);
    if (!status || !['started', 'succeeded', 'failed', 'cancelled'].includes(status)) {
      return fail(c, 400, 'invalid_status', 'status must be one of started, succeeded, failed, cancelled.');
    }
    const environment = str(body.environment, 40) ?? 'production';
    const deploymentUrl = url(body.url);
    const commit = str(body.commit ?? body.commit_sha, 80);
    const buildId = str(body.build_id, 120);
    const version = str(body.version, 60);
    const failure = str(body.error, 600);
    const eventKey = str(body.id ?? body.deployment_id, 120) ?? `deploy_${status}_${buildId ?? ''}_${Math.floor(Date.now() / 1000)}`;

    const res = await run(
      c.env.DB,
      `INSERT OR IGNORE INTO website_events(website_id, type, title, detail, source, event_key, created_at) VALUES(?,?,?,?,?,?,?)`,
      api.websiteId, 'deployment', `Deployment ${status}`,
      [environment !== 'production' ? `environment ${environment}` : null, deploymentUrl, commit ? `commit ${commit.slice(0, 10)}` : null, buildId ? `build ${buildId}` : null, failure ? `error: ${failure}` : null]
        .filter(Boolean).join(' · '),
      'integration', eventKey, nowIso(),
    );
    const duplicate = (res.meta?.changes ?? 0) === 0;

    if (!duplicate && status === 'succeeded') {
      await run(
        c.env.DB,
        `UPDATE websites SET deployed_at=?, production_url=COALESCE(?, production_url), integration_version=COALESCE(?, integration_version),
          integration_status='connected', last_api_activity_at=?, updated_at=? WHERE id=?`,
        nowIso(), environment === 'production' ? deploymentUrl : null, version, nowIso(), nowIso(), api.websiteId,
      );
    }
    if (!duplicate) {
      await emitEvent(c.env, api.websiteId, `deployment.${status === 'cancelled' ? 'failed' : status}`, {
        website_id: api.websiteId, status, environment, url: deploymentUrl, commit, build_id: buildId, version, error: failure,
      });
    }
    await insert(
      c.env.DB,
      `INSERT INTO sync_logs(website_id, credential_id, direction, kind, status, message, payload, created_at) VALUES(?,?,?,?,?,?,?,?)`,
      api.websiteId, api.credentialId, 'inbound', 'deployment', duplicate ? 'duplicate' : 'ok',
      `Deployment ${status}${buildId ? ` (${buildId})` : ''}`,
      JSON.stringify(body).slice(0, 3000), nowIso(),
    );
    return ok(c, { recorded: !duplicate, duplicate, deployment: { status, environment, url: deploymentUrl, commit, build_id: buildId, version } });
  });

  // ---------------------------------------------------------------- reported health
  app.post('/api/v1/health-report', async (c) => {
    const api = c.get('api');
    if (!hasScope(api, 'health:write')) return fail(c, 403, 'insufficient_scope', 'health:write is required.');
    const body = await readJson(c);
    if (!body) return fail(c, 400, 'invalid_body', 'A JSON body is required.');
    const status = str(body.status, 20) ?? 'ok';
    if (!['ok', 'degraded', 'fail'].includes(status)) return fail(c, 400, 'invalid_status', 'status must be ok, degraded or fail.');
    const message = str(body.message, 600);
    const checks = Array.isArray(body.checks) ? body.checks.slice(0, 15) : [];

    for (const check of checks as Record<string, unknown>[]) {
      const name = str(check.name, 60);
      const checkStatus = str(check.status, 20) ?? 'unknown';
      if (!name) continue;
      await insert(
        c.env.DB,
        `INSERT INTO website_checks(website_id, source, kind, status, detail, checked_at) VALUES(?,?,?,?,?,?)`,
        api.websiteId, 'reported', name.slice(0, 40),
        ['ok', 'warn', 'fail', 'unknown'].includes(checkStatus) ? checkStatus : 'unknown',
        str(check.detail, 600), nowIso(),
      );
    }
    await run(c.env.DB, 'UPDATE websites SET integration_status=?, last_sync_at=?, last_api_activity_at=? WHERE id=?', status === 'fail' ? 'connected' : 'connected', nowIso(), nowIso(), api.websiteId);
    await insert(
      c.env.DB,
      `INSERT INTO website_events(website_id, type, title, detail, source, created_at) VALUES(?,?,?,?,?,?)`,
      api.websiteId, 'integration', `Reported integration health: ${status}`, message, 'integration', nowIso(),
    );
    await insert(
      c.env.DB,
      `INSERT INTO sync_logs(website_id, credential_id, direction, kind, status, message, payload, created_at) VALUES(?,?,?,?,?,?,?,?)`,
      api.websiteId, api.credentialId, 'inbound', 'health', status === 'fail' ? 'fail' : 'ok', message ?? `Reported health ${status}`,
      JSON.stringify(body).slice(0, 2000), nowIso(),
    );
    if (status !== 'ok') {
      await emitEvent(c.env, api.websiteId, 'website.health_changed', { website_id: api.websiteId, health: status, source: 'integration', message });
    }
    return ok(c, { recorded: true, reported_at: nowIso() });
  });

  // ---------------------------------------------------------------- maintenance requested by a site
  app.post('/api/v1/maintenance-requests', async (c) => {
    const api = c.get('api');
    if (!hasScope(api, 'maintenance:write')) return fail(c, 403, 'insufficient_scope', 'maintenance:write is required.');
    const body = await readJson(c);
    if (!body) return fail(c, 400, 'invalid_body', 'A JSON body is required.');
    const title = str(body.title, 200);
    if (!title) return fail(c, 400, 'title_required', 'A request title is required.');
    const requestKey = str(body.id ?? body.request_key, 120);
    if (requestKey) {
      const existing = await one<{ id: number }>(c.env.DB, 'SELECT id FROM maintenance_requests WHERE client_id=? AND request_key=?', api.clientId, requestKey);
      if (existing) return ok(c, { duplicate: true, request_id: existing.id });
    }
    const priorityInput = str(body.priority, 20) ?? 'medium';
    const priority = ['low', 'medium', 'high', 'urgent'].includes(priorityInput) ? priorityInput : 'medium';
    const id = await insert(
      c.env.DB,
      `INSERT INTO maintenance_requests(client_id, website_id, title, description, priority, status, submitted_at, source, request_key, created_at, updated_at)
       VALUES(?,?,?,?,?,?,?,?,?,?,?)`,
      api.clientId, api.websiteId, title, str(body.description, 4000), priority, 'submitted', nowIso(), 'api', requestKey, nowIso(), nowIso(),
    );
    await run(
      c.env.DB,
      `INSERT INTO activities(client_id, website_id, type, subject, body, happened_at, visibility, created_by, created_at) VALUES(?,?,?,?,?,?,?,?,?)`,
      api.clientId, api.websiteId, 'maintenance', `Automated support request: ${title}`, str(body.description, 2000), nowIso(), 'client', null, nowIso(),
    );
    await emitEvent(c.env, api.websiteId, 'maintenance.requested', { website_id: api.websiteId, request_id: id, title, priority });
    return ok(c, { request_id: id, status: 'submitted', duplicate: false }, 201);
  });

  app.get('/api/v1/maintenance-requests', async (c) => {
    const api = c.get('api');
    if (!hasScope(api, 'website:read')) return fail(c, 403, 'insufficient_scope', 'website:read is required.');
    const rows = await all<{ id: number; title: string; status: string; priority: string; submitted_at: string; completed_at: string | null }>(
      c.env.DB,
      `SELECT id, title, status, priority, submitted_at, completed_at FROM maintenance_requests
        WHERE website_id=? ORDER BY submitted_at DESC LIMIT 25`,
      api.websiteId,
    );
    return ok(c, { requests: rows });
  });

  app.all('/api/v1/*', (c) => fail(c, 404, 'not_found', `No endpoint matches ${c.req.method} ${new URL(c.req.url).pathname}.`));

  app.onError((err, c) => {
    console.error('API error', err);
    return c.json({ error: { code: 'internal_error', message: 'An unexpected error occurred.' }, request_id: requestId(c) }, 500);
  });

  return app;
}

function clientIpSafe(c: { req: { header: (n: string) => string | undefined } }): string {
  return c.req.header('cf-connecting-ip') ?? c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
}

async function siteRecord(env: Env, websiteId: number) {
  const site = await one<Record<string, unknown>>(
    env.DB,
    `SELECT id, name, domain, production_url, staging_url, category, stack, hosting_provider, domain_registrar,
            deploy_platform, repo_url, backend_provider, db_provider, media_provider, status, deployed_at,
            domain_renewal_date, hosting_renewal_date, ssl_expires_at, integration_id, integration_status, integration_version,
            last_sync_at, last_api_activity_at, last_check_at, last_http_status, last_latency_ms, last_health
       FROM websites WHERE id=?`,
    websiteId,
  );
  if (!site) return null;
  // Never expose internal notes, monitoring credentials or client PII through the API.
  return site;
}

export { esc, titleize };

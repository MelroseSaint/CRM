// Website availability monitoring. Distinguishes platform-verified checks from website-reported ones.

import type { Env } from './db';
import { all, one, run } from './db';
import { nowIso } from './util';
import { emitEvent } from './webhooks';

export interface MonitorTarget {
  id: number;
  name: string;
  client_id: number;
  production_url: string | null;
  monitoring_enabled: number;
  monitor_interval_minutes: number;
  last_check_at: string | null;
  last_health: string | null;
}

export interface CheckResult {
  ok: boolean;
  httpStatus: number | null;
  latencyMs: number | null;
  error: string | null;
  finalUrl: string | null;
}

/** Performs a real HTTP availability check from the platform (never simulated). */
export async function probeUrl(url: string, timeoutMs = 12_000): Promise<CheckResult> {
  const started = Date.now();
  try {
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      headers: { 'user-agent': 'AnvilOps-Monitor/1.0 (+availability check)', accept: '*/*' },
      signal: AbortSignal.timeout(timeoutMs),
    });
    const latency = Date.now() - started;
    // Drain a small amount so the connection closes cleanly.
    try {
      await res.body?.cancel();
    } catch {
      /* ignore */
    }
    return {
      ok: res.status >= 200 && res.status < 400,
      httpStatus: res.status,
      latencyMs: latency,
      error: null,
      finalUrl: res.url || url,
    };
  } catch (err) {
    return {
      ok: false,
      httpStatus: null,
      latencyMs: Date.now() - started,
      error: err instanceof Error ? err.message : 'Request failed',
      finalUrl: null,
    };
  }
}

export async function runWebsiteCheck(env: Env, websiteId: number, source: 'automated' | 'manual' = 'automated'): Promise<CheckResult> {
  const site = await one<MonitorTarget>(
    env.DB,
    'SELECT id, name, client_id, production_url, monitoring_enabled, monitor_interval_minutes, last_check_at, last_health FROM websites WHERE id = ?',
    websiteId,
  );
  if (!site) return { ok: false, httpStatus: null, latencyMs: null, error: 'Website not found', finalUrl: null };
  if (!site.production_url) {
    await run(
      env.DB,
      `INSERT INTO website_checks(website_id, source, kind, status, detail, checked_at) VALUES(?,?,?,?,?,?)`,
      websiteId, source, 'uptime', 'unknown', 'No production URL configured.', nowIso(),
    );
    return { ok: false, httpStatus: null, latencyMs: null, error: 'No production URL configured', finalUrl: null };
  }

  const result = await probeUrl(site.production_url);
  const status = result.ok ? 'ok' : result.httpStatus && result.httpStatus < 500 ? 'warn' : 'fail';
  const detail = result.error
    ? `Request failed: ${result.error}`
    : `HTTP ${result.httpStatus} in ${result.latencyMs} ms${result.finalUrl && result.finalUrl !== site.production_url ? ` (final URL ${result.finalUrl})` : ''}`;

  await run(
    env.DB,
    `INSERT INTO website_checks(website_id, source, kind, status, latency_ms, http_status, detail, checked_at)
     VALUES(?,?,?,?,?,?,?,?)`,
    websiteId, source, 'uptime', status, result.latencyMs, result.httpStatus, detail, nowIso(),
  );

  const previous = site.last_health;
  await run(
    env.DB,
    `UPDATE websites SET last_check_at=?, last_http_status=?, last_latency_ms=?, last_health=?, updated_at=? WHERE id=?`,
    nowIso(), result.httpStatus, result.latencyMs, status, nowIso(), websiteId,
  );

  if (previous !== status) {
    await run(
      env.DB,
      `INSERT INTO website_events(website_id, type, title, detail, source, created_at) VALUES(?,?,?,?,?,?)`,
      websiteId,
      'monitoring',
      `Availability changed to ${status}`,
      detail,
      'monitoring',
      nowIso(),
    );
    await emitEvent(env, websiteId, 'website.health_changed', {
      website_id: websiteId,
      health: status,
      previous_health: previous,
      http_status: result.httpStatus,
      latency_ms: result.latencyMs,
      checked_at: nowIso(),
      source,
    });
  }

  return result;
}

/** Runs checks for every website whose interval has elapsed. Used by the scheduled handler. */
export async function runDueChecks(env: Env, limit = 25): Promise<{ checked: number; failed: number }> {
  const due = await all<MonitorTarget>(
    env.DB,
    `SELECT id, name, client_id, production_url, monitoring_enabled, monitor_interval_minutes, last_check_at, last_health
       FROM websites
      WHERE monitoring_enabled = 1 AND production_url IS NOT NULL AND status NOT IN ('archived','in_development')
        AND (last_check_at IS NULL OR last_check_at < datetime('now', '-' || monitor_interval_minutes || ' minutes'))
      ORDER BY COALESCE(last_check_at, '1970-01-01') ASC
      LIMIT ?`,
    limit,
  );
  let failed = 0;
  for (const site of due) {
    const res = await runWebsiteCheck(env, site.id, 'automated');
    if (!res.ok) failed += 1;
  }
  return { checked: due.length, failed };
}

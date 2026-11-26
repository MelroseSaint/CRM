// Outbound webhook delivery with HMAC signatures, retries and delivery history.

import type { Env } from './db';
import { all, insert, one, run } from './db';
import { nowIso } from './util';
import { hmacHex, randomToken } from './util';

export const WEBHOOK_EVENTS = [
  'website.connected',
  'website.updated',
  'website.disconnected',
  'deployment.started',
  'deployment.succeeded',
  'deployment.failed',
  'website.error',
  'website.health_changed',
  'maintenance.requested',
  'integration.sync_failed',
] as const;

const MAX_ATTEMPTS = 5;

export interface DeliveryRow {
  id: number;
  endpoint_id: number;
  website_id: number;
  event: string;
  payload: string;
  status: string;
  attempts: number;
  next_attempt_at: string | null;
}

/** Queues an event for every endpoint subscribed to it and attempts delivery immediately. */
export async function emitEvent(env: Env, websiteId: number, event: string, data: Record<string, unknown>): Promise<number> {
  const endpoints = await all<{ id: number; events: string }>(
    env.DB,
    `SELECT id, events FROM webhook_endpoints WHERE website_id = ? AND status = 'active'`,
    websiteId,
  );
  const subscribed = endpoints.filter((e) => e.events === '*' || e.events.split(',').map((s) => s.trim()).includes(event));
  if (!subscribed.length) return 0;

  const body = JSON.stringify({
    id: `evt_${randomToken(9)}`,
    type: event,
    website_id: websiteId,
    created_at: nowIso(),
    data,
  });

  const ids: number[] = [];
  for (const endpoint of subscribed) {
    const id = await insert(
      env.DB,
      `INSERT INTO webhook_deliveries(endpoint_id, website_id, event, payload, status, attempts, next_attempt_at, created_at)
       VALUES(?,?,?,?,?,?,?,?)`,
      endpoint.id, websiteId, event, body, 'pending', 0, nowIso(), nowIso(),
    );
    ids.push(id);
  }
  await Promise.all(ids.map((id) => attemptDelivery(env, id).catch(() => undefined)));
  return ids.length;
}

export function signPayload(secret: string, timestamp: string, body: string): Promise<string> {
  return hmacHex(secret, `${timestamp}.${body}`);
}

export async function attemptDelivery(env: Env, deliveryId: number): Promise<boolean> {
  const delivery = await one<DeliveryRow>(env.DB, 'SELECT * FROM webhook_deliveries WHERE id = ?', deliveryId);
  if (!delivery || delivery.status === 'delivered') return false;
  const endpoint = await one<{ id: number; url: string; secret: string; status: string }>(
    env.DB, 'SELECT id, url, secret, status FROM webhook_endpoints WHERE id = ?', delivery.endpoint_id,
  );
  if (!endpoint || endpoint.status !== 'active') {
    await run(env.DB, `UPDATE webhook_deliveries SET status='failed', last_error=?, next_attempt_at=NULL WHERE id=?`, 'Endpoint inactive', deliveryId);
    return false;
  }

  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = await signPayload(endpoint.secret, timestamp, delivery.payload);
  const attempts = delivery.attempts + 1;
  try {
    const res = await fetch(endpoint.url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'user-agent': 'AnvilOps-Webhooks/1.0',
        'x-anvil-event': delivery.event,
        'x-anvil-delivery': String(delivery.id),
        'x-anvil-timestamp': timestamp,
        'x-anvil-signature': `t=${timestamp},v1=${signature}`,
      },
      body: delivery.payload,
      signal: AbortSignal.timeout(8000),
    });
    const ok = res.status >= 200 && res.status < 300;
    await res.body?.cancel().catch(() => undefined);
    if (ok) {
      await run(
        env.DB,
        `UPDATE webhook_deliveries SET status='delivered', attempts=?, response_status=?, delivered_at=?, last_error=NULL, next_attempt_at=NULL WHERE id=?`,
        attempts, res.status, nowIso(), deliveryId,
      );
      await run(env.DB, 'UPDATE webhook_endpoints SET last_delivery_at=?, failure_count=0 WHERE id=?', nowIso(), endpoint.id);
      return true;
    }
    const backoff = Math.min(60, 2 ** attempts) * 60_000;
    const finalStatus = attempts >= MAX_ATTEMPTS ? 'failed' : 'pending';
    await run(
      env.DB,
      `UPDATE webhook_deliveries SET status=?, attempts=?, response_status=?, last_error=?, next_attempt_at=? WHERE id=?`,
      finalStatus, attempts, res.status, `HTTP ${res.status}`, new Date(Date.now() + backoff).toISOString(), deliveryId,
    );
    await run(env.DB, 'UPDATE webhook_endpoints SET failure_count=failure_count+1 WHERE id=?', endpoint.id);
    return false;
  } catch (err) {
    const backoff = Math.min(60, 2 ** attempts) * 60_000;
    const finalStatus = attempts >= MAX_ATTEMPTS ? 'failed' : 'pending';
    await run(
      env.DB,
      `UPDATE webhook_deliveries SET status=?, attempts=?, last_error=?, next_attempt_at=? WHERE id=?`,
      finalStatus, attempts, err instanceof Error ? err.message.slice(0, 500) : 'Delivery failed',
      new Date(Date.now() + backoff).toISOString(), deliveryId,
    );
    await run(env.DB, 'UPDATE webhook_endpoints SET failure_count=failure_count+1 WHERE id=?', endpoint.id);
    return false;
  }
}

/** Retries due deliveries. Called by the scheduled handler. */
export async function processPendingDeliveries(env: Env, limit = 30): Promise<number> {
  const due = await all<{ id: number }>(
    env.DB,
    `SELECT id FROM webhook_deliveries
      WHERE status='pending' AND next_attempt_at IS NOT NULL AND next_attempt_at <= ?
      ORDER BY next_attempt_at ASC LIMIT ?`,
    nowIso(), limit,
  );
  let delivered = 0;
  for (const d of due) {
    if (await attemptDelivery(env, d.id)) delivered += 1;
  }
  return delivered;
}

export async function replayDelivery(env: Env, deliveryId: number): Promise<void> {
  await run(
    env.DB,
    `UPDATE webhook_deliveries SET status='pending', attempts=0, next_attempt_at=?, last_error=NULL WHERE id=?`,
    nowIso(), deliveryId,
  );
  await attemptDelivery(env, deliveryId);
}

/** Verifies an inbound webhook signature. Exposed for SDK parity and tests. */
export async function verifySignature(secret: string, header: string, body: string, toleranceSeconds = 300): Promise<boolean> {
  const parts = Object.fromEntries(header.split(',').map((p) => p.split('=') as [string, string]));
  const timestamp = Number(parts.t);
  if (!timestamp || Math.abs(Date.now() / 1000 - timestamp) > toleranceSeconds) return false;
  const expected = await signPayload(secret, parts.t, body);
  if (!parts.v1 || expected.length !== parts.v1.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ parts.v1.charCodeAt(i);
  return diff === 0;
}

// Scheduled work endpoint. Cloudflare runs the same jobs from the Worker's
// `scheduled` handler; on Vercel a Cron Job calls this route instead.

import type { Context } from 'hono';
import type { Env } from '../lib/db';
import { sweepOverdueInvoices } from '../lib/db';
import { runDueChecks } from '../lib/monitor';
import { processPendingDeliveries } from '../lib/webhooks';

export async function cronHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const secret = process.env.CRON_SECRET?.trim();
  if (secret) {
    const header = c.req.header('authorization') ?? '';
    if (header !== `Bearer ${secret}`) {
      return c.json({ error: { code: 'unauthorized', message: 'Cron authorization failed.' } }, 401);
    }
  } else if (process.env.VERCEL) {
    // A deployed scheduler must never run unauthenticated just because the
    // secret is missing.
    return c.json(
      { error: { code: 'cron_secret_missing', message: 'Set CRON_SECRET to enable scheduled work.' } },
      503,
    );
  }

  const overdue = await sweepOverdueInvoices(c.env.DB);
  const checks = await runDueChecks(c.env, 25);
  const deliveries = await processPendingDeliveries(c.env, 20);
  return c.json({ ok: true, overdue, checks, deliveries });
}

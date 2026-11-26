// Durable fixed-window rate limiting backed by D1.
//
// Workers are stateless between requests and run in many isolates, so an
// in-memory counter cannot enforce a per-account budget. The counter lives in
// `rate_limits`, keyed by a caller-chosen string (for example
// `portal:user:42`), and the upsert below is atomic.

import { one, run, Db} from './db';

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  /** Seconds until the current window resets. */
  retryAfter: number;
}

let tableReady: Promise<void> | null = null;

async function ensureTable(db: Db): Promise<void> {
  tableReady ??= (async () => {
    await run(
      db,
      `CREATE TABLE IF NOT EXISTS rate_limits (
         key          TEXT PRIMARY KEY,
         window_start INTEGER NOT NULL,
         count        INTEGER NOT NULL
       )`,
    );
    const stale = Math.floor(Date.now() / 1000) - 2 * 24 * 60 * 60;
    await run(db, 'DELETE FROM rate_limits WHERE window_start < ?', stale);
  })().catch((error: unknown) => {
    // Reset so a later request retries instead of caching the failure forever.
    tableReady = null;
    throw error;
  });
  return tableReady;
}

/**
 * Counts one hit against `key` and reports whether the caller is still inside
 * its budget. The counter resets when the fixed window rolls over.
 */
export async function consumeRateLimit(
  db: Db,
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  await ensureTable(db);

  const now = Math.floor(Date.now() / 1000);
  const windowStart = Math.floor(now / windowSeconds) * windowSeconds;

  await run(
    db,
    `INSERT INTO rate_limits(key, window_start, count) VALUES(?, ?, 1)
     ON CONFLICT(key) DO UPDATE SET
       count = CASE WHEN rate_limits.window_start = excluded.window_start THEN rate_limits.count + 1 ELSE 1 END,
       window_start = excluded.window_start`,
    key,
    windowStart,
  );

  const row = await one<{ count: number }>(db, 'SELECT count FROM rate_limits WHERE key = ?', key);
  const used = Number(row?.count ?? 0);

  return {
    allowed: used <= limit,
    limit,
    remaining: Math.max(0, limit - used),
    retryAfter: Math.max(1, windowStart + windowSeconds - now),
  };
}

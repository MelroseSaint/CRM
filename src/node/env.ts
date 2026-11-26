// Builds the portable Env for Node and Vercel from process environment.
//
// DATABASE_URL accepts a Turso URL (libsql:// or https://) in production and a
// file: URL for local development and tests. DATABASE_AUTH_TOKEN is required for
// Turso. On Cloudflare none of this is used: wrangler binds D1 and R2 directly.

import type { Env } from '../lib/db';
import { createLibsqlDb } from './db-libsql';
import { dbFileStore } from './files';

const DEFAULT_DATABASE_URL = 'file:.data/anvil.db';

function loadDotEnv(): void {
  // Node 22.9+ can read a dotenv file itself; older versions simply use the shell.
  const load = (process as unknown as { loadEnvFile?: (path?: string) => void }).loadEnvFile;
  if (typeof load !== 'function') return;
  for (const file of ['.env.local', '.env']) {
    try {
      load(file);
      return;
    } catch {
      // no such file: keep the process environment
    }
  }
}

let cached: Env | null = null;

export function databaseConfig(): { url: string; authToken?: string } {
  loadDotEnv();
  // Accept the names Turso's own CLI and dashboard use, so a copied connection
  // string does not fail just because it was stored as TURSO_DATABASE_URL.
  const configured = (process.env.DATABASE_URL || process.env.TURSO_DATABASE_URL)?.trim();
  const authToken = (process.env.DATABASE_AUTH_TOKEN || process.env.TURSO_AUTH_TOKEN)?.trim() || undefined;
  // On Vercel a file: database cannot work (read-only filesystem, no persistence),
  // so stop with a clear configuration error instead of a generic 500.
  if (!configured && process.env.VERCEL) {
    throw new Error(
      'DATABASE_URL is not configured. Set DATABASE_URL (or TURSO_DATABASE_URL) and ' +
        'DATABASE_AUTH_TOKEN (or TURSO_AUTH_TOKEN) in the Vercel project environment for Production ' +
        'and Preview, then redeploy.',
    );
  }
  if (configured?.startsWith('file:') && process.env.VERCEL) {
    throw new Error(
      `DATABASE_URL is set to ${configured}, but Vercel functions have a read-only filesystem. ` +
        'Use a libSQL URL (libsql:// or https://) with DATABASE_AUTH_TOKEN instead.',
    );
  }
  return { url: configured || DEFAULT_DATABASE_URL, authToken };
}

export function loadEnv(): Env {
  if (cached) return cached;
  const { url, authToken } = databaseConfig();
  const db = createLibsqlDb(url, authToken);

  // The SPA is served by the `web` service on Vercel, so no disk assets here;
  // the Node server attaches its own AssetStore.
  cached = {
    DB: db,
    FILES: dbFileStore(db),
    APP_NAME: process.env.APP_NAME?.trim() || 'Anvil Ops',
    APP_ENV: process.env.VERCEL ? 'vercel' : 'node',
  } satisfies Env;
  return cached;
}

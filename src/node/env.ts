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

export function loadEnv(): Env {
  if (cached) return cached;
  loadDotEnv();

  const url = process.env.DATABASE_URL?.trim() || DEFAULT_DATABASE_URL;
  const authToken = process.env.DATABASE_AUTH_TOKEN?.trim() || undefined;
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

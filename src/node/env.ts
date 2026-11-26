// Builds the portable Env for Node and Vercel from process environment.
//
// DATABASE_URL accepts a Turso URL (libsql:// or https://) in production and a
// file: URL for local development and tests. DATABASE_AUTH_TOKEN is required for
// Turso. On Cloudflare none of this is used: wrangler binds D1 and R2 directly.

import { mkdirSync } from 'node:fs';
import type { Env } from '../lib/db';
import { createLibsqlDb } from './db-libsql';
import { dbFileStore } from './files';
import { diskAssets } from './static';

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
  if (url.startsWith('file:')) {
    const path = url.slice('file:'.length);
    const directory = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
    if (directory) mkdirSync(directory, { recursive: true });
  }

  const db = createLibsqlDb(url, authToken);
  const assetsDirectory = process.env.ASSETS_DIR?.trim() || 'web/dist';

  cached = {
    DB: db,
    FILES: dbFileStore(db),
    APP_NAME: process.env.APP_NAME?.trim() || 'Anvil Ops',
    APP_ENV: process.env.VERCEL ? 'vercel' : 'node',
    ASSETS: diskAssets(assetsDirectory),
  } satisfies Env;
  return cached;
}

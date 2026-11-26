// Standalone Node server: the same API and SPA, running on libSQL.
// Usage: DATABASE_URL=file:.data/anvil.db npm run dev:node

import { mkdirSync } from 'node:fs';
import { serve } from '@hono/node-server';
import { app } from '../index';
import type { Env } from '../lib/db';
import { databaseConfig, loadEnv } from './env';
import { ensureSchema } from './schema';
import { diskAssets } from './static';

const loaded = loadEnv();

// A file: database needs its directory before the first query; libSQL opens the
// connection lazily, so creating it here is early enough.
const url = process.env.DATABASE_URL?.trim() || 'file:.data/anvil.db';
if (url.startsWith('file:')) {
  const path = url.slice('file:'.length);
  const directory = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
  if (directory) mkdirSync(directory, { recursive: true });
}

const env: Env = { ...loaded, ASSETS: diskAssets(process.env.ASSETS_DIR?.trim() || 'web/dist') };

// A fresh database gets the schema before the first request, so `npm run dev:node`
// works without a manual init step (the init script is still used to seed demo data).
const { url: dbUrl, authToken } = databaseConfig();
await ensureSchema(dbUrl, authToken).catch((err: unknown) => {
  console.error('anvil: could not prepare the database schema', err);
});

const port = Number(process.env.PORT ?? 3000);
const hostname = process.env.HOST ?? '0.0.0.0';

serve({ fetch: (request) => app.fetch(request, env), port, hostname }, (info) => {
  console.log(`Anvil Ops (Node) listening on http://${hostname}:${info.port}`);
});

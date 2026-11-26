// Standalone Node server: the same API, SPA and cron route, running on libSQL.
// Usage: DATABASE_URL=file:.data/anvil.db npm run dev:node

import { serve } from '@hono/node-server';
import { createNodeApp } from './app';
import { loadEnv } from './env';

const env = loadEnv();
const app = createNodeApp();
const port = Number(process.env.PORT ?? 3000);
const hostname = process.env.HOST ?? '0.0.0.0';

serve({ fetch: (request) => app.fetch(request, env), port, hostname }, (info) => {
  console.log(`Anvil Ops (Node) listening on http://${hostname}:${info.port}`);
});

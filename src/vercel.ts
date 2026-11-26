// Vercel entrypoint (Vercel Services, framework "hono").
//
// Vercel calls Web-standard handlers with a Request, so the shared Hono app is
// invoked directly with the environment built from process.env. Database,
// document storage and cron all come from src/node.

import { createNodeApp } from './node/app';
import { loadEnv } from './node/env';

const env = loadEnv();
const app = createNodeApp();

export default async function handler(request: Request): Promise<Response> {
  return app.fetch(request, env);
}

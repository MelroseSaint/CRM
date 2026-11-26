// Vercel entrypoint (Vercel Services, framework "hono").
//
// Vercel calls Web-standard handlers with a Request, so the shared Hono app is
// invoked directly with the environment built from process.env. Database and
// document storage come from src/node.

import { app } from './index';
import { loadEnv } from './node/env';

const env = loadEnv();

export default async function handler(request: Request): Promise<Response> {
  return app.fetch(request, env);
}

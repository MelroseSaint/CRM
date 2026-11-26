// Vercel entrypoint (Vercel Services, framework "hono").
//
// Vercel's Hono integration requires the default export to be a Hono instance
// and calls it as app.fetch(request). The environment is therefore injected by
// middleware rather than passed as the second argument, and it is resolved
// lazily so a missing database configuration returns a readable 503 instead of
// crashing the module before Vercel can log anything.

import { Hono } from 'hono';
import { app } from './index';
import type { Env } from './lib/db';
import { databaseConfig, loadEnv } from './node/env';
import { ensureSchema } from './node/schema';

let cachedEnv: Env | null = null;

function resolveEnv(): Env {
  if (!cachedEnv) cachedEnv = loadEnv();
  return cachedEnv;
}

function isApi(path: string): boolean {
  return path.startsWith('/api/') || path.startsWith('/app/api/');
}

function failure(c: { req: { path: string } }, status: number, code: string, message: string): Response {
  if (isApi(c.req.path)) {
    return new Response(JSON.stringify({ error: { code, message } }), {
      status,
      headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
    });
  }
  return new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Anvil Ops — server error</title></head>` +
      `<body style="font:15px/1.6 ui-sans-serif,system-ui;margin:0;background:#e7e4da;color:#16171a">` +
      `<main style="max-width:620px;margin:80px auto;padding:0 24px">` +
      `<h1 style="font-size:24px">${code}</h1><p>${message}</p></main></body></html>`,
    { status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } },
  );
}

function databaseMessage(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  if (/DATABASE_URL|DATABASE_AUTH_TOKEN|not configured/i.test(message)) return message;
  if (/SQLITE|libsql|fetch failed|ECONN|ENOTFOUND|unable to open/i.test(message)) {
    return 'The database is unreachable. Check DATABASE_URL and DATABASE_AUTH_TOKEN in the Vercel project, then redeploy.';
  }
  return 'The server could not complete the request. Check the function logs for this deployment.';
}

const server = new Hono<{ Bindings: Env }>();

server.use('*', async (c, next) => {
  if (!c.env || !(c.env as Partial<Env>).DB) {
    try {
      (c as unknown as { env: Env }).env = resolveEnv();
    } catch (err) {
      console.error('anvil: configuration error', err);
      return failure(c, 503, 'server_not_configured', databaseMessage(err));
    }
  }
  try {
    // Serverless deployments have no shell step, so the schema is applied on the
    // first request against an empty database; later requests reuse the promise.
    const { url, authToken } = databaseConfig();
    await ensureSchema(url, authToken);
  } catch (err) {
    console.error('anvil: schema bootstrap failed', err);
    return failure(c, 503, 'database_unavailable', databaseMessage(err));
  }
  try {
    await next();
  } catch (err) {
    console.error('anvil: unhandled request error', err);
    return failure(c, 503, 'database_unavailable', databaseMessage(err));
  }
});

server.route('/', app as unknown as Hono<{ Bindings: Env }>);

export default server;

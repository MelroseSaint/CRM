// Anvil Ops — Worker entry point: JSON app API, integration API, SPA assets, scheduled jobs.

import { Hono, type Context } from 'hono';
import { getCookie } from 'hono/cookie';
import type { AppVars } from './lib/auth';
import { clientIp, loadSession, serializeCsrfCookie } from './lib/auth';
import type { Env } from './lib/db';
import { getSettings, sweepOverdueInvoices } from './lib/db';
import { navCounts } from './lib/http';
import { randomToken } from './lib/util';
import { apiV1Routes } from './api/v1';
import { appApiRoutes } from './api/app';
import { processPendingDeliveries } from './lib/webhooks';
import { runDueChecks } from './lib/monitor';

const app = new Hono<{ Bindings: Env; Variables: AppVars }>();

function securityHeaders(c: { req: { url: string } }, res: Response): void {
  const h = res.headers;
  h.set('X-Content-Type-Options', 'nosniff');
  h.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  h.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  h.set('Cross-Origin-Opener-Policy', 'same-origin');
  h.set('Cross-Origin-Resource-Policy', 'same-origin');
  h.set('X-Permitted-Cross-Domain-Policies', 'none');
  if (new URL(c.req.url).protocol === 'https:') h.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
}

// ---------------------------------------------------------------- static assets
app.get('/favicon.ico', (c) => c.redirect('/favicon.svg', 302));
app.get('/assets/favicon.svg', (c) =>
  c.body(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="6" fill="#0f5c4a"/><path d="M9 23 16 8l7 15" stroke="#fff" stroke-width="2.2" fill="none" stroke-linejoin="round"/><path d="M12.5 18h7" stroke="#fff" stroke-width="2.2"/></svg>`,
    200,
    { 'content-type': 'image/svg+xml', 'cache-control': 'public, max-age=86400' },
  ),
);

// An empty database is the correct first-run state, but a database that was
// never initialised must say so instead of failing as an opaque 500 behind the
// sign-in form.
function isMissingSchema(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /no such table|no such column|unable to open database|SQLITE_(ERROR|CANTOPEN)|D1_ERROR/i.test(message);
}

function databaseNotInitialised(c: Context): Response {
  const message =
    'The database has not been initialised. Apply src/db/schema.sql — npm run db:init for the ' +
    'Cloudflare Worker, or npm run db:init:node for Node/Vercel — then reload this page.';
  const path = new URL(c.req.url).pathname;
  if (path.startsWith('/api/') || path.startsWith('/app/api/')) {
    return c.json({ error: { code: 'database_not_initialised', message } }, 503);
  }
  return c.html(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Anvil Ops — database not initialised</title>
     <style>body{font:15px/1.6 ui-sans-serif,system-ui;margin:0;background:#f4f2ed;color:#16181b}
     main{max-width:620px;margin:80px auto;padding:0 24px}h1{font-family:Georgia,serif;font-size:24px}
     code{background:#fff;border:1px solid #e3e0d8;border-radius:4px;padding:2px 5px}</style></head>
     <body><main><h1>The database has not been initialised</h1>
     <p>Apply the schema, then create the first administrator at <code>/setup</code>:</p>
     <p><code>npm run db:init</code> for the Cloudflare Worker, or
     <code>npm run db:init:node</code> for Node/Vercel.</p>
     <p>${message}</p></main></body></html>`,
    503,
  );
}

// ---------------------------------------------------------------- request context
app.use('*', async (c, next) => {
  c.set('ip', clientIp(c));
  let session: Awaited<ReturnType<typeof loadSession>>;
  let settings: Record<string, string>;
  try {
    session = await loadSession(c);
    settings = await getSettings(c.env.DB);
  } catch (err) {
    if (isMissingSchema(err)) return databaseNotInitialised(c);
    throw err;
  }
  c.set('user', session.user);
  c.set('sessionId', session.sessionId);

  let csrf = session.csrf;
  if (!csrf) {
    csrf = getCookie(c, 'anvil_csrf') ?? '';
    if (!csrf) csrf = randomToken(24);
  }
  c.set('csrf', csrf);
  c.set('settings', settings);
  c.set('navCounts', {});
  c.set('cookies', []);
  if (!session.csrf && !getCookie(c, 'anvil_csrf')) {
    c.set('cookies', [serializeCsrfCookie(c, csrf)]);
  }

  await next();

  for (const cookie of (c.get('cookies') as string[] | undefined) ?? []) {
    c.res.headers.append('Set-Cookie', cookie);
  }

  securityHeaders(c, c.res);
  const path = new URL(c.req.url).pathname;
  const isHtml = (c.res.headers.get('content-type') ?? '').includes('text/html');
  if (isHtml) {
    c.res.headers.set(
      'Content-Security-Policy',
      [
        "default-src 'self'",
        "script-src 'self'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: https:",
        "font-src 'self' data:",
        "connect-src 'self'",
        "frame-ancestors 'self' https://*.freebuff.site https://*.agent37.app",
        "frame-src 'none'",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
      ].join('; '),
    );
    c.res.headers.delete('X-Frame-Options');
  }
  if (path.startsWith('/api/') || path.startsWith('/app/api/')) {
    c.res.headers.set('Cache-Control', 'private, no-store');
  }
});

// ---------------------------------------------------------------- APIs
app.route('/app/api', appApiRoutes());
app.route('/', apiV1Routes());

// ---------------------------------------------------------------- SPA
const SPA_HEADERS = {
  'content-type': 'text/html; charset=utf-8',
  'cache-control': 'no-store',
};

app.get('*', async (c) => {
  const path = new URL(c.req.url).pathname;
  if (path.startsWith('/api/') || path.startsWith('/app/api/')) {
    return c.json({ error: { code: 'not_found', message: `No endpoint matches ${c.req.method} ${path}.` } }, 404);
  }
  if (path.includes('.') && !path.endsWith('.html')) {
    // Built JS/CSS/images. Cloudflare's asset layer answers these before the
    // Worker runs; Node has no such layer, so resolve them here and never fall
    // back to the SPA shell for a missing asset.
    const asset = c.env.ASSETS ? await c.env.ASSETS.fetch(new URL(path, c.req.url).toString()) : null;
    if (!asset || !asset.ok) return c.text('Not found', 404);
    return asset;
  }

  const assets = c.env.ASSETS;
  if (!assets) {
    return c.html(
      `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Anvil Ops</title>
       <style>body{font:15px/1.6 ui-sans-serif,system-ui;margin:0;background:#f4f2ed;color:#16181b}
       main{max-width:620px;margin:80px auto;padding:0 24px}h1{font-family:Georgia,serif;font-size:24px}
       code{background:#fff;border:1px solid #e3e0d8;border-radius:4px;padding:2px 5px}
       pre{background:#fff;border:1px solid #e3e0d8;border-radius:8px;padding:14px;overflow:auto}</style></head>
       <body><main><h1>The React application has not been built yet</h1>
       <p>The Worker is running, but no compiled assets were found. Build the front end and reload:</p>
       <pre>npm install\nnpm run build</pre>
       <p>Then start the Worker with <code>npm run dev</code>. The integration API at
       <code>/api/v1/health</code> is available now.</p></main></body></html>`,
      503,
    );
  }

  const res = await assets.fetch(new URL('/index.html', c.req.url).toString());
  if (!res.ok) return c.text('Application shell unavailable.', 503);
  return new Response(res.body, { status: 200, headers: SPA_HEADERS });
});

app.onError((err, c) => {
  console.error('Unhandled error', err);
  const path = new URL(c.req.url).pathname;
  if (path.startsWith('/api/') || path.startsWith('/app/api/')) {
    return c.json({ error: { code: 'internal_error', message: 'An unexpected error occurred.' } }, 500);
  }
  return c.text('Something went wrong. The failure has been logged.', 500);
});

// ---------------------------------------------------------------- scheduled jobs
export default {
  fetch: app.fetch,
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(
      (async () => {
        await sweepOverdueInvoices(env.DB);
        await runDueChecks(env, 25);
        await processPendingDeliveries(env, 20);
      })(),
    );
  },
} satisfies ExportedHandler<Env>;

export { app };

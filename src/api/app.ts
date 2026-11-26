// JSON API for the React application, mounted at /app/api.
// Browser sessions and CSRF protection apply to every non-GET request.

import { Hono } from 'hono';
import type { AppVars } from '../lib/auth';
import { csrfValid } from '../lib/auth';
import type { Env } from '../lib/db';
import { apiReferenceBody } from '../docs/api-reference';
import { consumeRateLimit } from '../lib/ratelimit';
import { fail, json } from './app-helpers';
import { appAuthRoutes } from './app-auth';
import { appPeopleRoutes } from './app-people';
import { appWorkRoutes } from './app-work';
import { appMoneyRoutes } from './app-money';
import { appConsoleRoutes } from './app-console';

/**
 * Rejects browser writes that did not originate from this application. Browsers
 * always send Origin on cross-site writes; same-origin fetches send our own host.
 * Requests without Origin (curl, scripts, tests) still need a valid CSRF token.
 */
function trustedOrigin(c: { req: { header: (n: string) => string | undefined; url: string } }): boolean {
  // Browsers set Sec-Fetch-Site themselves and scripts cannot forge it, so it is
  // the reliable signal: a cross-site write is never allowed. Reverse proxies may
  // rewrite Host/URL to an internal address, so Origin is only a fallback for
  // older clients that do not send fetch metadata.
  const site = c.req.header('sec-fetch-site');
  if (site) return site !== 'cross-site';
  const origin = c.req.header('origin');
  if (!origin) return true;
  const hosts = new Set([c.req.header('host') ?? '', new URL(c.req.url).host]);
  try {
    return hosts.has(new URL(origin).host);
  } catch {
    return false;
  }
}

const PORTAL_WRITE_LIMIT = 30;
const PORTAL_WRITE_WINDOW_SECONDS = 60 * 60;

export function appApiRoutes() {
  const app = new Hono<{ Bindings: Env; Variables: AppVars }>();

  app.use('*', async (c, next) => {
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(c.req.method)) {
      if (!trustedOrigin(c)) return fail(403, 'This origin is not allowed to change data.');
      const token = c.req.header('x-csrf-token') ?? '';
      if (!csrfValid(c, token)) {
        return fail(403, 'The request token is missing or expired. Reload the page and try again.');
      }
    }
    await next();
  });

  // One client account cannot flood portal writes: 30 changes per hour, counted
  // in D1 so the budget holds across isolates and deploys. Reads are unlimited.
  app.use('/portal/*', async (c, next) => {
    const user = c.get('user');
    if (user?.role === 'client' && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(c.req.method)) {
      const budget = await consumeRateLimit(
        c.env.DB,
        `portal:user:${user.id}`,
        PORTAL_WRITE_LIMIT,
        PORTAL_WRITE_WINDOW_SECONDS,
      );
      if (!budget.allowed) {
        const response = fail(
          429,
          `Too many portal changes. Try again in ${Math.max(1, Math.ceil(budget.retryAfter / 60))} minute(s).`,
        );
        response.headers.set('retry-after', String(budget.retryAfter));
        return response;
      }
    }
    await next();
  });

  app.route('/', appAuthRoutes());
  app.route('/', appPeopleRoutes());
  app.route('/', appWorkRoutes());
  app.route('/', appMoneyRoutes());
  app.route('/', appConsoleRoutes());

  app.get('/api-docs', async (c) => {
    const user = c.get('user');
    if (!user) return fail(401, 'Sign in to view the API reference.');
    if (user.role === 'client') return fail(403, 'Staff access required.');
    return json({ html: apiReferenceBody() });
  });

  app.notFound((c) => fail(404, `No endpoint matches ${c.req.method} ${new URL(c.req.url).pathname}.`));

  return app;
}

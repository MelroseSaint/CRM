// JSON API for the React application, mounted at /app/api.
// Browser sessions and CSRF protection apply to every non-GET request.

import { Hono } from 'hono';
import type { AppVars } from '../lib/auth';
import { csrfValid } from '../lib/auth';
import type { Env } from '../lib/db';
import { apiReferenceBody } from '../docs/api-reference';
import { fail, json } from './app-helpers';
import { appAuthRoutes } from './app-auth';
import { appPeopleRoutes } from './app-people';
import { appWorkRoutes } from './app-work';
import { appMoneyRoutes } from './app-money';
import { appConsoleRoutes } from './app-console';

export function appApiRoutes() {
  const app = new Hono<{ Bindings: Env; Variables: AppVars }>();

  app.use('*', async (c, next) => {
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(c.req.method)) {
      const token = c.req.header('x-csrf-token') ?? '';
      if (!csrfValid(c, token)) {
        return fail(403, 'The request token is missing or expired. Reload the page and try again.');
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

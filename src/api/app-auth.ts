// Session, first-run setup and sign-out for the React application.

import { Hono } from 'hono';
import { getCookie } from 'hono/cookie';
import type { AppVars, AuthUser } from '../lib/auth';
import {
  audit,
  clientIp,
  countRecentLoginFailures,
  createSession,
  destroySession,
  hashPassword,
  queueCookie,
  recordLoginAttempt,
  serializeCsrfCookie,
  verifyPassword,
} from '../lib/auth';
import type { Env } from '../lib/db';
import { getSettings, one, run, setSetting } from '../lib/db';
import { navCounts } from '../lib/http';
import { randomToken } from '../lib/util';
import { fail, json, readBody, str } from './app-helpers';

export function appAuthRoutes() {
  const app = new Hono<{ Bindings: Env; Variables: AppVars }>();

  app.get('/session', async (c) => {
    const user = c.get('user');
    const users = await one<{ c: number }>(c.env.DB, 'SELECT COUNT(*) AS c FROM users');
    const settings = c.get('settings');
    const nav = user && user.role !== 'client' ? await navCounts(c.env.DB) : {};
    return json({
      user: user
        ? {
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
            client_id: user.client_id,
            client_name: user.client_name ?? null,
          }
        : null,
      csrf: c.get('csrf'),
      setup_needed: Number(users?.c ?? 0) === 0,
      settings: {
        business_name: settings.business_name ?? 'Anvil Ops',
        currency: settings.currency ?? 'USD',
        portal_welcome: settings.portal_welcome ?? '',
        demo_mode: settings.demo_mode === '1',
      },
      nav,
    });
  });

  app.post('/session', async (c) => {
    const body = await readBody(c);
    const email = str(body, 'email', 200).toLowerCase();
    const password = str(body, 'password', 400);
    const ip = clientIp(c);
    if (!email || !password) return fail(422, 'Enter your email and password.', { email: 'Required.' });

    const failures = await countRecentLoginFailures(c.env.DB, email, ip);
    if (failures >= 8) {
      return fail(429, 'Too many failed attempts. Wait 15 minutes before trying again.');
    }

    const user = await one<
      AuthUser & { password_hash: string; password_salt: string; iterations: number }
    >(
      c.env.DB,
      `SELECT id, email, name, role, client_id, status, password_hash, password_salt, iterations
         FROM users WHERE email = ?`,
      email,
    );

    // Always run PBKDF2 so a missing account cannot be told apart by response time.
    const ok = await verifyPassword(
      password,
      user?.password_hash ?? 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      user?.password_salt ?? 'AAAAAAAAAAAAAAAAAAAAAA',
      user?.iterations ?? 150_000,
    );
    if (!user || !ok || user.status !== 'active') {
      await recordLoginAttempt(c.env.DB, email, ip, false);
      await audit(c, 'auth.login_failed', 'user', user?.id ?? null, { email });
      return fail(401, 'Email or password is incorrect.');
    }

    await recordLoginAttempt(c.env.DB, email, ip, true);
    await createSession(c, user.id, ip, c.req.header('user-agent') ?? '');
    await run(c.env.DB, 'UPDATE users SET last_login_at = ? WHERE id = ?', new Date().toISOString(), user.id);
    c.set('user', { ...user, client_name: null });
    await audit(c, 'auth.login', 'user', user.id, { email });

    // The session endpoint is fetched straight after sign-in; return the same shape.
    const session = await one<{ csrf_token: string }>(
      c.env.DB,
      'SELECT csrf_token FROM sessions WHERE user_id = ? ORDER BY created_at DESC LIMIT 1',
      user.id,
    );
    const nav = user.role !== 'client' ? await navCounts(c.env.DB) : {};
    return json({
      user: { id: user.id, name: user.name, email: user.email, role: user.role, client_id: user.client_id },
      csrf: session?.csrf_token ?? '',
      nav,
    });
  });

  app.delete('/session', async (c) => {
    const user = c.get('user');
    if (user) await audit(c, 'auth.logout', 'user', user.id, null);
    await destroySession(c, c.get('sessionId'));
    // A fresh anonymous token so the next sign-in attempt has one.
    queueCookie(c, serializeCsrfCookie(c, randomToken(24)));
    return json({ ok: true });
  });

  app.post('/setup', async (c) => {
    const body = await readBody(c);
    const count = await one<{ c: number }>(c.env.DB, 'SELECT COUNT(*) AS c FROM users');
    if (Number(count?.c ?? 0) > 0) return fail(409, 'This workspace already has an account. Sign in instead.');

    const name = str(body, 'name', 120);
    const email = str(body, 'email', 200).toLowerCase();
    const password = str(body, 'password', 400);
    const password2 = str(body, 'password2', 400);
    const business = str(body, 'business', 160);
    const fields: Record<string, string> = {};
    if (!name) fields.name = 'Enter your name.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fields.email = 'Enter a valid email address.';
    if (password.length < 10) fields.password = 'Use at least 10 characters.';
    if (password !== password2) fields.password2 = 'Passwords do not match.';
    if (Object.keys(fields).length) return fail(422, 'Check the highlighted fields.', fields);

    const { hash, salt, iterations } = await hashPassword(password);
    const res = await run(
      c.env.DB,
      `INSERT INTO users(email, name, role, client_id, password_hash, password_salt, iterations, status, created_at)
       VALUES(?,?,?,?,?,?,?,?,?)`,
      email,
      name,
      'admin',
      null,
      hash,
      salt,
      iterations,
      'active',
      new Date().toISOString(),
    );
    const id = Number(res.meta.last_row_id ?? 0);
    if (business) await setSetting(c.env.DB, 'business_name', business);
    await createSession(c, id, clientIp(c), c.req.header('user-agent') ?? '');
    await audit(c, 'auth.setup', 'user', id, { email });
    c.set('user', {
      id,
      email,
      name,
      role: 'admin',
      client_id: null,
      status: 'active',
    } as AuthUser);
    return json({ user: { id, name, email, role: 'admin', client_id: null }, csrf: c.get('csrf'), nav: await navCounts(c.env.DB) }, 201);
  });

  app.get('/settings/public', async (c) => {
    const settings = await getSettings(c.env.DB);
    return json({
      business_name: settings.business_name ?? '',
      currency: settings.currency ?? 'USD',
      demo_mode: settings.demo_mode === '1',
    });
  });

  app.get('/csrf', (c) => json({ csrf: c.get('csrf') }));

  // Reads the CSRF cookie for diagnostic purposes only (never exposes the session).
  app.get('/ping', (c) => json({ ok: true, csrf_cookie: Boolean(getCookie(c, 'anvil_csrf')), now: new Date().toISOString() }));

  return app;
}


// Wraps the shared Hono application for Node runtimes, adding the cron route
// that replaces the Cloudflare `scheduled` handler.

import { Hono } from 'hono';
import { app } from '../index';
import type { Env } from '../lib/db';
import { cronHandler } from './cron';

export function createNodeApp(): Hono<{ Bindings: Env }> {
  const root = new Hono<{ Bindings: Env }>();
  root.get('/api/cron', cronHandler);
  root.route('/', app as unknown as Hono<{ Bindings: Env }>);
  return root;
}

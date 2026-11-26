// Schema bootstrap for the Node/Vercel runtime.
//
// Cloudflare applies the schema with `wrangler d1 execute`; a serverless libSQL
// deployment has no shell step, so the first request checks for the schema and
// applies it when the database is empty. Every statement in schema.sql is
// idempotent, but the check keeps normal cold starts to one small query.

import { createClient } from '@libsql/client';
import { SCHEMA_SQL } from '../db/schema-sql';

let ready: Promise<void> | null = null;

export function ensureSchema(url: string, authToken?: string): Promise<void> {
  ready ??= apply(url, authToken).catch((err: unknown) => {
    ready = null; // let the next request retry instead of caching a failure
    throw err;
  });
  return ready;
}

async function apply(url: string, authToken?: string): Promise<void> {
  const client = authToken ? createClient({ url, authToken }) : createClient({ url });
  try {
    const check = await client.execute({
      sql: "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'settings'",
      args: [],
    });
    if (check.rows.length > 0) return;
    await client.executeMultiple(SCHEMA_SQL);
    console.log('anvil: applied schema to an empty database');
  } finally {
    client.close();
  }
}

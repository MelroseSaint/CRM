// Applies the shared schema (and optionally the demo seed) to a libSQL database.
// Usage: DATABASE_URL=file:.data/anvil.db npm run db:init:node [-- --demo]

import { mkdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { execSqlFile } from '../src/node/db-libsql';

const url = process.env.DATABASE_URL?.trim() || 'file:.data/anvil.db';
const authToken = process.env.DATABASE_AUTH_TOKEN?.trim() || undefined;
if (url.startsWith('file:')) {
  const path = url.slice('file:'.length);
  const directory = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
  if (directory) mkdirSync(directory, { recursive: true });
}

const schema = await readFile('src/db/schema.sql', 'utf8');
await execSqlFile(url, schema, authToken);
console.log(`Schema applied to ${url}`);

if (process.argv.includes('--demo')) {
  const demo = await readFile('scripts/demo.sql', 'utf8');
  await execSqlFile(url, demo, authToken);
  console.log('Demo seed applied (fresh databases only).');
}

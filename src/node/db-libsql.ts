// libSQL (Turso / local SQLite) implementation of the portable Db interface.
//
// The application SQL is written once against prepare/bind/all/first/run, so the
// same statements that run on Cloudflare D1 run here without translation.

import { createClient, type Client } from '@libsql/client';
import type { Db, DbStatement } from '../lib/db';

function normalize(value: unknown): unknown {
  if (value === undefined) return null;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  return value;
}

class LibsqlStatement implements DbStatement {
  constructor(
    private readonly client: Client,
    private readonly sql: string,
    private readonly args: unknown[] = [],
  ) {}

  bind(...values: unknown[]): DbStatement {
    return new LibsqlStatement(this.client, this.sql, values.map(normalize));
  }

  async all<T = Record<string, unknown>>(): Promise<{ results?: T[] }> {
    const result = await this.client.execute({ sql: this.sql, args: this.args as never[] });
    return { results: result.rows as unknown as T[] };
  }

  async first<T = Record<string, unknown>>(): Promise<T | null> {
    const result = await this.all<T>();
    return result.results?.[0] ?? null;
  }

  async run(): Promise<{ success?: boolean; meta?: { last_row_id?: number; changes?: number } }> {
    const result = await this.client.execute({ sql: this.sql, args: this.args as never[] });
    return {
      success: true,
      meta: {
        last_row_id: Number(result.lastInsertRowid ?? 0),
        changes: Number(result.rowsAffected ?? 0),
      },
    };
  }
}

export function createLibsqlDb(url: string, authToken?: string): Db {
  const client = authToken ? createClient({ url, authToken }) : createClient({ url });
  return {
    prepare(sql: string): DbStatement {
      return new LibsqlStatement(client, sql);
    },
  };
}

/** Runs a multi-statement SQL file (schema or demo seed) against a libSQL database. */
export async function execSqlFile(url: string, sql: string, authToken?: string): Promise<void> {
  const client = authToken ? createClient({ url, authToken }) : createClient({ url });
  try {
    await client.executeMultiple(sql);
  } finally {
    client.close();
  }
}

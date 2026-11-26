// Portable file storage for non-Worker runtimes.
//
// Cloudflare keeps uploads in R2. Vercel has no R2 binding, so this store keeps
// the same key/value contract in a SQLite BLOB table (file_blobs). Documents are
// capped at 20 MB by the upload route, well under serverless request limits.

import type { Db, FileStore, StoredFile } from '../lib/db';
import { one, run } from '../lib/db';

function toBytes(value: ReadableStream | ArrayBuffer | Uint8Array): Promise<Uint8Array> {
  if (value instanceof Uint8Array) return Promise.resolve(value);
  if (value instanceof ArrayBuffer) return Promise.resolve(new Uint8Array(value));
  return new Response(value).arrayBuffer().then((buf) => new Uint8Array(buf));
}

function asBytes(value: unknown): Uint8Array {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (typeof value === 'string') return new TextEncoder().encode(value);
  return new Uint8Array();
}

export function dbFileStore(db: Db): FileStore {
  return {
    async put(key, value, options): Promise<unknown> {
      const bytes = await toBytes(value);
      const contentType = options?.httpMetadata?.contentType ?? 'application/octet-stream';
      await run(
        db,
        `INSERT INTO file_blobs(key, content, content_type, size, created_at) VALUES(?,?,?,?,?)
         ON CONFLICT(key) DO UPDATE SET
           content = excluded.content,
           content_type = excluded.content_type,
           size = excluded.size,
           created_at = excluded.created_at`,
        key,
        bytes,
        contentType,
        bytes.byteLength,
        new Date().toISOString(),
      );
      return { key, size: bytes.byteLength };
    },

    async get(key): Promise<StoredFile | null> {
      const row = await one<{ content: unknown; content_type: string | null; size: number | null }>(
        db,
        'SELECT content, content_type, size FROM file_blobs WHERE key = ?',
        key,
      );
      if (!row) return null;
      const bytes = asBytes(row.content);
      return {
        body: new Response(bytes).body as ReadableStream,
        size: row.size ?? bytes.byteLength,
        httpMetadata: { contentType: row.content_type ?? 'application/octet-stream' },
      };
    },

    async delete(key): Promise<unknown> {
      await run(db, 'DELETE FROM file_blobs WHERE key = ?', key);
      return { deleted: true };
    },
  };
}

// Disk-backed AssetStore used by the Node server and the Vercel function when a
// built SPA is present next to it. Cloudflare keeps using the ASSETS binding.

import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import type { AssetStore } from '../lib/db';

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
};

export function diskAssets(directory: string): AssetStore {
  const root = resolve(directory);
  return {
    async fetch(input: Request | string): Promise<Response> {
      const url = typeof input === 'string' ? new URL(input, 'http://localhost') : new URL(input.url);
      const pathname = decodeURIComponent(url.pathname);
      const relative = normalize(pathname).replace(/^([/\\])+/, '');
      const target = join(root, relative);
      if (!target.startsWith(root)) return new Response('Not found', { status: 404 });
      try {
        const info = await stat(target);
        if (!info.isFile()) return new Response('Not found', { status: 404 });
        const body = await readFile(target);
        return new Response(body, {
          status: 200,
          headers: {
            'content-type': MIME[extname(target).toLowerCase()] ?? 'application/octet-stream',
            'content-length': String(body.byteLength),
          },
        });
      } catch {
        return new Response('Not found', { status: 404 });
      }
    },
  };
}

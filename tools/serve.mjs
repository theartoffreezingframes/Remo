#!/usr/bin/env node
/* Zero-dependency static preview server for local development.
 *
 *   node tools/serve.mjs            # http://localhost:8000
 *   PORT=9000 node tools/serve.mjs
 *
 * Serves the repo root with no-store caching so edits are picked up on reload,
 * and redirects "/" to the built single-file game.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT) || 8000;
const HOST = process.env.HOST || '0.0.0.0';

const TARGET = '/double-game.html';
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

const server = http.createServer((req, res) => {
  const url = decodeURIComponent((req.url || '/').split('?')[0]);

  if (url === '/' || url === '') {
    res.writeHead(302, { Location: TARGET });
    return res.end();
  }

  // resolve inside the repo root only
  const abs = path.resolve(root, '.' + path.posix.normalize(url));
  if (!abs.startsWith(root + path.sep) && abs !== root) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    return res.end('forbidden');
  }

  fs.readFile(abs, (err, buf) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end(`not found: ${url}\n(run 'npm run build' first if ${TARGET} is missing)`);
    }
    res.writeHead(200, {
      'Content-Type': TYPES[path.extname(abs).toLowerCase()] || 'application/octet-stream',
      'Content-Length': buf.length,
      'Cache-Control': 'no-store',
    });
    res.end(buf);
  });
});

server.listen(PORT, HOST, () => {
  console.log(`[preview] serving ${root} on http://${HOST}:${PORT}`);
  console.log(`[preview] ${TARGET} — run 'npm run build' if it is missing`);
});

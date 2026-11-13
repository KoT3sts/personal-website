import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../web/', import.meta.url));
const port = Number(process.env.PORT || 4173);
const mime = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8', '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.pdf': 'application/pdf', '.woff2': 'font/woff2',
};
const headers = file => ({ 'Content-Type': mime[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-cache' });

// Unknown paths get the site's own 404 page (like the static host), with status 404.
async function notFound(response) {
  const page = path.join(root, '404.html');
  try { response.writeHead(404, headers(page)).end(await readFile(page)); }
  catch { response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not found'); }
}

http.createServer(async (request, response) => {
  let file;
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    file = path.resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
  } catch {
    response.writeHead(400).end('Bad request');
    return;
  }
  const relative = path.relative(root, file);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    response.writeHead(403).end('Forbidden');
    return;
  }
  let body;
  try { body = await readFile(file); }
  catch { await notFound(response); return; }
  response.writeHead(200, headers(file));
  response.end(body);
}).listen(port, '127.0.0.1', () => console.log(`Local: http://127.0.0.1:${port}`));

// Production files that ship next to the page: robots.txt, sitemap.xml, the
// 404 page, the touch icon and the web manifest. Plain text checks, no DOM.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { access, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const web = new URL('../web/', import.meta.url);
const read = path => readFile(new URL(path, web), 'utf8');
const exists = path => access(new URL(path, web)).then(() => true, () => false);
const meta = (html, attr, name) => html.match(new RegExp(`<meta ${attr}="${name}" content="([^"]*)"`))?.[1];

async function siteUrl() {
  const html = await read('index.html');
  const canonical = html.match(/<link rel="canonical" href="([^"]+)"/)?.[1];
  assert.ok(canonical, 'index.html has a canonical link');
  return canonical;
}

test('index.html: canonical, og:url and the JSON-LD url agree and are absolute https', async () => {
  const html = await read('index.html');
  const canonical = await siteUrl();
  assert.match(canonical, /^https:\/\/[^/]+\/$/);
  assert.equal(meta(html, 'property', 'og:url'), canonical);
  const ld = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
  assert.equal(ld['@type'], 'Person');
  assert.equal(ld.url, canonical);
  for (const key of ['og:image', 'twitter:image']) {
    const value = meta(html, 'property', key) || meta(html, 'name', key);
    assert.ok(value?.startsWith(canonical), `${key} is absolute on the site`);
    assert.ok(await exists(value.slice(canonical.length)), `${key} file exists`);
  }
});

test('robots.txt allows everything and points at the absolute sitemap', async () => {
  const robots = await read('robots.txt');
  const lines = robots.split('\n').map(line => line.trim()).filter(Boolean);
  assert.ok(lines.includes('User-agent: *'));
  assert.ok(lines.includes('Allow: /'));
  assert.ok(!lines.some(line => /^Disallow:\s*\S/.test(line)), 'nothing is disallowed');
  assert.ok(lines.includes(`Sitemap: ${await siteUrl()}sitemap.xml`));
});

test('sitemap.xml lists the homepage, the six project pages, the evaluation lab, the build trace, the agent-evaluation notes, the agent observability lab and the Now page with ISO lastmods', async () => {
  const xml = await read('sitemap.xml');
  assert.match(xml, /^<\?xml version="1\.0" encoding="UTF-8"\?>\n<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/);
  assert.match(xml, /<\/urlset>\s*$/);
  assert.equal(xml.match(/<url>/g)?.length, 12);
  const site = await siteUrl();
  const slugs = ['agent-workflow', 'thoughts-to-text', 'companion-chatbot', 'voicelab', 'work-helper', 'barking-village'];
  assert.deepEqual([...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => match[1]), [site, ...slugs.map(slug => `${site}projects/${slug}.html`), `${site}lab/sentiment-eval.html`, `${site}lab/build-trace.html`, `${site}lab/evaluating-agents.html`, `${site}lab/agent-observability.html`, `${site}now.html`]);
  const lastmods = [...xml.matchAll(/<lastmod>([^<]+)<\/lastmod>/g)].map(match => match[1]);
  assert.equal(lastmods.length, 12);
  for (const lastmod of lastmods) {
    assert.match(lastmod, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(!Number.isNaN(Date.parse(lastmod)));
  }
  for (const slug of slugs) assert.ok(await exists(`projects/${slug}.html`), `projects/${slug}.html exists`);
  assert.ok(await exists('lab/sentiment-eval.html'), 'lab/sentiment-eval.html exists');
  assert.ok(await exists('lab/build-trace.html'), 'lab/build-trace.html exists');
  assert.ok(await exists('lab/evaluating-agents.html'), 'lab/evaluating-agents.html exists');
  assert.ok(await exists('lab/agent-observability.html'), 'lab/agent-observability.html exists');
  assert.ok(await exists('now.html'), 'now.html exists');
});

test('apple-touch-icon.png is a 180x180 PNG and index.html links it', async () => {
  const png = await readFile(new URL('assets/apple-touch-icon.png', web));
  assert.deepEqual([...png.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  assert.equal(png.toString('ascii', 12, 16), 'IHDR');
  assert.equal(png.readUInt32BE(16), 180);
  assert.equal(png.readUInt32BE(20), 180);
  assert.match(await read('index.html'), /<link rel="apple-touch-icon" href="\.\/assets\/apple-touch-icon\.png">/);
});

test('404.html works from any path: absolute links and assets that exist', async () => {
  const html = await read('404.html');
  assert.match(html, /^<!doctype html>\n<html lang="en">/);
  assert.match(html, /<meta name="viewport" content="width=device-width, initial-scale=1">/);
  assert.match(html, /<title>[^<]+<\/title>/);
  assert.ok(meta(html, 'name', 'description'));
  assert.equal(html.match(/<h1[\s>]/g)?.length, 1);
  const refs = [...html.matchAll(/\s(?:href|src)="([^"]+)"/g)].map(match => match[1]);
  assert.ok(refs.length >= 4);
  for (const ref of refs) {
    assert.ok(ref.startsWith('/') && !ref.startsWith('//'), `${ref} is root-absolute`);
    if (ref !== '/') assert.ok(await exists(ref.slice(1)), `${ref} exists`);
  }
  assert.ok(refs.filter(ref => ref === '/').length >= 2, 'wordmark and pill link home');
  const css = await read('404.css');
  for (const url of css.matchAll(/url\("([^"]+)"\)/g)) {
    assert.ok(url[1].startsWith('/'), `${url[1]} is root-absolute`);
    assert.ok(await exists(url[1].slice(1)), `${url[1]} exists`);
  }
});

test('site.webmanifest is valid JSON with icons that exist', async () => {
  const manifest = JSON.parse(await read('site.webmanifest'));
  assert.ok(manifest.name && manifest.short_name);
  assert.equal(manifest.start_url, '/');
  assert.match(manifest.theme_color, /^#[0-9a-f]{6}$/i);
  for (const icon of manifest.icons) assert.ok(await exists(icon.src.slice(1)), `${icon.src} exists`);
});

test('dev server: 404 page with status 404, MIME types for the new files', async () => {
  const port = 41000 + Math.floor(Math.random() * 2000);
  const server = spawn(process.execPath, [fileURLToPath(new URL('../scripts/serve.mjs', import.meta.url))], { env: { ...process.env, PORT: String(port) }, stdio: ['ignore', 'pipe', 'inherit'] });
  try {
    await new Promise((resolve, reject) => {
      server.stdout.once('data', resolve);
      server.once('exit', code => reject(new Error(`server exited ${code}`)));
    });
    const get = path => fetch(`http://127.0.0.1:${port}${path}`);
    const missing = await get('/no/such/page');
    assert.equal(missing.status, 404);
    assert.match(missing.headers.get('content-type'), /^text\/html/);
    assert.match(await missing.text(), /<title>Page not found/);
    const types = {
      '/': /^text\/html/, '/robots.txt': /^text\/plain/, '/sitemap.xml': /^application\/xml/,
      '/site.webmanifest': /^application\/manifest\+json/, '/assets/apple-touch-icon.png': /^image\/png$/,
      '/assets/cesar-portrait-560.webp': /^image\/webp$/, '/404.css': /^text\/css/,
    };
    for (const [path, type] of Object.entries(types)) {
      const response = await get(path);
      assert.equal(response.status, 200, path);
      assert.match(response.headers.get('content-type'), type, path);
      await response.arrayBuffer();
    }
  } finally {
    server.kill();
  }
});

test('now.html: dated November 2026, linked from the footer, with the same head as the other pages', async () => {
  const html = await read('now.html');
  const home = await read('index.html');
  const site = await siteUrl();
  assert.match(home, /<footer id="contact"[\s\S]*<a href="\.\/now\.html">NOW /, 'the homepage footer links it');
  assert.match(html, /<link rel="canonical" href="([^"]+)">/);
  assert.equal(html.match(/<link rel="canonical" href="([^"]+)">/)[1], `${site}now.html`);
  assert.equal(meta(html, 'property', 'og:url'), `${site}now.html`);
  for (const key of ['og:title', 'og:description', 'og:image:alt', 'twitter:card']) assert.ok(meta(html, 'property', key) || meta(html, 'name', key), key);
  for (const key of ['og:image', 'twitter:image']) {
    const value = meta(html, 'property', key) || meta(html, 'name', key);
    assert.ok(await exists(value.slice(site.length)), `${key} file exists`);
  }
  const ld = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
  assert.equal(ld['@type'], 'ProfilePage');
  assert.equal(ld.url, `${site}now.html`);
  assert.equal(ld.mainEntity.name, 'Cesar Tortolero');
  assert.match(html, /<time datetime="2026-11">NOVEMBER 2026<\/time>/);
  assert.match(html, /<h1 id="cs-title">Now<\/h1>/);
});

test('the homepage social card is a 1200x630 JPEG on the site', async () => {
  const html = await read('index.html');
  const image = meta(html, 'property', 'og:image');
  assert.match(image, /\/assets\/og-home\.jpg$/);
  assert.equal(meta(html, 'name', 'twitter:image'), image);
  const jpg = await readFile(new URL('assets/og-home.jpg', web));
  assert.deepEqual([...jpg.subarray(0, 3)], [0xff, 0xd8, 0xff]);
  // The first baseline/progressive frame header holds the size.
  let at = 2;
  while (at < jpg.length && ![0xc0, 0xc2].includes(jpg[at + 1])) at += 2 + jpg.readUInt16BE(at + 2);
  assert.equal(jpg.readUInt16BE(at + 5), 630, 'height');
  assert.equal(jpg.readUInt16BE(at + 7), 1200, 'width');
  assert.equal(meta(html, 'property', 'og:image:width'), '1200');
  assert.equal(meta(html, 'property', 'og:image:height'), '630');
});

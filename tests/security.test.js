// Security guardrails for a static site: a strict Content-Security-Policy on every
// page, nothing loaded from other origins, safe external links, no HTML built
// from data, no secrets in the published files, and a security.txt contact.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const web = fileURLToPath(new URL('../web/', import.meta.url));
const walk = dir => readdirSync(dir).flatMap(name => {
  const full = path.join(dir, name);
  return statSync(full).isDirectory() ? walk(full) : [full];
});
const files = walk(web);
const pages = files.filter(file => file.endsWith('.html'));
const read = file => readFileSync(file, 'utf8');
const rel = file => path.relative(web, file);

const POLICY = [
  "default-src 'self'",
  null, // script-src: 'self' plus a hash for each inline script on that page
  "style-src 'self'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "manifest-src 'self'",
  "media-src 'none'",
  "object-src 'none'",
  "frame-src 'none'",
  "worker-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  'upgrade-insecure-requests',
];
const inlineScripts = html => [...html.matchAll(/<script(?![^>]*\bsrc=)(?![^>]*type="application\/ld\+json")[^>]*>([\s\S]*?)<\/script>/g)].map(match => match[1]);
const sha = text => `'sha256-${createHash('sha256').update(text).digest('base64')}'`;

test('every page sets the strict CSP before any script, with a hash for each inline script and no unsafe-*', () => {
  assert.equal(pages.length, 10, 'homepage, 404, six case studies and two lab pages: add new pages here on purpose');
  for (const file of pages) {
    const html = read(file).replace(/<!--[\s\S]*?-->/g, '');
    const metas = [...html.matchAll(/<meta http-equiv="Content-Security-Policy" content="([^"]+)">/g)];
    assert.equal(metas.length, 1, `${rel(file)} has exactly one CSP meta`);
    const [meta] = metas;
    // A meta CSP only covers what is requested after it, and only inside <head>.
    for (const tag of ['<script', '<link', '<style', '<img', '</head>']) {
      const at = html.indexOf(tag);
      assert.ok(at === -1 || meta.index < at, `${rel(file)}: the CSP comes before the first ${tag}`);
    }
    const directives = meta[1].split('; ');
    const scriptSrc = ["script-src 'self'", ...inlineScripts(html).map(sha)].join(' ');
    assert.deepEqual(directives, POLICY.map(entry => entry ?? scriptSrc), `${rel(file)} policy`);
    assert.doesNotMatch(meta[1], /unsafe-|\*|https?:/, `${rel(file)}: no wildcards, unsafe-* or remote origins`);
    assert.match(html, /<meta name="referrer" content="strict-origin-when-cross-origin">/, `${rel(file)} referrer policy`);
  }
});

test('nothing executable, styled or embedded comes from another origin; inline style attributes stay out of the markup', () => {
  for (const file of pages) {
    const html = read(file);
    for (const [tag] of html.matchAll(/<(?:script|link|img|iframe|source|video|audio|embed|object)\b[^>]*>/g)) {
      if (/rel="(?:canonical)"/.test(tag)) continue;
      assert.doesNotMatch(tag, /\b(?:src|href|srcset|poster|data)=["']?[^"'>\s]*(?:https?:)?\/\//, `${rel(file)}: ${tag}`);
    }
    assert.doesNotMatch(html, /\sstyle="/, `${rel(file)}: no style attributes (style-src is 'self')`);
    assert.doesNotMatch(html, /\son[a-z]+="/, `${rel(file)}: no inline event handlers`);
    assert.doesNotMatch(html, /href="javascript:/i, `${rel(file)}: no javascript: links`);
  }
  for (const file of files.filter(name => name.endsWith('.js'))) {
    assert.doesNotMatch(read(file), /\b(?:fetch|import|importScripts|WebSocket|EventSource|sendBeacon)\s*\(\s*['"`](?:https?:|wss?:)?\/\//, `${rel(file)}: no requests to other origins`);
  }
  for (const file of files.filter(name => name.endsWith('.css'))) {
    assert.doesNotMatch(read(file), /(?:@import|url\()\s*["']?(?:https?:)?\/\//, `${rel(file)}: no remote CSS resources`);
  }
});

test('links that open a new tab cannot reach back into this page', () => {
  for (const file of pages) {
    for (const [tag] of read(file).matchAll(/<a\b[^>]*target="_blank"[^>]*>/g)) {
      assert.match(tag, /rel="[^"]*\bnoopener\b[^"]*\bnoreferrer\b[^"]*"/, `${rel(file)}: ${tag}`);
    }
  }
});

test('scripts never build HTML from data: innerHTML only takes fixed markup, and there is no eval', () => {
  for (const file of files.filter(name => name.endsWith('.js'))) {
    const source = read(file);
    assert.doesNotMatch(source, /\beval\(|new Function\(|insertAdjacentHTML|outerHTML\s*\+?=|document\.write|setHTMLUnsafe|DOMParser|createContextualFragment|srcdoc|\[['"`]innerHTML['"`]\]/, `${rel(file)}: no string-to-code or HTML sinks`);
    assert.doesNotMatch(source, /\.innerHTML\s*\+=/, `${rel(file)}: no appending to innerHTML`);
    const sinks = [...source.matchAll(/\.innerHTML\s*=\s*([^;]+);/g)];
    assert.equal(sinks.length, (source.match(/\.innerHTML\s*=/g) || []).length, `${rel(file)}: every innerHTML write is checked`);
    for (const match of sinks) {
      const value = match[1].trim();
      const literal = /^'[^'\\]*'(?:\s*\+\s*'[^'\\]*')*$/.test(value) || value === 'SVG'
        // The dock's agent count: the only interpolation picks between two fixed words.
        || value === "`<span class=\"agentic-dock-agents\">${n === 1 ? 'agent' : 'agents'} </span>working`";
      assert.ok(literal, `${rel(file)}: innerHTML must be fixed markup, got ${value.slice(0, 80)}`);
    }
    // SVG is a module constant built from string literals only.
    const svg = source.match(/const SVG = ([\s\S]*?);\n/);
    if (source.includes('innerHTML = SVG')) assert.ok(svg && /^(?:'[^'\\]*'|`[^`$]*`)(?:\s*\+\s*(?:'[^'\\]*'|`[^`$]*`))*$/.test(svg[1].trim()), `${rel(file)}: SVG is fixed markup`);
  }
});

test('no credentials, keys or private files are published', () => {
  const secret = /AKIA[0-9A-Z]{16}|ghp_[A-Za-z0-9]{30,}|github_pat_|xox[abposr]-|-----BEGIN [A-Z ]*PRIVATE KEY|ATATT[A-Za-z0-9_-]{20,}|sk-[A-Za-z0-9]{32,}|AIza[0-9A-Za-z_-]{35}|(?:api[_-]?key|secret|password|token)\s*[:=]\s*["'][^"']{8,}/i;
  for (const file of files) {
    assert.doesNotMatch(path.basename(file), /^\.env|\.pem$|\.key$|^id_rsa|credential/i, `${rel(file)} should not be published`);
    if (/\.(?:html|js|css|json|webmanifest|txt|xml|svg|md)$/.test(file)) assert.doesNotMatch(read(file), secret, `${rel(file)}`);
  }
  const html = pages.map(read).join('\n');
  assert.doesNotMatch(html, /\(?\b\d{3}\)?[ .-]\d{3}[ .-]\d{4}\b/, 'no phone number in the HTML');
});

test('security.txt names a contact and has not expired', () => {
  const text = read(path.join(web, '.well-known/security.txt'));
  assert.match(text, /^Contact: mailto:\S+@\S+$/m);
  const expires = text.match(/^Expires: (\S+)$/m)?.[1];
  assert.ok(expires && Date.parse(expires) > Date.now(), `Expires in the future (${expires}); renew it yearly`);
  assert.match(text, /^Canonical: https:\/\/\S+\/\.well-known\/security\.txt$/m);
});

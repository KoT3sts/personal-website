import test from 'node:test';
import assert from 'node:assert/strict';
import { cssSignature, minifyCss } from './minify-css.mjs';
import { formatNumber, optimizePath, optimizeSvg, simplifyPolyline } from './optimize-svg.mjs';
import { bundleCss, joinStylesheets, rebaseUrls, relativeUrls } from './bundle-css.mjs';
import { access, cp, mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import path from 'node:path';

test('minifyCss strips comments and collapsible whitespace only', () => {
  assert.equal(minifyCss('/* c */ a  >  b , c { color: red ; margin: 0 0 ; }\n'), 'a>b,c{color:red;margin:0 0}');
});

test('minifyCss keeps strings, url(), calc spacing and at-rule parentheses intact', () => {
  const source = `@media screen and (min-width: 600px) { .a :hover { width: calc( 100% - var(--x, 2px) + 1px ) } }
.b::after { content: "  a ; } /* no */ "; background: url( ./x.svg ), url("q w.svg") }
@supports not (animation-timeline: view()) { .c { --empty: ; --list: a  b } }
@font-face { font-family: "Archivo"; src: url("./a.woff2") format("woff2"); }
.\\31 0 .x { a: b } .n { & .m { a: b } }`;
  const out = minifyCss(source);
  assert.match(out, /@media screen and \(min-width:600px\)\{\.a :hover\{width:calc\(100% - var\(--x,2px\) \+ 1px\)\}\}/);
  assert.match(out, /content:" {2}a ; } \/\* no \*\/ "/);
  assert.match(out, /url\( \.\/x\.svg \),url\("q w\.svg"\)/);
  assert.match(out, /--empty: ;--list:a b/);
  assert.match(out, /src:url\("\.\/a\.woff2"\) format\("woff2"\)/);
  assert.match(out, /\.\\31 0 \.x\{a:b\}/);
  assert.match(out, /\.n\{& \.m\{a:b\}\}/);
  assert.equal(cssSignature(out), cssSignature(source));
});

test('minifyCss never turns a comment into whitespace or fuses tokens', () => {
  assert.equal(minifyCss('a{margin:1px/**/2px}'), 'a{margin:1px/**/2px}');
  assert.equal(minifyCss('.a/* x */.b{color:red}'), '.a.b{color:red}');
  assert.equal(minifyCss('.a /* x */ .b{color:red}'), '.a .b{color:red}');
  assert.equal(minifyCss('a{content:"x\\\ny"}'), 'a{content:"x\\\ny"}');
});

test('formatNumber drops redundant zeros', () => {
  assert.equal(formatNumber(0.5), '.5');
  assert.equal(formatNumber(-0.5), '-.5');
  assert.equal(formatNumber(-0.04, 1), '0');
  assert.equal(formatNumber(5.0), '5');
});

test('optimizePath compacts without accumulating relative rounding drift', () => {
  assert.equal(optimizePath('M10 10l0.5 -0.5l0.5 0.5l-1.0 0z'), 'M10 10l.5-.5.5.5-1 0z');
  assert.equal(optimizePath('M1 1m2 2m3 3l1 1'), 'M1 1m2 2m3 3 1 1');
  // Ten steps of 0.04 would round to 0 each; anchoring to absolute positions keeps the end point.
  const d = optimizePath(`M0 0${'l.04 0'.repeat(10)}`);
  const total = d.slice(1).split(/l| /).map(Number).filter((n, i) => i >= 2 && i % 2 === 0).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(total - 0.4) < 1e-9, d);
});

test('simplifyPolyline only drops vertices within tolerance', () => {
  assert.equal(simplifyPolyline('M0 0l1 0l1 0l1 0', 0.1), 'M0 0l3 0');
  assert.equal(simplifyPolyline('M0 0l1 0l1 1l1 0', 0.1), 'M0 0l1 0l1 1l1 0');
  assert.equal(simplifyPolyline('M0 0c1 1 2 2 3 3', 0.5), 'M0 0c1 1 2 2 3 3');
});

test('optimizeSvg removes editor noise and hoists repeated values without reordering', () => {
  const svg = `<?xml version="1.0"?>\n<!-- generated -->\n<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="x" viewBox="0 0 10 10">
  <metadata>junk</metadata>
  ${'<path d="M0 0l1 1" stroke="#abcdef" opacity="0.50"/>\n'.repeat(10)}
  <circle id="unused" cx="1.0" cy="2" r="0.7" fill="url(#g)"/>
</svg>`;
  const out = optimizeSvg(svg);
  assert.doesNotMatch(out, /<\?xml|<!--|metadata|inkscape|id="unused"/);
  assert.match(out, /<style>[^<]*\{stroke:#abcdef\}[^<]*<\/style>/);
  assert.equal((out.match(/<path d="M0 0l1 1" class="\w+ \w+"\/>/g) || []).length, 10);
  assert.match(out, /<circle cx="1" cy="2" r="\.7" fill="url\(#g\)"\/>/);
});

test('rebaseUrls moves relative url()s to the bundle folder and leaves data, remote, root and fragment urls alone', () => {
  const css = '@font-face{src:url("./assets/a.woff2") format("woff2")}.x{background:url(../img/b.svg?v=1#k),url(\'c d.png\')}.y{mask:url("data:image/svg+xml,%3Csvg%3E")}.z{a:url(/abs.svg) url(#g) url(https://e.example/x.png)}';
  const out = rebaseUrls(css, '/out/lab', '/out');
  assert.equal(out, '@font-face{src:url("./lab/assets/a.woff2") format("woff2")}.x{background:url(./img/b.svg?v=1#k),url(\'./lab/c d.png\')}.y{mask:url("data:image/svg+xml,%3Csvg%3E")}.z{a:url(/abs.svg) url(#g) url(https://e.example/x.png)}');
  assert.deepEqual(relativeUrls(out), ['./lab/assets/a.woff2', './img/b.svg?v=1#k', './lab/c d.png']);
});

test('joinStylesheets keeps document order, hoists one @charset and refuses @import', () => {
  const joined = joinStylesheets([
    { file: '/o/a.css', css: '@charset "UTF-8";@layer x,y;@layer y{a{b:c}}' },
    { file: '/o/sub/b.css', css: '@charset "UTF-8";@layer x{d{e:url(./f.svg)}}' },
  ], '/o');
  assert.equal(joined, '@charset "UTF-8";@layer x,y;@layer y{a{b:c}}@layer x{d{e:url(./sub/f.svg)}}');
  assert.throws(() => joinStylesheets([{ file: '/o/a.css', css: '@import "b.css";a{b:c}' }], '/o'), /@import/);
});

test('the build gives every page exactly one stylesheet, its bundle exists and every url() in it resolves', async () => {
  const web = fileURLToPath(new URL('../web/', import.meta.url));
  const tmp = await mkdtemp(path.join(os.tmpdir(), 'bundle-css-'));
  try {
    await cp(web, tmp, { recursive: true });
    const result = await bundleCss(tmp);
    const pages = (await readdir(tmp, { recursive: true })).filter((name) => name.endsWith('.html'));
    assert.ok(pages.length >= 12, 'every page');
    for (const page of pages) {
      const html = await readFile(path.join(tmp, page), 'utf8');
      const source = await readFile(path.join(web, page), 'utf8');
      const links = [...html.matchAll(/<link\b[^>]*\srel="stylesheet"[^>]*>/g)].map((m) => m[0]);
      assert.equal(links.length, 1, `${page}: one stylesheet link`);
      const href = links[0].match(/\shref="([^"]+)"/)[1];
      assert.match(href, /^(?:\.\.?\/|\/)[\w-]+\.[0-9a-f]{10}\.css$/, `${page}: hashed bundle at the root`);
      const file = href.startsWith('/') ? path.join(tmp, href) : path.resolve(path.dirname(path.join(tmp, page)), href);
      const css = await readFile(file, 'utf8');
      // The bundle is the page's own stylesheets, minified, in document order.
      const own = [...source.matchAll(/<link rel="stylesheet" href="([^"]+)">/g)].map((m) => m[1]);
      const expected = await Promise.all(own.map(async (h) => minifyCss(await readFile(h.startsWith('/') ? path.join(web, h) : path.resolve(path.dirname(path.join(web, page)), h), 'utf8'))));
      const strip = (text) => text.replace(/^@charset "UTF-8";/, '').replace(/url\([^)]*\)/g, 'url()');
      assert.equal(strip(css), expected.map(strip).join(''), `${page}: same rules, same order`);
      assert.ok(!/@import\b/.test(css), `${page}: no @import`);
      assert.equal((css.match(/@charset/g) || []).length, css.startsWith('@charset') ? 1 : 0, `${page}: @charset only first`);
      for (const url of relativeUrls(css)) {
        const target = path.resolve(path.dirname(file), url.replace(/[?#].*$/, ''));
        await access(target).catch(() => assert.fail(`${page}: ${url} does not resolve`));
      }
      for (const url of [...css.matchAll(/url\("?(\/[^")]+)/g)].map((m) => m[1])) {
        await access(path.join(tmp, url)).catch(() => assert.fail(`${page}: ${url} does not resolve`));
      }
      // The CSP keeps style-src 'self': the bundle is same-origin and no inline <style> appears.
      assert.doesNotMatch(html, /<style\b/, `${page}: no inline style element`);
    }
    // The homepage's layer order is declared before any layer is used.
    const home = result.bundles.find((bundle) => bundle.name.startsWith('home.'));
    const homeCss = await readFile(home.file, 'utf8');
    assert.ok(homeCss.indexOf('@layer reset,base,layout,components,motion,responsive;') < homeCss.indexOf('@layer reset{'));
    assert.equal(home.sheets, 10);
    // Shared sets share one file; the bundled originals are gone.
    assert.equal(new Set(result.pages.map((page) => page.bundle)).size, result.bundles.length);
    assert.equal((await readdir(tmp, { recursive: true })).filter((name) => name.endsWith('.css')).length, result.bundles.length);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

test('no script loads a stylesheet at runtime, so the build may drop the bundled originals', async () => {
  const web = fileURLToPath(new URL('../web/', import.meta.url));
  const scripts = (await readdir(web, { recursive: true })).filter((name) => name.endsWith('.js'));
  for (const name of scripts) {
    // Code only: line comments and block comments are dropped before the check.
    const code = (await readFile(path.join(web, name), 'utf8')).replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"\\])\/\/.*$/gm, '$1');
    assert.doesNotMatch(code, /\.css\b['"`?#]|['"`]stylesheet['"`]|insertRule|adoptedStyleSheets/, `${name}: runtime stylesheet`);
  }
});

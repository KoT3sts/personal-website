import test from 'node:test';
import assert from 'node:assert/strict';
import { cssSignature, minifyCss } from './minify-css.mjs';
import { formatNumber, optimizePath, optimizeSvg, simplifyPolyline } from './optimize-svg.mjs';

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

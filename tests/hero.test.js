// Portrait-led hero (SPECIFICATION V02). Plain text checks on the shipped
// files, so they run under node without a DOM.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');
const bytes = path => readFile(new URL(path, import.meta.url));

const html = await read('../web/index.html');
const hero = html.match(/<section id="home"[\s\S]*?<\/section>/)?.[0] ?? '';
const art = hero.match(/<div class="hero-art"[\s\S]*?<div class="art-coordinate[^>]*>[^<]*<\/div>\s*<\/div>/)?.[0] ?? '';
const attr = (tag, name) => tag.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1];

// Image dimensions from the file headers (PNG IHDR, WebP VP8/VP8L/VP8X).
function pngSize(data) {
  assert.equal(data.toString('ascii', 1, 4), 'PNG');
  return [data.readUInt32BE(16), data.readUInt32BE(20)];
}
function webpSize(data) {
  assert.equal(data.toString('ascii', 0, 4), 'RIFF');
  assert.equal(data.toString('ascii', 8, 12), 'WEBP');
  const chunk = data.toString('ascii', 12, 16);
  if (chunk === 'VP8X') return [1 + data.readUIntLE(24, 3), 1 + data.readUIntLE(27, 3)];
  if (chunk === 'VP8L') { const bits = data.readUInt32LE(21); return [1 + (bits & 0x3fff), 1 + ((bits >> 14) & 0x3fff)]; }
  return [data.readUInt16LE(26) & 0x3fff, data.readUInt16LE(28) & 0x3fff];
}

test('the hero shows Cesar\'s portrait as content, in front of the headline', () => {
  assert.ok(art, 'hero art block');
  assert.ok(hero.indexOf('id="hero-title"') < hero.indexOf('class="hero-art"'), 'the art follows the headline');
  assert.doesNotMatch(art.match(/<div class="hero-art"[^>]*>/)[0], /aria-hidden/, 'the art block is not hidden: it holds the portrait');
  const picture = art.match(/<picture class="hero-portrait">[\s\S]*?<\/picture>/)?.[0];
  assert.ok(picture, '<picture class="hero-portrait">');
  const img = picture.match(/<img[^>]*>/)[0];
  assert.equal(attr(img, 'alt'), 'Cesar Tortolero');
  assert.equal(attr(img, 'fetchpriority'), 'high');
  assert.equal(attr(img, 'loading'), undefined, 'never lazy: it is the first screen');
  assert.equal(attr(img, 'src'), './assets/cesar-portrait-640.png');
  assert.equal(attr(img, 'width'), '560');
  assert.equal(attr(img, 'height'), '671');
  const source = picture.match(/<source[^>]*>/)[0];
  assert.equal(attr(source, 'type'), 'image/webp');
  assert.deepEqual(attr(source, 'srcset').split(',').map(entry => entry.trim()), ['./assets/cesar-portrait-560.webp 560w', './assets/cesar-portrait-1040.webp 1040w']);
  // sizes follows portrait.css: phone (<=760), tablet (<=1100), desktop.
  const sizes = attr(source, 'sizes');
  assert.ok(sizes.startsWith('(max-width: 760px) '), sizes);
  assert.ok(sizes.includes(', (max-width: 1100px) '), sizes);
  assert.doesNotMatch(sizes.split('(max-width: 1100px)')[1], /\(max-width/, 'one unconditional desktop size last');
});

test('the portrait files match their srcset descriptors and the declared aspect ratio', async () => {
  const [pw, ph] = pngSize(await bytes('../web/assets/cesar-portrait-640.png'));
  assert.deepEqual([pw, ph], [640, 767]);
  for (const [file, width] of [['cesar-portrait-560.webp', 560], ['cesar-portrait-1040.webp', 1040]]) {
    const [w, h] = webpSize(await bytes(`../web/assets/${file}`));
    assert.equal(w, width, `${file} width matches its ${width}w descriptor`);
    assert.ok(Math.abs(w / h - 560 / 671) < 0.005, `${file} keeps the 560x671 aspect`);
  }
  assert.ok(Math.abs(pw / ph - 560 / 671) < 0.005, 'the PNG fallback keeps the aspect');
});

test('the sculpture is a small decorative accent, no longer preloaded or high priority', () => {
  assert.doesNotMatch(html, /rel="preload"[^>]*sculpture\.svg/, 'no sculpture preload');
  assert.doesNotMatch(html, /<img[^>]*\/sculpture\.svg/, 'the sculpture is not an <img> any more');
  assert.equal((html.match(/fetchpriority="high"/g) || []).length, 1, 'only the portrait is high priority');
  const orbit = art.match(/<div class="hero-orbit" aria-hidden="true">[\s\S]*?<\/svg>\s*<\/div>/)?.[0];
  assert.ok(orbit, 'inline, aria-hidden orbit accent');
  assert.match(orbit, /<svg class="sculpture"[^>]*focusable="false"/);
  assert.ok(art.indexOf('hero-orbit') < art.indexOf('hero-portrait'), 'drawn behind the portrait');
  assert.equal((orbit.match(/class="orbiter[^"]*"/g) || []).length, 2, 'two orbit points');
  // Gradient ids are namespaced so they cannot clash with other inline SVG.
  for (const id of orbit.match(/\sid="([^"]+)"/g) || []) assert.match(id, /id="sculpture-/);
  assert.match(art, /<div class="orbit-label[^"]*" aria-hidden="true">/);
  assert.match(art, /<div class="art-coordinate[^"]*" aria-hidden="true">/);
});

test('the orbit points pause with the hero loop, the tour and reduced motion', async () => {
  const motion = await read('../web/motion.css');
  const styles = await read('../web/styles.css');
  assert.match(motion, /\.hero-orbit \.orbiter \{[^}]*offset-path: path\([^}]*animation: hero-orbit /);
  assert.match(motion, /\.hero\[data-loop="paused"\] \.orbiter, html\.agentic-running \.orbiter \{ animation-play-state: paused; \}/);
  assert.match(styles, /prefers-reduced-motion: reduce\) \{ html \{[^}]*\} \*, \*::before, \*::after \{ animation: none !important;/);
  const motionJs = await read('../web/motion.js');
  assert.match(motionJs, /const LOOPS = \[[^\]]*'\.hero'/, 'the hero is a watched loop');
  assert.doesNotMatch(motionJs, /syncSculpture|#still/, 'no more SVG-image fragment switching');
});

test('a portrait that fails to load hands the centre back to the sculpture', async () => {
  const motionJs = await read('../web/motion.js');
  const portrait = await read('../web/portrait.css');
  const motion = await read('../web/motion.css');
  assert.match(motionJs, /hero\.dataset\.portrait = 'failed'/);
  assert.match(portrait, /\.hero\[data-portrait="failed"\] \.hero-portrait \{ display: none; \}/);
  assert.match(portrait, /\.hero\[data-portrait="failed"\] \.hero-orbit \{[^}]*width: 100%/);
  assert.match(motion, /\.hero\[data-portrait="failed"\] \.hero-art::before \{ display: block; \}/, 'ground shadow only for the fallback');
});

test('the build tour places the portrait with its own reveal and still builds the accent', async () => {
  const entrance = await read('../web/entrance.js');
  const portrait = await read('../web/portrait.css');
  assert.match(entrance, /\{ sel: '\.hero-portrait', role: 'art', kind: 'reveal'[^}]*art: true, act: 'placing portrait' \}/);
  assert.match(entrance, /\{ sel: '\.sculpture', role: 'art', kind: 'reveal'/);
  assert.match(entrance, /\{ sel: '\.hero-orbit', role: 'motion', kind: 'orbit'/);
  assert.match(entrance, /\['box-art', '\.hero-art', 'boxing portrait'\]/);
  // entrance.css loads later with `.agentic-target[data-build-kind="art"][data-build-state]`
  // (three classes/attributes); the portrait's reveal must outrank it.
  assert.match(portrait, /\.hero \.hero-portrait\.agentic-target\[data-build-state="pending"\] \{[^}]*mask-position: 0 100%/);
  assert.match(portrait, /\.hero \.hero-portrait\.agentic-target\[data-build-state="placing"\] \{[^}]*transition:[^}]*mask-position var\(--agentic-d/);
});

test('the link card uses the portrait, not the sculpture, at 1200x630', async () => {
  const card = await read('../scripts/og-card.html');
  assert.match(card, /<img src="\.\.\/web\/assets\/cesar-portrait-1040\.webp"/);
  assert.doesNotMatch(card, /sculpture\.svg/);
  // JPEG frame size from the first SOF marker.
  const data = await bytes('../web/assets/og-card.jpg');
  let offset = 2;
  let size = null;
  while (offset < data.length && !size) {
    const marker = data[offset + 1];
    const length = data.readUInt16BE(offset + 2);
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) size = [data.readUInt16BE(offset + 7), data.readUInt16BE(offset + 5)];
    offset += 2 + length;
  }
  assert.deepEqual(size, [1200, 630]);
  assert.match(html, /og:image:width" content="1200"/);
  assert.match(html, /og:image:height" content="630"/);
});

test('contact polish: the copy toast clears the headline and the glow waits for the reveal', async () => {
  const motion = await read('../web/motion.css');
  assert.match(motion, /@media \(max-width: 760px\) \{[^@]*\.contact-actions \{ margin-top: 56px; \}[^@]*\.contact-toast \{ bottom: calc\(100% \+ 10px\);/);
  assert.match(motion, /\.contact h2\[data-headline\] \{ text-shadow: 0 0 40px #e3eac500; \}/);
  assert.match(motion, /\.contact h2 \{ transition: text-shadow /);
});

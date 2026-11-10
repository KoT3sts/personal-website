// About opening and the #introduction falling figure (about-scenes.css). Plain
// text checks on the shipped files plus the pure progress helper, so they run
// under node without a DOM.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { ABOUT_OPEN_MEDIA, openingProgress } from '../web/motion.js';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');

const html = await read('../web/index.html');
const css = await read('../web/about-scenes.css');
const figure = await read('../web/assets/beam-figure.svg');
const about = html.match(/<section id="about"[\s\S]*?<\/section>/)?.[0] ?? '';
const intro = html.match(/<section id="introduction"[\s\S]*?<\/section>/)?.[0] ?? '';
const art = intro.match(/<div class="cinematic-art"[\s\S]*?(?=<div class="cinematic-footer"|<\/section>)/)?.[0] ?? '';
const attr = (tag, name) => tag.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1];

test('the opening replaces the discover button and keeps the reading order', () => {
  assert.ok(about, '#about section');
  assert.doesNotMatch(html, /about-discover/, 'the scroll opening replaces the button');
  const order = ['about-transition-meta', 'about-title-panel', 'id="about-title"', 'about-transition-foot'].map(token => about.indexOf(token));
  assert.ok(order.every(index => index > 0), order.join());
  assert.deepEqual([...order].sort((a, b) => a - b), order, 'meta, panel, title, foot');
  assert.match(about, /<div class="about-window" aria-hidden="true"><\/div>/);
  assert.match(about, /<div class="about-flow" aria-hidden="true">/);
  assert.match(about, /aria-labelledby="about-title"/);
  assert.match(intro, /data-nav-section="about"/);
});

test('the pin only runs on wide, tall screens with motion and JS, behind scroll timelines or motion.js', () => {
  assert.match(ABOUT_OPEN_MEDIA, /prefers-reduced-motion: no-preference/);
  const gates = css.split(`@media ${ABOUT_OPEN_MEDIA}`).length - 1;
  assert.equal(gates, 2, 'the CSS uses the same query as motion.js for the pin and its timeline');
  const pin = css.slice(css.indexOf(`@media ${ABOUT_OPEN_MEDIA}`));
  assert.match(pin, /:root\[data-tour\] #about \.about-scene \{ position: sticky;/, 'pins only once the head script ran');
  assert.match(pin, /:root\[data-tour\] #about \{[^}]*pointer-events: none/, 'the overlap keeps #introduction clickable');
  assert.match(css, /@property --about-p \{ syntax: "<number>"; inherits: true; initial-value: 0; \}/);
  assert.match(css, /@supports \(animation-timeline: view\(\)\) \{\s*@media screen[^{]*\{\s*[^}]*animation: about-open linear both; animation-timeline: view\(block 0px 0px\)/);
  assert.match(html, /document\.documentElement\.dataset\.tour|dataset\.tour\s*=|setAttribute\('data-tour'/, 'the head script sets data-tour before paint');
});

test('openingProgress maps the pinned run to 0..1', () => {
  assert.equal(openingProgress(0, 1800, 800), 0);
  assert.equal(openingProgress(120, 1800, 800), 0, 'not yet pinned');
  assert.equal(openingProgress(-500, 1800, 800), .5);
  assert.equal(openingProgress(-1000, 1800, 800), 1);
  assert.equal(openingProgress(-1600, 1800, 800), 1, 'clamped after the run');
  assert.equal(openingProgress(0, 800, 800), 0, 'no run');
  assert.equal(openingProgress(-1, 600, 800), 1, 'no run, scrolled past');
});

test('the falling figure is a small, original, decorative asset inside the beam drawing', async () => {
  const info = await stat(new URL('../web/assets/beam-figure.svg', import.meta.url));
  assert.ok(info.size < 25 * 1024, `${info.size} B`);
  assert.match(figure, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 190 270"/);
  assert.doesNotMatch(figure, /<script|<image|href=|<foreignObject/i, 'self-contained vector, nothing embedded or linked');
  assert.equal(html.split('assets/beam-figure.svg').length - 1, 1, 'referenced once');
  const img = art.match(/<img class="beam-figure"[^>]*>/)?.[0] ?? '';
  assert.ok(img, 'figure sits in .cinematic-art (aria-hidden)');
  assert.match(art, /^<div class="cinematic-art" aria-hidden="true">/);
  assert.equal(attr(img, 'alt'), '');
  assert.equal(attr(img, 'width'), '190');
  assert.equal(attr(img, 'height'), '270');
});

test('the figure CSS anchors the head where the signal trail starts', () => {
  const head = figure.match(/<ellipse cx="([\d.]+)" cy="([\d.]+)"/);
  assert.ok(head, 'head ellipse');
  const [ax, ay] = [head[1] / 190, head[2] / 270];
  const rule = css.match(/\.beam-figure \{[^}]*\}/)?.[0] ?? '';
  const num = name => Number(rule.match(new RegExp(`${name}: ([\\d.]+)`))?.[1]);
  assert.ok(Math.abs(num('--head-ax') - ax) < .005, `--head-ax ${ax}`);
  assert.ok(Math.abs(num('--head-ay') - ay) < .005, `--head-ay ${ay}`);
  assert.ok(Math.abs(num('--fig-ratio') - 270 / 190) < .005, '--fig-ratio');
  assert.match(rule, new RegExp(`transform-origin: ${(ax * 100).toFixed(1)}% ${(ay * 100).toFixed(1)}%`));
});

test('the fall and sway only run with motion and scroll timelines; at rest otherwise', () => {
  const block = css.match(/@supports \(animation-timeline: view\(\)\) \{\s*@media \(prefers-reduced-motion: no-preference\) \{[\s\S]*?\n {4}\}/)?.[0] ?? '';
  assert.match(block, /\.cinematic-art \{ animation: figure-fall/);
  assert.match(block, /\.beam-figure \{ animation: figure-sway/);
  assert.equal(css.match(/animation: figure-(fall|sway)/g)?.length, 2, 'no ungated figure animation');
  assert.match(css, /@keyframes figure-fall \{[\s\S]*?45% \{ translate: 0 0; \}/, 'rest pose is the unanimated layout');
});

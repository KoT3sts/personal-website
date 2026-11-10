// About opening and the #introduction ascending figure (about-scenes.css). Plain
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
const art = intro.match(/<div class="cinematic-art"[\s\S]*?(?=<div class="cinematic-topline"|<\/section>)/)?.[0] ?? '';
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

test('the light scene keeps only the figure, its halo and motes: no signal trace or agent graph', () => {
  assert.ok(art, '.cinematic-art');
  assert.doesNotMatch(intro, /signal-|sig-|<svg/, 'the EEG trace and agent graph markup are gone');
  assert.doesNotMatch(css, /\.signal-|@keyframes signal-|--head-dx|--art-len|figure-fall/, 'no dead signal or fall rules');
  assert.match(art, /<div class="beam-motes">(<span><\/span>){6,12}<\/div>/, '6 to 12 motes');
  assert.match(art, /<div class="beam-ascent">\s*<div class="beam-halo"><\/div>\s*<img class="beam-figure"/);
});

test('the ascending figure is a small, original, decorative asset', async () => {
  const info = await stat(new URL('../web/assets/beam-figure.svg', import.meta.url));
  assert.ok(info.size < 25 * 1024, `${info.size} B`);
  assert.match(figure, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 200 320"/);
  assert.doesNotMatch(figure, /<script|<image|href=|<foreignObject/i, 'self-contained vector, nothing embedded or linked');
  assert.equal(html.split('assets/beam-figure.svg').length - 1, 1, 'referenced once');
  const img = art.match(/<img class="beam-figure"[^>]*>/)?.[0] ?? '';
  assert.ok(img, 'figure sits in .cinematic-art (aria-hidden)');
  assert.match(art, /^<div class="cinematic-art" aria-hidden="true">/);
  assert.equal(attr(img, 'alt'), '');
  assert.equal(attr(img, 'width'), '200');
  assert.equal(attr(img, 'height'), '320');
  assert.match(css, /\.cinematic-art \{[^}]*pointer-events: none/);
});

test('the swap variables match the drawing, and the art sits between the topline and the copy', () => {
  const head = figure.match(/<ellipse cx="([\d.]+)" cy="([\d.]+)"/);
  assert.ok(head, 'head ellipse');
  const [ax, ay] = [head[1] / 200, head[2] / 320];
  const rule = css.match(/\.cinematic-art \{[^}]*\}/)?.[0] ?? '';
  const num = name => Number(rule.match(new RegExp(`${name}: ([\\d.]+)`))?.[1]);
  assert.ok(Math.abs(num('--head-ax') - ax) < .005, `--head-ax ${ax}`);
  assert.ok(Math.abs(num('--head-ay') - ay) < .005, `--head-ay ${ay}`);
  assert.ok(Math.abs(num('--fig-ratio') - 320 / 200) < .005, '--fig-ratio');
  for (const name of ['--body-ax', '--body-ay']) assert.ok(num(name) > 0 && num(name) < 1, name);
  // Centred in the open area: from --art-top down to --foot-top, the copy's own top margin.
  assert.match(rule, /top: calc\(var\(--art-top\) \+ \(var\(--foot-top\) - var\(--art-top\)\) \* var\(--art-bias/);
  assert.match(css, /\.cinematic-footer \{[^}]*margin-top: var\(--foot-top\)/);
  assert.doesNotMatch(css, /\.cinematic-footer \{[^}]*margin-top: \d/, 'one source for the copy offset');
});

test('the ascent, sway, halo, light and motes only move with motion and scroll timelines; at rest otherwise', () => {
  const block = css.match(/@supports \(animation-timeline: view\(\)\) \{\s*@media \(prefers-reduced-motion: no-preference\) \{[\s\S]*?\n {4}\}/)?.[0] ?? '';
  const moves = { '.beam-ascent': 'figure-rise', '.beam-figure': 'figure-sway', '.beam-halo': 'halo-swell', '.beam-motes > span': 'mote-rise', '.cinematic-light::after': 'cine-heaven' };
  for (const [sel, name] of Object.entries(moves)) {
    assert.ok(block.includes(`${sel} { animation: ${name} linear both; animation-timeline: --cine-scene;`), sel);
    assert.equal(css.split(`animation: ${name}`).length - 1, 1, `no ungated ${name}`);
  }
  // The 45% keyframe (where /#introduction lands) is the unanimated layout: no offset, tilt only, full halo and motes.
  assert.match(css, /@keyframes figure-rise \{[\s\S]*?45% \{ translate: 0 0; \}/);
  assert.match(css, /@keyframes figure-sway \{[\s\S]*?45% \{ rotate: var\(--fig-tilt, 12deg\); \}/);
  assert.match(css, /\.beam-figure \{[^}]*rotate: var\(--fig-tilt, 12deg\)/);
  assert.match(css, /@keyframes halo-swell \{[^\n]*45% \{ opacity: 1; scale: 1; \}/);
  assert.match(css, /@keyframes mote-rise \{[\s\S]*?45% \{ translate: 0 0; opacity: var\(--o\); \}/);
  assert.match(css, /\.beam-motes > span \{[^}]*opacity: var\(--o\)/);
  assert.match(css, /\.cinematic-light::after \{[^}]*opacity: \.8; \}/);
  assert.match(css, /@keyframes cine-heaven \{[^\n]*45% \{ opacity: \.8; \}/);
  // Up the shaft is the negative of (cos, sin) of the beam angle.
  assert.match(css, /100% \{ translate: calc\(cos\(var\(--beam-turn\)\) \* var\(--rise, \d+px\) \* -1\.25\)/);
});

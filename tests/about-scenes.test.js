// About opening and the #introduction falling Icarus (about-scenes.css). Plain
// text checks on the shipped files plus the pure progress helper, so they run
// under node without a DOM.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { ABOUT_OPEN_MEDIA, openingProgress } from '../web/motion.js';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');

const html = await read('../web/index.html');
const css = await read('../web/about-scenes.css');
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

test('the light scene keeps only Icarus, his halo and loose feathers: no signal trace, agent graph or motes', () => {
  assert.ok(art, '.cinematic-art');
  assert.doesNotMatch(intro, /signal-|sig-|<svg|beam-motes|beam-ascent/, 'the EEG trace, agent graph and old motes are gone');
  assert.doesNotMatch(css, /\.signal-|@keyframes signal-|--head-dx|--art-len|beam-motes|beam-ascent|mote-rise|figure-rise|--head-a[xy]/, 'no dead rules');
  assert.match(art, /<div class="beam-feathers">(<span><\/span>){8,14}<\/div>/, '8 to 14 loose feathers');
  assert.match(art, /<div class="beam-fall">\s*<div class="beam-halo"><\/div>\s*<img class="beam-figure"/);
  const count = art.match(/<div class="beam-feathers">((?:<span><\/span>)+)/)[1].split('<span>').length - 1;
  for (let i = 1; i <= count; i++) assert.match(css, new RegExp(`\\.beam-feathers > :nth-child\\(${i}\\) \\{ --x: [-\\d.]+%; --y: [-\\d.]+%; --s: [\\d.]+; --r: [-\\d.]+deg; --o: [\\d.]+; --d: [\\d.]+; --dx: [-\\d.]+px; --spin: [-\\d.]+deg; \\}`), `feather ${i}`);
});

test('the figure is the owner-supplied drawing, cut out, decorative and within budget', async () => {
  for (const [name, max] of [['icarus-560.webp', 110], ['icarus-960.webp', 200]]) {
    const info = await stat(new URL(`../web/assets/${name}`, import.meta.url));
    assert.ok(info.size < max * 1024, `${name}: ${info.size} B`);
  }
  const img = art.match(/<img class="beam-figure"[^>]*>/)?.[0] ?? '';
  assert.ok(img, 'figure sits in .cinematic-art (aria-hidden)');
  assert.match(art, /^<div class="cinematic-art" aria-hidden="true">/);
  assert.equal(attr(img, 'src'), './assets/icarus-960.webp');
  assert.match(attr(img, 'srcset'), /icarus-560\.webp 560w, \.\/assets\/icarus-960\.webp 960w/);
  assert.equal(attr(img, 'alt'), '');
  assert.equal(attr(img, 'width'), '960');
  assert.equal(attr(img, 'height'), '1130');
  assert.doesNotMatch(html, /beam-figure\.svg/, 'the generated drawing is gone');
  assert.match(css, /\.cinematic-art \{[^}]*--fig-ratio: 1\.177;/, 'ratio matches 1130 / 960');
  assert.match(css, /\.cinematic-art \{[^}]*pointer-events: none/);
  // Form and shadow come from the drawing: no overexposing filter on the image.
  assert.doesNotMatch(css.match(/\.beam-figure \{[^}]*\}/)?.[0] ?? '', /grayscale|brightness/);
});

test('the swap variables match the drawing, and the art rests clear of the copy', () => {
  const img = art.match(/<img class="beam-figure"[^>]*>/)?.[0] ?? '';
  const [w, h] = [attr(img, 'width'), attr(img, 'height')].map(Number);
  const rule = css.match(/\.cinematic-art \{[^}]*\}/)?.[0] ?? '';
  const num = name => Number(rule.match(new RegExp(`${name}: ([\\d.]+)`))?.[1]);
  assert.ok(Math.abs(num('--fig-ratio') - h / w) < .005, `--fig-ratio ${h / w}`);
  for (const name of ['--body-ax', '--body-ay']) assert.ok(num(name) > 0 && num(name) < 1, name);
  // The box rests --art-clear above --foot-top (the copy's own top margin); the clearance covers the
  // post-rest drift (at most .82 of --drift is downward), the tumble's wider box and a margin.
  assert.match(rule, /top: calc\(var\(--foot-top\) - var\(--art-clear\) - var\(--fig-h\)\)/);
  assert.match(rule, /--art-clear: calc\(var\(--drift, \d+px\) \* \.82 \+ var\(--fig-w, \d+px\) \* \.08 \+ \d+px\)/);
  assert.match(css, /\.cinematic-footer \{[^}]*margin-top: var\(--foot-top\)/);
  assert.doesNotMatch(css, /\.cinematic-footer \{[^}]*margin-top: \d/, 'one source for the copy offset');
});

test('clouds sit behind the art and the copy, and stay decorative', () => {
  const clouds = css.match(/\.cinematic-stage::before \{[^}]*\}/)?.[0] ?? '';
  assert.match(clouds, /pointer-events: none/);
  assert.match(clouds, /z-index: -3/);
  assert.match(css, /\.cinematic-light \{[^}]*z-index: -4/, 'the light shaft is behind the clouds');
  assert.match(css, /\.cinematic-art \{[^}]*z-index: -2/, 'the figure is in front of the clouds');
  assert.ok((clouds.match(/radial-gradient/g) ?? []).length >= 8, 'several overlapping banks');
});

test('the fall, tumble, halo, light and feathers only move with motion and scroll timelines; at rest otherwise', () => {
  const block = css.match(/@supports \(animation-timeline: view\(\)\) \{\s*@media \(prefers-reduced-motion: no-preference\) \{[\s\S]*?\n {4}\}/)?.[0] ?? '';
  const moves = { '.beam-fall': 'figure-fall', '.beam-figure': 'figure-tumble', '.beam-halo': 'halo-fade', '.beam-feathers > span': 'feather-shed', '.cinematic-light::after': 'cine-heaven' };
  for (const [sel, name] of Object.entries(moves)) {
    assert.ok(block.includes(`${sel} { animation: ${name} linear both; animation-timeline: --cine-scene;`), sel);
    assert.equal(css.split(`animation: ${name}`).length - 1, 1, `no ungated ${name}`);
  }
  // The 45% keyframe (where /#introduction lands) equals the unanimated layout.
  assert.match(css, /@keyframes figure-fall \{[\s\S]*?45% \{ translate: 0 0; \}/);
  assert.match(css, /@keyframes figure-tumble \{[\s\S]*?45% \{ rotate: var\(--fig-tilt, 0deg\); \}/);
  assert.match(css, /\.beam-figure \{[^}]*rotate: var\(--fig-tilt, 0deg\)/);
  assert.match(css, /@keyframes halo-fade \{[^\n]*45% \{ opacity: 1; scale: 1; \}/);
  assert.match(css, /@keyframes feather-shed \{[\s\S]*?45% \{ translate: 0 0; rotate: var\(--r\); opacity: var\(--o\); \}/);
  assert.match(css, /\.beam-feathers > span \{[^}]*rotate: var\(--r\); opacity: var\(--o\)/);
  assert.match(css, /\.cinematic-light::after \{[^}]*opacity: \.85; \}/);
  assert.match(css, /@keyframes cine-heaven \{[^\n]*45% \{ opacity: \.85; \}/);
  // Down the shaft (away from the light) is +(cos, sin) of the beam angle: he drops --fall into the rest pose,
  // then only drifts --drift further, so he never reaches the copy.
  assert.match(css, /@keyframes figure-fall \{\s*0% \{ translate: calc\(cos\(var\(--beam-turn\)\) \* var\(--fall, \d+px\) \* -1\)/);
  assert.match(css, /100% \{ translate: calc\(cos\(var\(--beam-turn\)\) \* var\(--drift, \d+px\)\) calc\(sin\(var\(--beam-turn\)\) \* var\(--drift, \d+px\)\); \}/);
  // A clearly visible drop: several times the drift at every size, never a token nudge.
  const drops = [...css.matchAll(/--fall: (\d+)px; --drift: (\d+)px/g)].map(match => match.slice(1).map(Number));
  assert.ok(drops.length >= 4, 'base, wide, wider and tablet sizes');
  for (const [fall, drift] of drops) assert.ok(fall >= 300 && fall >= drift * 8, `fall ${fall}, drift ${drift}`);
  assert.match(css, /--fall: \d+px; --drift: \d+px; --fig-tilt: -3deg/, 'the phone size too');
  // Feathers fall slower than he does, so they lag above him.
  assert.match(css, /@keyframes feather-shed \{[\s\S]*?0% \{ translate: calc\(cos\(var\(--beam-turn\)\) \* var\(--fall, \d+px\) \* -\.85\)/);
  assert.match(css, /@keyframes feather-shed \{[\s\S]*?100% \{ translate: calc\(cos\(var\(--beam-turn\)\) \* var\(--drift, \d+px\) \* \.4 \* var\(--d\)/);
});

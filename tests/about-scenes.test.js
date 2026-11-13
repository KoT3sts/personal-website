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
const styles = await read('../web/styles.css');
const about = html.match(/<section id="about"[\s\S]*?<\/section>/)?.[0] ?? '';
const intro = html.match(/<section id="introduction"[\s\S]*?<\/section>/)?.[0] ?? '';
const art = intro.match(/<div class="cinematic-art"[\s\S]*?(?=<div class="cinematic-topline"|<\/section>)/)?.[0] ?? '';
const attr = (tag, name) => tag.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1];
// The scroll-timeline blocks gated like the opening; the hold is the one that sets --cine-hold.
const timed = [...css.matchAll(/@supports \(animation-timeline: view\(\)\) \{\s*@media ([^{]*) \{([\s\S]*?)\n {4}\}\n {2}\}/g)];
const hold = timed.find(([, , body]) => body.includes('--cine-hold:'));
const holdBody = hold?.[2] ?? '';
const base = css.match(/@supports \(animation-timeline: view\(\)\) \{\s*@media \(prefers-reduced-motion: no-preference\) \{[\s\S]*?\n {4}\}/)?.[0] ?? '';

test('the opening replaces the discover button and keeps the reading order', () => {
  assert.ok(about, '#about section');
  assert.doesNotMatch(html, /about-discover/, 'the scroll opening replaces the button');
  const order = ['about-transition-meta', 'about-title-panel', 'id="about-title"', 'about-transition-foot'].map(token => about.indexOf(token));
  assert.ok(order.every(index => index > 0), order.join());
  assert.deepEqual([...order].sort((a, b) => a - b), order, 'meta, panel, title, foot');
  assert.match(about, /<div class="about-window" aria-hidden="true"><\/div>/);
  assert.match(about, /<div class="about-flow" aria-hidden="true">/);
  assert.match(about, /aria-labelledby="about-title"/);
  assert.match(about, /data-nav-section="introduction"/, 'the title card marks the About entry, which opens #introduction');
});

test('the pin only runs on wide, tall screens with motion and JS, behind scroll timelines or motion.js', () => {
  assert.match(ABOUT_OPEN_MEDIA, /prefers-reduced-motion: no-preference/);
  const gates = css.split(`@media ${ABOUT_OPEN_MEDIA}`).length - 1;
  assert.equal(gates, 4, 'the CSS uses the same query as motion.js for the pin, its timeline, the scene hold and its frame');
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
  const moves = { '.beam-fall': 'figure-fall', '.beam-figure': 'figure-tumble', '.beam-halo': 'halo-fade', '.beam-feathers > span': 'feather-shed', '.cinematic-light::after': 'cine-heaven' };
  for (const [sel, name] of Object.entries(moves)) {
    assert.ok(base.includes(`${sel} { animation: ${name} linear both; animation-timeline: --cine-scene;`), sel);
    // Once in the motion block, and at most once more in the hold (itself behind scroll timelines and motion).
    const total = css.split(`animation: ${name}`).length - 1;
    assert.equal(total - (base.split(`animation: ${name}`).length - 1) - (holdBody.split(`animation: ${name}`).length - 1), 0, `no ungated ${name}`);
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

test('the scene holds after the opening: gated like the opening, sticky for --cine-hold, and nothing else shifts', () => {
  assert.ok(hold, 'a hold block');
  assert.equal(hold[1], ABOUT_OPEN_MEDIA, 'same query as the opening (and motion.js), behind scroll timelines');
  assert.match(holdBody, /^\s*:root\[data-tour\] #about \+ #introduction \{\s*--cine-hold: (\d+)svh;/, 'only where the opening runs (JS ran)');
  const length = Number(holdBody.match(/--cine-hold: (\d+)svh/)[1]);
  assert.ok(length >= 30 && length <= 80, `hold ${length}svh`);
  // Every rule that makes room or pins lives in the hold block: no extra height or sticky stage elsewhere.
  for (const token of ['--cine-hold:', 'margin-top: calc(24px + var(--cine-hold))', 'position: sticky; top: var(--cine-pad)', 'figure-float ease-in-out']) {
    assert.equal(css.split(token).length - 1, 1, token);
    assert.ok(holdBody.includes(token), `${token} is gated`);
  }
  // The stage sticks where the opening leaves it (the section's top padding, below the header bar) ...
  assert.match(css, /\.cinematic \{ --cine-pad: clamp\(90px, 6vw, 110px\); padding: var\(--cine-pad\) /);
  assert.match(styles, /--header-clear: 76px/);
  // ... for exactly --cine-hold: its margin (24px + the caption's one mono line) collapses into the caption's
  // larger top margin, so sticky ends 24px above the caption, as without the hold.
  assert.match(holdBody, /\.cinematic-stage \{\s*position: sticky; top: var\(--cine-pad\); margin-bottom: calc\(24px \+ var\(--text-label\) \* 1\.55\);/);
  assert.match(css, /\.cinematic-caption \{[^}]*margin-top: 24px;/);
  assert.match(html, /<div class="cinematic-caption mono">/);
  assert.match(styles, /\.mono \{[^}]*font-size: var\(--text-label\);[^}]*line-height: 1\.55;/);
  // Ranges that ended at cover P% end at the same scroll position in the taller section.
  for (const sel of ['.cinematic-stage', '.cinematic-light', '.cinematic-topline', '.cinematic-footer']) {
    const before = base.match(new RegExp(`\\${sel} \\{[^}]*animation-range: (entry \\d+%) cover (\\d+)%;`));
    assert.ok(before, sel);
    const [, start, p] = before;
    const after = holdBody.match(new RegExp(`\\${sel} \\{[^}]*animation-range: ${start} cover calc\\(${p}% - var\\(--cine-hold\\) \\* ([\\d.]+)\\);`));
    assert.ok(after, `${sel} keeps cover ${p}%`);
    assert.equal(Number(after[1]), Number(p) / 100, `${sel}: ${p}% of the hold`);
  }
  // /#introduction lands on the rest pose, inside the hold.
  assert.match(holdBody, /scroll-margin-top: calc\(-1 \* var\(--header-clear\) - var\(--cine-hold\) \* \.4\);/);
});

test('Icarus finishes his fall inside the hold, lands 35-45% in, floats a little and drifts on after it', () => {
  // The hold begins when #introduction's top meets the window's: 100svh after the cover range starts.
  assert.match(holdBody, /--hold-in: 100svh;/);
  const land = Number(holdBody.match(/--hold-land: calc\(var\(--hold-in\) \+ var\(--cine-hold\) \* ([\d.]+)\);/)?.[1]);
  assert.ok(land >= .35 && land <= .45, `lands ${land} into the hold`);
  assert.match(holdBody, /--hold-out: calc\(var\(--hold-in\) \+ var\(--cine-hold\)\);/);
  // The fall keeps its keyframes (rest pose at 45%), stretched so 45% falls on the landing: the last part of the
  // fall plays in the hold, then the drift carries on through and after it. Figure, halo, feathers and light share it.
  const fall = 'cover var(--hold-fall) cover calc(var(--hold-fall) + (var(--hold-land) - var(--hold-fall)) / .45)';
  // The fall's first 45% takes a fixed scroll length ending on the landing; it starts behind the About scene, before
  // the (short) opening begins at 100svh - --about-run, so the drop shows through the opening and into the hold.
  const ahead = Number(holdBody.match(/--hold-fall: calc\(var\(--hold-land\) - (\d+)svh\);/)?.[1]);
  const run = Number(css.match(/--about-run: (\d+)svh;/)?.[1]);
  const start = 100 + 50 * land - ahead;
  assert.ok(start >= 0 && start <= 100 - run, `the fall starts at cover ${start}svh, before the opening (${100 - run}svh)`);
  assert.ok(ahead >= 50 && ahead <= 100, `a visible fall: ${ahead}svh to the landing`);
  assert.ok(holdBody.includes(`:is(.beam-figure, .beam-halo, .beam-feathers > span),\n      :root[data-tour] #about + #introduction .cinematic-light::after { animation-range: ${fall}; }`));
  assert.match(holdBody, new RegExp(`\\.beam-fall \\{\\s*animation: figure-fall linear both, figure-float ease-in-out none; animation-composition: replace, add; animation-timeline: --cine-scene, --cine-scene;\\s*animation-range: ${fall.replace(/[().*/+]/g, '\\$&')}, cover var\\(--hold-land\\) cover var\\(--hold-out\\);`));
  // Still at the landing and the release; a few px along the shaft and a slight sway in between.
  const float = css.match(/@keyframes figure-float \{[\s\S]*?\n {2}\}/)?.[0] ?? '';
  assert.match(float, /0%, 100% \{ translate: 0 0; rotate: 0deg; \}/);
  const tilts = [...float.matchAll(/rotate: (-?[\d.]+)deg/g)].map(match => Math.abs(Number(match[1])));
  assert.ok(Math.max(...tilts) >= 1.5 && Math.max(...tilts) <= 3, `sway ${tilts}`);
  const shift = Number(float.match(/var\(--float, (\d+)px\)/)?.[1]);
  const drifts = [...css.matchAll(/--drift: (\d+)px/g)].map(match => Number(match[1]));
  assert.ok(shift >= 2 && shift <= 8 && shift < Math.min(...drifts), `float ${shift}px stays inside the drift's clearance`);
  assert.doesNotMatch(float, /--float:/, 'one default');
});

test('the opening is about one screen long, and its phases share the run evenly and in order', () => {
  const opening = css.match(/:root\[data-tour\] #about \{[\s\S]*?\n {4}\}/)?.[0] ?? '';
  const run = Number(css.match(/:root\[data-tour\] :is\(#about, #about \+ #introduction\) \{ --about-run: (\d+)svh; \}/)?.[1]);
  // #about is 100svh + the run; #introduction slides up 100svh under it, so the page is only the run longer.
  assert.ok(run >= 15 && run <= 30, `run ${run}svh (was 120svh)`);
  assert.match(opening, /height: calc\(100svh \+ var\(--about-run\)\)/);
  const phase = name => {
    const m = opening.match(new RegExp(`--${name}: clamp\\(0, (?:\\(var\\(--about-p\\) - ([\\d.]+)\\)|var\\(--about-p\\)) \\/ ([\\d.]+), 1\\);`));
    assert.ok(m, `phase ${name}`);
    const [from, width] = [Number(m[1] ?? 0), Number(m[2])];
    return { from, width, to: from + width };
  };
  const p = Object.fromEntries(['t', 'o', 'f', 'g', 'e', 'b'].map(name => [name, phase(name)]));
  for (const [name, { width, to }] of Object.entries(p)) {
    assert.ok(width >= .3, `${name} spans ${width} of the run (${Math.round(width * run * 8)}px at 1280x800): not rushed`);
    assert.ok(to <= 1.0001, `${name} ends by the hand-over`);
  }
  // The title recedes as the window opens; the window's ground dissolves, then the field around it fades and the
  // in-window shaft hands over; the window's edge goes last.
  assert.ok(p.t.from <= p.o.from && p.o.from < p.f.from && p.f.from < p.g.from && p.g.from <= p.b.from && p.b.from < p.e.from);
  assert.ok(Object.values(p).every(({ to }) => to <= p.e.to), 'the edge goes last');
});

test('during the hold the whole stage fits the window on wide screens, with Icarus beside the copy, never on it', () => {
  const frame = timed.find(([, , body]) => body.includes('--stage-h:'));
  assert.ok(frame, 'a frame block');
  assert.equal(frame[1], ABOUT_OPEN_MEDIA, 'gated like the opening and the hold');
  const body = frame[2];
  assert.match(body, /^\s*@media \(min-width: 1001px\) \{/, 'only where the copy and pills sit side by side');
  assert.ok(css.indexOf(frame[0]) > css.indexOf('@layer responsive'), 'after the breakpoints, so its sizes win');
  // From --cine-pad (the sticky top, under the header bar) to a little above the window's bottom.
  const gap = Number(body.match(/--stage-h: calc\(100svh - var\(--cine-pad\) - (\d+)px\);/)?.[1]);
  assert.ok(gap >= 0 && gap <= 40, `stage ends ${gap}px above the window's bottom`);
  assert.match(body, /\.cinematic-stage \{[^}]*display: flex; flex-direction: column; justify-content: flex-end; min-height: var\(--stage-h\);/, 'copy at the foot');
  // Beside the copy: the copy column's right edge is the footer's padding plus its width.
  const column = Number(body.match(/\.cinematic-footer \{ grid-template-columns: minmax\(0, (\d+)px\) auto; \}/)?.[1]);
  const pad = Number(css.match(/\.cinematic-footer \{[^}]*padding: (\d+)px;/)?.[1]);
  assert.match(body, new RegExp(`left: max\\(calc\\(49% \\+ var\\(--stage-h\\) \\* \\.38 - \\(var\\(--art-top\\) \\+ var\\(--fig-h\\) \\* var\\(--body-ay\\)\\) \\* \\.78 - var\\(--fig-w\\) \\* var\\(--body-ax\\)\\), calc\\(${pad + column}px \\+ var\\(--art-side\\)\\)\\);`), 'on the shaft, or clear of the copy column');
  assert.match(body, /top: var\(--art-top\);/);
  // --art-side mirrors --art-clear sideways: the drift's leftward part, the tumble's wider box, a margin.
  assert.match(body, /--art-side: calc\(var\(--drift, 40px\) \* \.62 \+ var\(--fig-w\) \* \.08 \+ (\d+)px\);/);
  assert.ok(Number(body.match(/--art-side: [^;]*\+ (\d+)px\);/)[1]) >= 14);
  // Above the pills --art-clear still holds: his width is capped by the stage's height, less the pills' block
  // (pill height + the actions' bottom padding + the footer's padding).
  const pill = Number(css.match(/\.scene-pill \{[^}]*min-height: (\d+)px/)?.[1]);
  const actions = Number(css.match(/\.scene-actions \{[^}]*padding-bottom: (\d+)px/)?.[1]);
  assert.match(body, new RegExp(`--fig-fit: calc\\(\\(var\\(--stage-h\\) - var\\(--art-top\\) - ${pill + actions + pad}px - 14px - var\\(--drift, 40px\\) \\* \\.82\\) \\/ \\(var\\(--fig-ratio\\) \\+ \\.08\\)\\);`));
  // The capped widths repeat the breakpoint widths.
  const widths = [...css.matchAll(/(?:^|\n)\s*(?:@media \(min-width: (\d+)px\) \{ )?\.cinematic-stage \{ --foot-top: \d+px; \} \.cinematic-art \{ --fig-w: (\d+)px;/g)].map(m => m[2]);
  const base = css.match(/\.cinematic-art \{[^}]*--fig-w, (\d+)px\)/)?.[1];
  for (const w of [base, ...widths]) assert.ok(frame[0].includes(`--fig-w: min(${w}px, var(--fig-fit));`), `capped ${w}px`);
});

test('on phones Icarus stays whole inside the stage: smaller, left of the axis, landing as he comes into view', () => {
  const phone = css.match(/@media \(max-width: 760px\) \{\n {4}#about[\s\S]*?\n {2}\}/)?.[0] ?? '';
  const fig = phone.match(/\.cinematic-art \{ --fig-w: (\d+)px; --fig-x: (\d+)%; --fall: (\d+)px; --drift: (\d+)px; --fig-tilt: -3deg; \}/);
  assert.ok(fig, 'phone figure');
  const [w, x] = [Number(fig[1]), Number(fig[2]) / 100];
  // A 360px phone: the stage is 332px wide (14px padding a side, 1px borders). Room on the right at rest for the
  // last bit of the fall that is seen (about 90px along the 125deg shaft) and the tumble's wider box.
  const stage = 330;
  const right = stage * x + w / 2;
  assert.ok(right + 90 * .574 + w * .05 <= stage, `right edge ${Math.round(right)}px of ${stage}`);
  assert.ok(stage * x - w / 2 >= 24, 'clear of the left edge');
  const land = Number(base.match(/@media \(max-width: 760px\) \{\s*:is\(\.beam-fall, \.beam-figure, \.beam-halo, \.beam-feathers > span\), \.cinematic-light::after \{ animation-range: cover 0% cover calc\((\d+)svh \/ \.45\); \}/)?.[1]);
  assert.ok(land >= 25 && land <= 50, `lands ${land}svh after the scene enters`);
});

test('the ground behind the opening window never reaches above #about (over the hero)', () => {
  // #introduction is pulled up 100svh but its top still sits --about-run below #about's top; its dark shadow fills
  // only that gap. Lifted any further (e.g. by 100svh with a short run) it paints over the hero, unclickable.
  const rule = css.match(/:root\[data-tour\] #about \+ #introduction \{ position: relative;[^}]*\}/)?.[0] ?? '';
  assert.match(rule, /margin-top: -100svh;/);
  assert.match(rule, /box-shadow: 0 calc\(-1 \* var\(--about-run\)\) 0 #101114;/);
  assert.equal(css.split('box-shadow: 0 -').length - 1, 0, 'no fixed upward shadow');
  assert.equal(css.split('--about-run:').length - 1, 1, 'one run, shared by #about and #introduction');
  assert.match(css, /:root\[data-tour\] :is\(#about, #about \+ #introduction\) \{ --about-run: \d+svh; \}/);
  assert.match(css, /:root\[data-tour\] #about \{[^}]*height: calc\(100svh \+ var\(--about-run\)\)/);
});

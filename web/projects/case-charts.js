// case-charts.js: the chart toolkit shared by the case studies (web/projects/*.html).
//
// Load once per page, after ../project.css and ./case-charts.css:
//   <link rel="stylesheet" href="./case-charts.css">
//   <script type="module" src="./case-charts.js"></script>
//
// Charts are declared in HTML, and their data lives in the page (a <table>, a <dl> or a
// list), so every chart reads without JavaScript and with a screen reader. This module only
// draws an SVG picture of that data (aria-hidden), sized in real pixels so text never drops
// under 11px, and animates it once when it scrolls into view. prefers-reduced-motion shows
// the final state with no motion; print shows the final state. Text is only ever set with
// textContent and SVG is built with createElementNS: no HTML strings (strict CSP, see
// tests/security.test.js).
//
// Contract. Every chart is <figure class="cc-figure" data-chart="TYPE"> with a <figcaption>,
// an empty <div class="cc-canvas"></div> for the drawing (not for counters), and its data
// in <div class="cc-data" data-toggle="Show the numbers"> (a "Show/Hide" button is added;
// without JS the data is simply shown). Illustrations add data-illustration and their caption
// starts with "Illustration".
//
//   bars     <table class="cc-table">: one <tbody> row per bar, <th scope="row"> label
//            (data-short="…" is used inside small multiples), <td> value as shown. A cell's
//            data-value="1234.5" overrides the parsed number; data-share="0.5" draws the bar at
//            that share of the column's largest value (for "about half"). Several <td> columns
//            become small multiples, one panel per column, titled by the <thead> <th>.
//            Row data-tone="accent|soft" colours a bar.
//   columns  the same table as vertical columns (first value column); data-short x labels on
//            narrow charts.
//   line     the same table as a line through the first value column, in row order.
//   waffle   row 1 = a total, each next row a nested subset of the row above; one square per
//            unit of the total, coloured by how deep it sits; the rows become the legend.
//   counters <dl class="cc-stats"> with <span class="cc-num">514</span> inside each <dd>:
//            counts up from 0 to the number as written ($ , . % and words around it kept).
//   scatter  ILLUSTRATION ONLY. Seeded synthetic clusters, one per table row (label = what
//            each point is drawn as, value = how many points). data-seed, data-noise (0–1),
//            data-noise-label="Noise" adds a range input and a live readout.
//   graph    a diagram. <ol class="cc-nodes"> <li data-node="id" data-at="col,row"
//            data-at-narrow="col,row" data-glyph="…" data-tone="dark">
//            <span class="mono cc-node-label">Label</span> <span class="cc-node-text">Text</span>
//            </li>; <ul class="cc-edges"> <li data-from="a" data-to="b" data-kind="fail|both"
//            data-bend="hv|vh|arc:40|loop-down:30" data-bend-narrow="…">What it means.</li>
//            (hv/vh: one right-angle turn; arc:k: curve k px to the left of the direction;
//            loop-down|up|left|right:k: out of one side, k px past both nodes, and back);
//            optional <ul class="cc-frames"><li data-frame="a b">Frame title</li></ul>. Figure:
//            data-grid="5x2", data-grid-narrow="2x6", data-narrow-below="560" (px),
//            data-node-scale(-narrow)="0.8" (node width as a share of its grid cell), and
//            data-route="a b c": a dot travels those hops (each one an edge, either direction)
//            while the edge's text shows under the drawing. Glyphs: eeg, bottleneck, scatter,
//            letters, phone, server, database, emotion, model, code, review, check, person,
//            gate, task.
//
// Any element with data-cc-reveal gets the class cc-in once it scrolls into view, for
// CSS-only animations (the timeline in case-charts.css).

const NS = 'http://www.w3.org/2000/svg';
const EASE = 'cubic-bezier(.16, 1, .3, 1)';
let uid = 0;

// ---- Pure helpers (no DOM; tests/case-studies.test.js imports them) ----

// "$5,070.56" -> { value: 5070.56, decimals: 2, grouped: true, before: '$', after: '' }
export function parseNumber(text) {
  const source = String(text ?? '');
  const match = source.match(/-?\d[\d,]*(?:\.\d+)?/);
  if (!match) return null;
  const raw = match[0];
  return {
    value: Number(raw.replace(/,/g, '')),
    decimals: raw.includes('.') ? raw.split('.')[1].length : 0,
    grouped: raw.includes(','),
    before: source.slice(0, match.index),
    after: source.slice(match.index + raw.length),
  };
}

export function formatNumber(value, { decimals = 0, grouped = false } = {}) {
  const [int, frac] = Math.abs(value).toFixed(decimals).split('.');
  const body = grouped ? int.replace(/\B(?=(\d{3})+(?!\d))/g, ',') : int;
  return `${value < 0 ? '-' : ''}${body}${frac ? `.${frac}` : ''}`;
}

// The text of a counter part-way through: 0 at p = 0, the written text at p = 1.
export function countText(parsed, p) {
  if (p >= 1) return `${parsed.before}${formatNumber(parsed.value, parsed)}${parsed.after}`;
  const value = parsed.decimals ? parsed.value * p : Math.round(parsed.value * p);
  return `${parsed.before}${formatNumber(value, parsed)}${parsed.after}`;
}

// Seeded random numbers in [0, 1) (mulberry32), so an illustration is the same on every load.
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function gaussian(random) {
  let u = 0;
  let v = 0;
  while (u === 0) u = random();
  while (v === 0) v = random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// Greedy word wrap to at most `max` characters a line (a long word gets its own line).
export function wrap(text, max) {
  const lines = [];
  let line = '';
  for (const word of String(text).split(/\s+/).filter(Boolean)) {
    if (line && `${line} ${word}`.length > max) {
      lines.push(line);
      line = word;
    } else line = line ? `${line} ${word}` : word;
  }
  if (line) lines.push(line);
  return lines;
}

// Synthetic clusters for the scatter illustration: deterministic for a seed.
export function makeClusters(counts, seed) {
  const random = rng(seed);
  const n = counts.length;
  const centers = counts.map((_, k) => {
    const angle = (k / n) * Math.PI * 2 - Math.PI / 2 + (random() - 0.5) * 0.5;
    return [0.5 + 0.31 * Math.cos(angle), 0.5 + 0.3 * Math.sin(angle)];
  });
  const points = [];
  counts.forEach((count, k) => {
    for (let i = 0; i < count; i++) points.push({ k, gx: gaussian(random), gy: gaussian(random) });
  });
  return { centers, points };
}

export const spreadFor = noise => 0.028 + noise * 0.14;

export function placePoints({ centers, points }, noise) {
  const spread = spreadFor(noise);
  return points.map(({ k, gx, gy }) => {
    const x = Math.min(0.98, Math.max(0.02, centers[k][0] + gx * spread));
    const y = Math.min(0.98, Math.max(0.02, centers[k][1] + gy * spread));
    let nearest = k;
    let best = Infinity;
    centers.forEach(([cx, cy], j) => {
      const d = (cx - x) ** 2 + (cy - y) ** 2;
      if (d < best) { best = d; nearest = j; }
    });
    return { k, x, y, stray: nearest !== k };
  });
}

// ---- DOM helpers ----

function svgEl(name, attrs = {}, parent) {
  const node = document.createElementNS(NS, name);
  for (const [key, value] of Object.entries(attrs)) if (value !== undefined && value !== null) node.setAttribute(key, String(value));
  if (parent) parent.append(node);
  return node;
}
function label(parent, x, y, content, cls, extra = {}) {
  const node = svgEl('text', { x: round(x), y: round(y), class: cls, ...extra }, parent);
  node.textContent = content;
  return node;
}
const round = n => Math.round(n * 10) / 10;
function makeSvg(canvas, w, h) {
  const svg = svgEl('svg', { width: w, height: h, viewBox: `0 0 ${w} ${h}`, class: 'cc-svg', 'aria-hidden': 'true', focusable: 'false' });
  canvas.append(svg);
  return svg;
}
function sizeSvg(svg, w, h) {
  svg.setAttribute('height', Math.ceil(h));
  svg.setAttribute('viewBox', `0 0 ${w} ${Math.ceil(h)}`);
}
const charsWide = (text, px) => String(text).length * px;

// A row header's text without its .cc-mark note: "Nov 10 (in the replay)" draws as "Nov 10".
function labelOf(th) {
  const copy = th.cloneNode(true);
  for (const mark of copy.querySelectorAll('.cc-mark')) mark.remove();
  return copy.textContent.trim().replace(/\s+/g, ' ');
}

function readTable(figure) {
  const table = figure.querySelector('table');
  if (!table) return { heads: [], rows: [] };
  const heads = [...table.querySelectorAll('thead th')].map(th => th.textContent.trim());
  const rows = [...table.querySelectorAll('tbody tr')].map(tr => {
    const th = tr.querySelector('th');
    const cells = [...tr.querySelectorAll('td')].map(td => ({
      text: td.textContent.trim(),
      value: td.dataset.value !== undefined ? Number(td.dataset.value) : (parseNumber(td.textContent)?.value ?? 0),
      share: td.dataset.share !== undefined ? Number(td.dataset.share) : null,
    }));
    return { label: th ? labelOf(th) : '', short: th?.dataset.short || '', tone: tr.dataset.tone || '', cells };
  });
  const width = Math.max(0, ...rows.map(row => row.cells.length));
  for (let j = 0; j < width; j++) {
    const max = Math.max(0, ...rows.map(row => (row.cells[j] && row.cells[j].share === null ? row.cells[j].value : 0)));
    for (const row of rows) if (row.cells[j]?.share !== null && row.cells[j]) row.cells[j].value = row.cells[j].share * max;
  }
  return { heads, rows };
}

// ---- Charts: each draws the final state and returns { svg, steps } ----
// A step animates one element when the chart enters the view:
// grow-x, grow-y, draw (a path), fade or pop, after `delay` ms.

function anim(node, kind, delay, steps, duration) {
  node.classList.add('cc-anim');
  if (kind === 'grow-x') node.classList.add('cc-gx');
  if (kind === 'grow-y') node.classList.add('cc-gy');
  if (kind === 'pop') node.classList.add('cc-pop');
  if (kind === 'draw') { node.setAttribute('pathLength', '1'); node.setAttribute('stroke-dasharray', '1'); }
  steps.push({ node, kind, delay, duration });
}

function barPanel(svg, x, y, w, rows, j, title, steps, base) {
  let cy = y;
  if (title) { label(svg, x, cy + 11, title.toUpperCase(), 'cc-t-head'); cy += 24; }
  const max = Math.max(1e-9, ...rows.map(row => row.cells[j]?.value ?? 0));
  const stacked = Boolean(title) || w < 460;
  const names = rows.map(row => (title && row.short ? row.short : row.label));
  const valueW = Math.max(...rows.map(row => charsWide(row.cells[j]?.text || '', 7.4))) + 12;
  const labelW = stacked ? 0 : Math.min(w * 0.42, Math.max(...names.map(name => charsWide(name, 7.2))) + 18);
  const track = Math.max(30, w - labelW - valueW);
  rows.forEach((row, i) => {
    const cell = row.cells[j];
    if (!cell) return;
    let by;
    if (stacked) { label(svg, x, cy + 13, names[i], 'cc-t-row'); by = cy + 21; cy += 21 + 16 + 14; }
    else { label(svg, x, cy + 17, names[i], 'cc-t-row'); by = cy + 5; cy += 34; }
    const bw = Math.max(2, (cell.value / max) * track);
    const bar = svgEl('rect', { x: round(x + labelW), y: by, width: round(bw), height: 16, rx: 3, class: `cc-bar${row.tone ? ` is-${row.tone}` : ''}` }, svg);
    const value = label(svg, x + labelW + bw + 8, by + 12.5, cell.text, 'cc-t-val');
    anim(bar, 'grow-x', base + i * 70, steps);
    anim(value, 'fade', base + i * 70 + 380, steps);
  });
  return cy - y;
}

function drawBars(figure, canvas, W) {
  const { heads, rows } = readTable(figure);
  const svg = makeSvg(canvas, W, 10);
  const steps = [];
  const columns = Math.max(1, ...rows.map(row => row.cells.length));
  if (columns === 1) {
    sizeSvg(svg, W, barPanel(svg, 0, 0, W, rows, 0, '', steps, 0) + 4);
    return { svg, steps };
  }
  const side = W >= 640;
  const gap = 32;
  const pw = side ? (W - gap * (columns - 1)) / columns : W;
  let height = 0;
  let y = 0;
  for (let j = 0; j < columns; j++) {
    const x = side ? j * (pw + gap) : 0;
    const h = barPanel(svg, x, side ? 0 : y, pw, rows, j, heads[j + 1] || '', steps, j * 220);
    if (side) height = Math.max(height, h);
    else { y += h + 22; height = y - 22; }
  }
  sizeSvg(svg, W, height + 4);
  return { svg, steps };
}

function drawColumns(figure, canvas, W) {
  const { rows } = readTable(figure);
  const H = 232;
  const top = 26;
  const bottom = 30;
  const plot = H - top - bottom;
  const svg = makeSvg(canvas, W, H);
  const steps = [];
  const slot = W / rows.length;
  const cw = Math.min(64, slot * 0.62);
  const max = Math.max(1e-9, ...rows.map(row => row.cells[0]?.value ?? 0));
  svgEl('line', { x1: 0, x2: W, y1: top + plot + 0.5, y2: top + plot + 0.5, class: 'cc-base' }, svg);
  rows.forEach((row, i) => {
    const value = row.cells[0]?.value ?? 0;
    const h = Math.max(2, (value / max) * plot);
    const cx = slot * i + slot / 2;
    const col = svgEl('rect', { x: round(cx - cw / 2), y: round(top + plot - h), width: round(cw), height: round(h), rx: 3, class: `cc-col${row.tone ? ` is-${row.tone}` : ''}` }, svg);
    anim(col, 'grow-y', i * 90, steps);
    anim(label(svg, cx, top + plot - h - 8, row.cells[0]?.text || '', 'cc-t-val', { 'text-anchor': 'middle' }), 'fade', i * 90 + 420, steps);
    label(svg, cx, H - 8, (slot < 64 && row.short ? row.short : row.label).toUpperCase(), 'cc-t-axis', { 'text-anchor': 'middle' });
  });
  return { svg, steps };
}

function drawLine(figure, canvas, W) {
  const { rows } = readTable(figure);
  const H = 248;
  const top = 32;
  const bottom = 34;
  const narrow = W / rows.length < 70;
  const names = rows.map(row => (narrow && row.short ? row.short : row.label).toUpperCase());
  const inset = Math.max(26, Math.max(...names.map(name => charsWide(name, 7.2))) / 2 + 4);
  const plot = H - top - bottom;
  const svg = makeSvg(canvas, W, H);
  const steps = [];
  const max = Math.max(1e-9, ...rows.map(row => row.cells[0]?.value ?? 0)) * 1.06;
  const xs = rows.map((_, i) => inset + (rows.length === 1 ? 0 : (i / (rows.length - 1)) * (W - inset * 2)));
  const ys = rows.map(row => top + plot * (1 - (row.cells[0]?.value ?? 0) / max));
  for (const f of [0, 0.5, 1]) svgEl('line', { x1: 0, x2: W, y1: round(top + plot * f) + 0.5, y2: round(top + plot * f) + 0.5, class: f === 1 ? 'cc-base' : 'cc-grid' }, svg);
  const line = xs.map((x, i) => `${i ? 'L' : 'M'}${round(x)} ${round(ys[i])}`).join(' ');
  const area = svgEl('path', { d: `${line} L${round(xs.at(-1))} ${top + plot} L${round(xs[0])} ${top + plot} Z`, class: 'cc-area' }, svg);
  anim(area, 'fade', 700, steps, 900);
  anim(svgEl('path', { d: line, class: 'cc-line' }, svg), 'draw', 0, steps, 1500);
  rows.forEach((row, i) => {
    const at = rows.length === 1 ? 0 : (i / (rows.length - 1)) * 1500;
    anim(svgEl('circle', { cx: round(xs[i]), cy: round(ys[i]), r: 5, class: 'cc-point' }, svg), 'pop', at, steps);
    anim(label(svg, xs[i], ys[i] - 13, row.cells[0]?.text || '', 'cc-t-val', { 'text-anchor': 'middle' }), 'fade', at + 120, steps);
    label(svg, xs[i], H - 9, names[i], 'cc-t-axis', { 'text-anchor': 'middle' });
  });
  return { svg, steps };
}

function drawWaffle(figure, canvas, W) {
  const { rows } = readTable(figure);
  const total = Math.round(rows[0]?.cells[0]?.value ?? 0);
  const nested = rows.slice(1).map(row => Math.round(row.cells[0]?.value ?? 0));
  const cols = W >= 560 ? 26 : 13;
  const gap = 4;
  const size = Math.max(8, Math.min(26, Math.floor((W - gap * (cols - 1)) / cols)));
  const svg = makeSvg(canvas, W, 10);
  const steps = [];
  const depthOf = i => nested.filter(count => i < count).length;
  const square = (parent, x, y, depth, s) => {
    const g = svgEl('g', { class: `cc-sq cc-sq-${depth}` }, parent);
    svgEl('rect', { x, y, width: s, height: s, rx: 3 }, g);
    if (depth >= 2) svgEl('path', { d: `M${x + s * 0.27} ${y + s * 0.53} l${s * 0.16} ${s * 0.16} l${s * 0.32} -${s * 0.36}`, class: 'cc-sq-mark' }, g);
    return g;
  };
  for (let i = 0; i < total; i++) {
    const g = square(svg, (i % cols) * (size + gap), Math.floor(i / cols) * (size + gap), depthOf(i), size);
    anim(g, 'pop', i * 18, steps, 420);
  }
  let y = Math.ceil(total / cols) * (size + gap) + 14;
  rows.forEach((row, depth) => {
    const s = 16;
    square(svg, 0, y, depth, s);
    label(svg, s + 10, y + 12.5, `${row.label} · ${row.cells[0]?.text || ''}`, 'cc-t-row');
    y += 26;
  });
  sizeSvg(svg, W, y);
  return { svg, steps };
}

// ---- Scatter illustration ----

function drawScatter(figure, canvas, W, state) {
  const { rows } = readTable(figure);
  if (!state.clusters) state.clusters = makeClusters(rows.map(row => Math.round(row.cells[0]?.value ?? 0)), Number(figure.dataset.seed || 7));
  if (state.noise === undefined) state.noise = Number(figure.dataset.noise || 0.3);
  const H = Math.round(Math.min(380, Math.max(260, W * 0.6)));
  const svg = makeSvg(canvas, W, H);
  const steps = [];
  svgEl('rect', { x: 0.5, y: 0.5, width: W - 1, height: H - 1, rx: 6, class: 'cc-plot' }, svg);
  label(svg, 12, 22, (figure.dataset.plotLabel || '2D map · illustration').toUpperCase(), 'cc-t-head');
  const names = rows.map(row => row.label);
  const nodes = state.clusters.points.map(({ k }, i) => {
    const node = label(svg, 0, 0, names[k], `cc-pt cc-pt-${k % 5}`);
    anim(node, 'pop', (i % 40) * 14 + Math.floor(i / 40) * 90, steps, 520);
    return node;
  });
  state.place = () => {
    const placed = placePoints(state.clusters, state.noise);
    placed.forEach((point, i) => {
      nodes[i].setAttribute('x', round(point.x * W));
      nodes[i].setAttribute('y', round(34 + point.y * (H - 46)));
    });
    return placed;
  };
  state.place();
  return { svg, steps };
}

function setupNoise(figure, state, render) {
  const name = figure.dataset.noiseLabel;
  if (!name) return;
  const id = `cc-noise-${++uid}`;
  const control = document.createElement('div');
  control.className = 'cc-control';
  const text = document.createElement('label');
  text.className = 'mono';
  text.htmlFor = id;
  text.textContent = name;
  const less = document.createElement('span');
  less.className = 'cc-control-end mono';
  less.setAttribute('aria-hidden', 'true');
  less.textContent = 'Less';
  const input = document.createElement('input');
  input.type = 'range';
  input.id = id;
  input.min = '0';
  input.max = '100';
  input.step = '1';
  input.value = String(Math.round(Number(figure.dataset.noise || 0.3) * 100));
  const more = less.cloneNode();
  more.textContent = 'More';
  const readout = document.createElement('p');
  readout.className = 'cc-readout';
  readout.setAttribute('aria-live', 'polite');
  control.append(text, less, input, more);
  figure.querySelector('.cc-canvas').after(control, readout);
  let timer;
  const describe = placed => {
    const strays = placed.filter(point => point.stray).length;
    readout.textContent = `${strays} of ${placed.length} synthetic points sit closer to another letter’s center than to their own.`;
  };
  // The readout is a polite live region: it only speaks after the visitor moves the slider,
  // once they pause (700 ms), never on load or on a redraw.
  const update = () => {
    state.noise = Number(input.value) / 100;
    input.setAttribute('aria-valuetext', `${input.value} of 100`);
    for (const animation of figure.getAnimations?.({ subtree: true }) ?? []) animation.finish();
    const placed = state.place ? state.place() : [];
    clearTimeout(timer);
    timer = setTimeout(() => describe(placed), 700);
  };
  input.addEventListener('input', update);
  input.setAttribute('aria-valuetext', `${input.value} of 100`);
}

// ---- Graph diagrams ----

const GLYPHS = {
  eeg: g => [0, 9, 18].forEach((dy, i) => svgEl('path', { d: `M1 ${5 + dy} q3 -${3 + i} 6 0 t6 0 t6 0 t6 0`, class: 'cc-glyph-line' }, g)),
  bottleneck: g => svgEl('path', { d: 'M1 3h26l-9 11 9 11H1l9-11z', class: 'cc-glyph-line' }, g),
  scatter: g => [[5, 7], [9, 4], [8, 10], [19, 18], [23, 21], [20, 24], [14, 15]].forEach(([cx, cy]) => svgEl('circle', { cx, cy, r: 2.2, class: 'cc-glyph-fill' }, g)),
  letters: g => { const t = svgEl('text', { x: 0, y: 19, class: 'cc-glyph-text' }, g); t.textContent = 'a b c'; },
  phone: g => { svgEl('rect', { x: 8, y: 1, width: 13, height: 26, rx: 3, class: 'cc-glyph-line' }, g); svgEl('path', { d: 'M12 23h5', class: 'cc-glyph-line' }, g); },
  server: g => { svgEl('rect', { x: 2, y: 3, width: 24, height: 9, rx: 2, class: 'cc-glyph-line' }, g); svgEl('rect', { x: 2, y: 16, width: 24, height: 9, rx: 2, class: 'cc-glyph-line' }, g); svgEl('circle', { cx: 7, cy: 7.5, r: 1.4, class: 'cc-glyph-fill' }, g); svgEl('circle', { cx: 7, cy: 20.5, r: 1.4, class: 'cc-glyph-fill' }, g); },
  database: g => { svgEl('ellipse', { cx: 14, cy: 5, rx: 11, ry: 4, class: 'cc-glyph-line' }, g); svgEl('path', { d: 'M3 5v17c0 2.2 4.9 4 11 4s11-1.8 11-4V5M3 13.5c0 2.2 4.9 4 11 4s11-1.8 11-4', class: 'cc-glyph-line' }, g); },
  emotion: g => { svgEl('circle', { cx: 14, cy: 14, r: 12, class: 'cc-glyph-line' }, g); svgEl('path', { d: 'M8.5 16.5q5.5 5 11 0', class: 'cc-glyph-line' }, g); svgEl('circle', { cx: 10, cy: 11, r: 1.5, class: 'cc-glyph-fill' }, g); svgEl('circle', { cx: 18, cy: 11, r: 1.5, class: 'cc-glyph-fill' }, g); },
  model: g => { svgEl('rect', { x: 6, y: 6, width: 16, height: 16, rx: 3, class: 'cc-glyph-line' }, g); svgEl('path', { d: 'M10 1v5M18 1v5M10 22v5M18 22v5M1 10h5M1 18h5M22 10h5M22 18h5', class: 'cc-glyph-line' }, g); },
  code: g => svgEl('path', { d: 'M9 6 2 14l7 8M19 6l7 8-7 8M16 3l-4 22', class: 'cc-glyph-line' }, g),
  review: g => { svgEl('path', { d: 'M1 14s5-9 13-9 13 9 13 9-5 9-13 9S1 14 1 14z', class: 'cc-glyph-line' }, g); svgEl('circle', { cx: 14, cy: 14, r: 4, class: 'cc-glyph-line' }, g); },
  check: g => { svgEl('circle', { cx: 14, cy: 14, r: 12, class: 'cc-glyph-line' }, g); svgEl('path', { d: 'm8 14.5 4 4 8-9', class: 'cc-glyph-line' }, g); },
  person: g => { svgEl('circle', { cx: 14, cy: 8, r: 6, class: 'cc-glyph-line' }, g); svgEl('path', { d: 'M3 27c1-6 5.5-9 11-9s10 3 11 9', class: 'cc-glyph-line' }, g); },
  gate: g => { svgEl('rect', { x: 4, y: 12, width: 20, height: 15, rx: 3, class: 'cc-glyph-line' }, g); svgEl('path', { d: 'M9 12V8a5 5 0 0 1 10 0v4M14 18v3', class: 'cc-glyph-line' }, g); },
  task: g => svgEl('path', { d: 'M3 5h3M10 5h15M3 14h3M10 14h15M3 23h3M10 23h11', class: 'cc-glyph-line' }, g),
};

function borderPoint(box, tx, ty) {
  const dx = tx - box.cx;
  const dy = ty - box.cy;
  if (!dx && !dy) return [box.cx, box.cy];
  const sx = dx ? box.w / 2 / Math.abs(dx) : Infinity;
  const sy = dy ? box.h / 2 / Math.abs(dy) : Infinity;
  const s = Math.min(sx, sy);
  return [box.cx + dx * s, box.cy + dy * s];
}

function roundedPath(points, radius = 10) {
  let d = `M${round(points[0][0])} ${round(points[0][1])}`;
  for (let i = 1; i < points.length - 1; i++) {
    const [px, py] = points[i - 1];
    const [x, y] = points[i];
    const [nx, ny] = points[i + 1];
    const a = Math.min(radius, Math.hypot(x - px, y - py) / 2);
    const b = Math.min(radius, Math.hypot(nx - x, ny - y) / 2);
    const ux = Math.sign(x - px) * (Math.abs(x - px) > 0.01 ? 1 : 0);
    const uy = Math.sign(y - py) * (Math.abs(y - py) > 0.01 ? 1 : 0);
    const vx = Math.sign(nx - x) * (Math.abs(nx - x) > 0.01 ? 1 : 0);
    const vy = Math.sign(ny - y) * (Math.abs(ny - y) > 0.01 ? 1 : 0);
    d += ` L${round(x - ux * a)} ${round(y - uy * a)} Q${round(x)} ${round(y)} ${round(x + vx * b)} ${round(y + vy * b)}`;
  }
  const last = points.at(-1);
  return `${d} L${round(last[0])} ${round(last[1])}`;
}

// Path data plus the direction it leaves and arrives (for the drawn arrowheads).
function edgeGeometry(a, b, bend) {
  const loop = /^loop-(down|up|left|right):(\d+)$/.exec(bend || '');
  if (loop) {
    const k = Number(loop[2]);
    let points;
    if (loop[1] === 'down' || loop[1] === 'up') {
      const down = loop[1] === 'down';
      const y = down ? Math.max(a.y + a.h, b.y + b.h) + k : Math.min(a.y, b.y) - k;
      points = [[a.cx, down ? a.y + a.h : a.y], [a.cx, y], [b.cx, y], [b.cx, down ? b.y + b.h : b.y]];
    } else {
      const right = loop[1] === 'right';
      const x = right ? Math.max(a.x + a.w, b.x + b.w) + k : Math.min(a.x, b.x) - k;
      points = [[right ? a.x + a.w : a.x, a.cy], [x, a.cy], [x, b.cy], [right ? b.x + b.w : b.x, b.cy]];
    }
    return { d: roundedPath(points), start: points[0], end: points[3], from: points[2], to: points[1], extent: points };
  }
  if (bend === 'hv') {
    const start = [b.cx > a.cx ? a.x + a.w : a.x, a.cy];
    const end = [b.cx, b.cy > a.cy ? b.y : b.y + b.h];
    return { d: roundedPath([start, [end[0], start[1]], end]), start, end, from: [end[0], start[1]], to: [end[0], start[1]] };
  }
  if (bend === 'vh') {
    const start = [a.cx, b.cy > a.cy ? a.y + a.h : a.y];
    const end = [b.cx > a.cx ? b.x : b.x + b.w, b.cy];
    return { d: roundedPath([start, [start[0], end[1]], end]), start, end, from: [start[0], end[1]], to: [start[0], end[1]] };
  }
  const k = bend?.startsWith('arc:') ? Number(bend.slice(4)) : 0;
  const mx = (a.cx + b.cx) / 2;
  const my = (a.cy + b.cy) / 2;
  const len = Math.hypot(b.cx - a.cx, b.cy - a.cy) || 1;
  const control = [mx - ((b.cy - a.cy) / len) * k, my + ((b.cx - a.cx) / len) * k];
  const start = borderPoint(a, ...(k ? control : [b.cx, b.cy]));
  const end = borderPoint(b, ...(k ? control : [a.cx, a.cy]));
  const d = k ? `M${round(start[0])} ${round(start[1])} Q${round(control[0])} ${round(control[1])} ${round(end[0])} ${round(end[1])}` : `M${round(start[0])} ${round(start[1])} L${round(end[0])} ${round(end[1])}`;
  return { d, start, end, from: k ? control : start, to: k ? control : end };
}

function arrowHead(parent, [x, y], [fx, fy], cls) {
  const angle = Math.atan2(y - fy, x - fx);
  const p = (r, t) => `${round(x + Math.cos(angle + t) * r)} ${round(y + Math.sin(angle + t) * r)}`;
  return svgEl('path', { d: `M${p(9, Math.PI - 0.45)} L${round(x)} ${round(y)} L${p(9, Math.PI + 0.45)}`, class: cls }, parent);
}

function drawGraph(figure, canvas, W) {
  const narrow = W < Number(figure.dataset.narrowBelow || 560);
  const [cols, rowsN] = ((narrow && figure.dataset.gridNarrow) || figure.dataset.grid || '3x1').split('x').map(Number);
  const frames = [...figure.querySelectorAll('.cc-frames > li[data-frame]')].map(li => ({ ids: li.dataset.frame.split(/\s+/), title: li.textContent.trim() }));
  const pad = frames.length ? 16 : 6;
  const frameSpace = frames.length ? 30 : 0;
  const gapX = narrow ? 26 : 38;
  const gapY = (narrow ? 34 : 46) + frameSpace;
  const cellW = (W - pad * 2 - gapX * (cols - 1)) / cols;
  const nodeW = cellW * Math.min(1, Number((narrow && figure.dataset.nodeScaleNarrow) || figure.dataset.nodeScale || 1));
  const maxChars = Math.max(5, Math.floor((nodeW - 24) / 8.3));
  const nodes = [...figure.querySelectorAll('.cc-nodes > li[data-node]')].map(li => ({
    id: li.dataset.node,
    at: ((narrow && li.dataset.atNarrow) || li.dataset.at || '0,0').split(',').map(Number),
    label: (li.querySelector('.cc-node-label')?.textContent || '').trim(),
    lines: wrap((li.querySelector('.cc-node-text')?.textContent || '').trim(), maxChars).slice(0, 3),
    glyph: li.dataset.glyph || '',
    tone: li.dataset.tone || '',
  }));
  const glyphs = nodes.some(node => node.glyph && GLYPHS[node.glyph]);
  const maxLines = Math.max(1, ...nodes.map(node => node.lines.length));
  const textTop = glyphs ? 80 : 44;
  const nodeH = textTop + (maxLines - 1) * 19 + 15;
  const boxes = new Map(nodes.map(node => {
    const x = pad + node.at[0] * (cellW + gapX);
    const y = pad + frameSpace + node.at[1] * (nodeH + gapY);
    return [node.id, { x, y, w: nodeW, h: nodeH, cx: x + nodeW / 2, cy: y + nodeH / 2 }];
  }));
  const H = pad * 2 + frameSpace + rowsN * nodeH + (rowsN - 1) * gapY + (frames.length ? 10 : 0);
  const svg = makeSvg(canvas, W, H);
  const steps = [];
  for (const frame of frames) {
    const members = frame.ids.map(id => boxes.get(id)).filter(Boolean);
    if (!members.length) continue;
    const x0 = Math.min(...members.map(b => b.x)) - 12;
    const y0 = Math.min(...members.map(b => b.y)) - frameSpace + 2;
    const x1 = Math.max(...members.map(b => b.x + b.w)) + 12;
    const y1 = Math.max(...members.map(b => b.y + b.h)) + 10;
    const g = svgEl('g', { class: 'cc-frame-g' }, svg);
    svgEl('rect', { x: round(x0), y: round(y0), width: round(x1 - x0), height: round(y1 - y0), rx: 8, class: 'cc-frame' }, g);
    label(g, x0 + 12, y0 + 18, frame.title.toUpperCase(), 'cc-t-head');
    anim(g, 'fade', 0, steps, 600);
  }
  const edges = [];
  let bottom = H;
  const edgeLayer = svgEl('g', {}, svg);
  [...figure.querySelectorAll('.cc-edges > li[data-from]')].forEach((li, i) => {
    const a = boxes.get(li.dataset.from);
    const b = boxes.get(li.dataset.to);
    if (!a || !b) return;
    const kind = li.dataset.kind || '';
    const geometry = edgeGeometry(a, b, (narrow && li.dataset.bendNarrow) || li.dataset.bend || '');
    const g = svgEl('g', { class: `cc-edge-g${kind ? ` is-${kind}` : ''}` }, edgeLayer);
    const path = svgEl('path', { d: geometry.d, class: 'cc-edge' }, g);
    const heads = [arrowHead(g, geometry.end, geometry.from, 'cc-arrow')];
    if (kind === 'both') heads.push(arrowHead(g, geometry.start, geometry.to, 'cc-arrow'));
    const delay = nodes.length * 90 + 200 + i * 110;
    if (kind === 'fail') anim(path, 'fade', delay, steps, 500);
    else anim(path, 'draw', delay, steps, 650);
    for (const head of heads) anim(head, 'fade', delay + 450, steps, 300);
    edges.push({ from: li.dataset.from, to: li.dataset.to, path, text: li.textContent.trim().replace(/\s+/g, ' ') });
    for (const [, y] of geometry.extent || []) bottom = Math.max(bottom, y + 10);
  });
  const rings = new Map();
  nodes.forEach((node, i) => {
    const box = boxes.get(node.id);
    const g = svgEl('g', { class: `cc-n${node.tone ? ` is-${node.tone}` : ''}` }, svg);
    rings.set(node.id, svgEl('rect', { x: round(box.x - 5), y: round(box.y - 5), width: round(box.w + 10), height: round(box.h + 10), rx: 10, class: 'cc-ring', opacity: 0 }, g));
    svgEl('rect', { x: round(box.x), y: round(box.y), width: round(box.w), height: round(box.h), rx: 7, class: 'cc-node' }, g);
    label(g, box.x + 12, box.y + 22, node.label.toUpperCase(), 'cc-n-label');
    if (node.glyph && GLYPHS[node.glyph]) {
      const glyph = svgEl('g', { class: 'cc-glyph', transform: `translate(${round(box.x + 12)} ${round(box.y + 34)})` }, g);
      GLYPHS[node.glyph](glyph);
    }
    node.lines.forEach((line, n) => label(g, box.x + 12, box.y + textTop + n * 19, line, 'cc-n-text'));
    anim(g, 'pop', i * 90, steps, 560);
  });
  const first = boxes.values().next().value || { cx: 0, cy: 0 };
  const dot = svgEl('circle', { cx: round(first.cx), cy: round(first.cy), r: 6.5, class: 'cc-dot', opacity: 0 }, svg);
  if (bottom > H) sizeSvg(svg, W, bottom);
  return { svg, steps, edges, rings, dot, end: nodes.length * 90 + 200 + edges.length * 110 + 700 };
}

// ---- Playback ----

const easeInOut = t => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
function tween(run, duration, fn) {
  return new Promise(resolve => {
    const start = performance.now();
    const tick = now => {
      if (run.cancelled) return;
      const t = Math.min(1, (now - start) / duration);
      fn(t);
      if (t < 1) run.raf = requestAnimationFrame(tick);
      else resolve();
    };
    run.raf = requestAnimationFrame(tick);
  });
}
const pause = (run, ms) => new Promise(resolve => { run.timer = setTimeout(() => { if (!run.cancelled) resolve(); }, ms); });

function playSteps(view) {
  for (const { node, kind, delay, duration } of view.steps) {
    const timing = { duration: duration ?? 700, delay, easing: EASE, fill: 'backwards' };
    const frames = {
      'grow-x': [{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }],
      'grow-y': [{ transform: 'scaleY(0)' }, { transform: 'scaleY(1)' }],
      draw: [{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }],
      fade: [{ opacity: 0 }, { opacity: 1 }],
      pop: [{ opacity: 0, transform: 'scale(.6)' }, { opacity: 1, transform: 'scale(1)' }],
    }[kind];
    if (frames && node.animate) node.animate(frames, kind === 'draw' ? { ...timing, easing: 'cubic-bezier(.45, 0, .2, 1)' } : timing);
  }
}

async function playRoute(figure, state) {
  const view = state.view;
  const ids = (figure.dataset.route || '').split(/\s+/).filter(Boolean);
  if (!view?.edges || ids.length < 2) return;
  stopRoute(state);
  const run = { cancelled: false };
  state.run = run;
  state.button.hidden = false;
  state.button.textContent = 'Stop';
  view.dot.setAttribute('opacity', '1');
  for (let i = 0; i < ids.length - 1; i++) {
    const [a, b] = [ids[i], ids[i + 1]];
    const edge = view.edges.find(e => e.from === a && e.to === b) || view.edges.find(e => e.from === b && e.to === a);
    if (!edge) continue;
    const forward = edge.from === a;
    const length = edge.path.getTotalLength();
    state.say.textContent = edge.text;
    await tween(run, Math.min(1500, Math.max(650, length * 4.2)), t => {
      const point = edge.path.getPointAtLength((forward ? easeInOut(t) : 1 - easeInOut(t)) * length);
      view.dot.setAttribute('cx', round(point.x));
      view.dot.setAttribute('cy', round(point.y));
    });
    view.rings.get(b)?.animate?.([{ opacity: 0 }, { opacity: 1, offset: 0.25 }, { opacity: 0 }], { duration: 1100, easing: 'ease-out' });
    await pause(run, 650);
  }
  view.dot.setAttribute('opacity', '0');
  state.say.textContent = figure.dataset.sayEnd || '';
  state.button.textContent = 'Replay';
  state.run = null;
}

function stopRoute(state) {
  if (!state.run) return;
  state.run.cancelled = true;
  cancelAnimationFrame(state.run.raf);
  clearTimeout(state.run.timer);
  state.run = null;
  if (state.view?.dot) state.view.dot.setAttribute('opacity', '0');
  if (state.say) state.say.textContent = '';
  if (state.button) state.button.textContent = 'Replay';
}

// ---- Counters ----

function setupCounters(figure) {
  return [...figure.querySelectorAll('.cc-num')].map(num => {
    const parsed = parseNumber(num.textContent);
    if (!parsed) return null;
    const clone = document.createElement('span');
    clone.className = 'cc-num-anim cc-anim';
    clone.setAttribute('aria-hidden', 'true');
    clone.textContent = num.textContent;
    num.classList.add('cc-sr');
    num.after(clone);
    return { clone, parsed };
  }).filter(Boolean);
}
function finishCounters(counters) {
  for (const counter of counters) {
    counter.done = true;
    counter.clone.textContent = countText(counter.parsed, 1);
  }
}
function playCounters(counters) {
  const start = performance.now();
  const duration = 1300;
  const tick = now => {
    const t = Math.min(1, (now - start) / duration);
    const p = 1 - (1 - t) ** 3;
    for (const counter of counters) if (!counter.done) counter.clone.textContent = countText(counter.parsed, p);
    if (t < 1 && counters.some(counter => !counter.done)) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

// ---- Wiring ----

const CHARTS = { bars: drawBars, columns: drawColumns, line: drawLine, waffle: drawWaffle, scatter: drawScatter, graph: drawGraph };

function addToggle(figure) {
  const data = figure.querySelector(':scope > .cc-data');
  if (!data) return;
  if (!data.id) data.id = `cc-data-${++uid}`;
  const show = data.dataset.toggle || 'Show the numbers';
  const hide = show.replace(/^Show/, 'Hide');
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'cc-toggle mono';
  button.textContent = show;
  button.setAttribute('aria-expanded', 'false');
  button.setAttribute('aria-controls', data.id);
  button.addEventListener('click', () => {
    const open = button.getAttribute('aria-expanded') !== 'true';
    button.setAttribute('aria-expanded', String(open));
    button.textContent = open ? hide : show;
    data.classList.toggle('is-open', open);
  });
  data.before(button);
}

let observer;
const pending = new Map();
// Run before print: counters jump to their written text.
const finishers = [];
function onView(node, callback) {
  if (!('IntersectionObserver' in window)) { callback(); return; }
  observer ??= new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      observer.unobserve(entry.target);
      pending.get(entry.target)?.();
      pending.delete(entry.target);
    }
  }, { threshold: 0.18, rootMargin: '0px 0px -6% 0px' });
  pending.set(node, callback);
  observer.observe(node);
}

function setup(figure, reduced) {
  const type = figure.dataset.chart;
  if (type !== 'counters' && !CHARTS[type]) return;
  figure.classList.add('cc-ready');
  if (!reduced) figure.classList.add('cc-wait');
  addToggle(figure);
  const state = { played: false, width: 0 };
  if (type === 'counters') {
    const counters = setupCounters(figure);
    finishers.push(() => finishCounters(counters));
    onView(figure, () => { figure.classList.remove('cc-wait'); if (!reduced) playCounters(counters); });
    return;
  }
  const canvas = figure.querySelector('.cc-canvas');
  if (!canvas) return;
  const render = {};
  if (type === 'graph' && figure.dataset.route && !reduced) {
    state.say = document.createElement('p');
    state.say.className = 'cc-say';
    state.say.setAttribute('aria-hidden', 'true');
    state.button = document.createElement('button');
    state.button.type = 'button';
    state.button.className = 'cc-replay mono';
    state.button.hidden = true;
    state.button.textContent = 'Replay';
    state.button.addEventListener('click', () => (state.run ? stopRoute(state) : playRoute(figure, state)));
    const bar = document.createElement('div');
    bar.className = 'cc-route-bar';
    bar.append(state.say, state.button);
    canvas.after(bar);
  }
  if (type === 'scatter') setupNoise(figure, state, render);
  const draw = () => {
    const width = Math.floor(canvas.clientWidth);
    if (!width || width === state.width) return;
    state.width = width;
    stopRoute(state);
    canvas.replaceChildren();
    state.view = CHARTS[type](figure, canvas, width, state);
    render.onDraw?.();
  };
  draw();
  if ('ResizeObserver' in window) {
    let frame = 0;
    new ResizeObserver(() => { cancelAnimationFrame(frame); frame = requestAnimationFrame(draw); }).observe(canvas);
  }
  onView(figure, () => {
    figure.classList.remove('cc-wait');
    state.played = true;
    if (reduced || !state.view) return;
    playSteps(state.view);
    if (state.button) {
      state.timer = setTimeout(() => playRoute(figure, state), state.view.end || 0);
      // The travelling dot stops once the diagram leaves the view; Replay restarts it.
      if ('IntersectionObserver' in window) {
        new IntersectionObserver(entries => {
          if (entries.some(entry => !entry.isIntersecting)) {
            clearTimeout(state.timer);
            stopRoute(state);
            state.button.hidden = false;
          }
        }).observe(figure);
      }
    }
  });
}

export function init(root = document) {
  document.documentElement.classList.add('cc-js');
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  for (const figure of root.querySelectorAll('figure[data-chart]')) setup(figure, reduced);
  for (const node of root.querySelectorAll('[data-cc-reveal]')) onView(node, () => node.classList.add('cc-in'));
  // Print the final state, whatever has played so far.
  window.addEventListener('beforeprint', () => {
    for (const figure of root.querySelectorAll('figure[data-chart]')) {
      figure.classList.remove('cc-wait');
      for (const animation of figure.getAnimations?.({ subtree: true }) ?? []) animation.finish();
    }
    for (const node of root.querySelectorAll('[data-cc-reveal]')) node.classList.add('cc-in');
    for (const finish of finishers) finish();
  });
}

if (typeof document !== 'undefined' && typeof window !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => init(), { once: true });
  else init();
}

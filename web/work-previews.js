// Homepage "Open the work" previews. Each .work-preview keeps its fallback until the live
// version is built; same-origin JSON loads a viewport early; text only via textContent.
import { evaluate } from './lab/metrics.js';

export const LAB_JSON = './lab/data/sentiment-eval.json';
export const TRACE_JSON = './trace/build-trace.json';
export const ROLES = ['orchestrator', 'implementation-worker', 'quality-reviewer', 'ui-design-director'];
const MARKS = ['error', 'retried', 'fixed'];
const HIDE = { 'aria-hidden': 'true' };
const SCORES = { precision: 'Precision', recall: 'Recall', f1: 'F1' };
const fix = (value, digits = 3) => value.toFixed(digits);
const clamp = value => Math.min(0.95, Math.max(0.05, Number(value))) || 0.5;
let doc;
let win;
let uid = 0;

// Pure helpers, tested in node.
export const validLab = data => Array.isArray(data?.test) && data.test.length > 0 && data.test.every(({ pA, pB, label }) => typeof pA === 'number' && typeof pB === 'number' && (label === 0 || label === 1));
export const labMetrics = (items, model, threshold) => evaluate(items, model === 'A' ? 'A' : 'B', clamp(threshold), []);
// Valid spans in the build-trace page's order.
export function traceMarks(data) {
  const spans = (Array.isArray(data?.spans) ? data.spans : [])
    .map((span, index) => ({ ...span, index, at: Date.parse(span?.start), until: Date.parse(span?.end) }))
    .filter(span => ROLES.includes(span.role) && (span.status === 'ok' || MARKS.includes(span.status))
      && typeof span.action === 'string' && span.action.trim() && span.at <= span.until)
    .sort((a, b) => a.at - b.at || b.until - a.until || a.index - b.index)
    .map(({ id, role, status, action }) => ({ id, role, status, action: action.trim().replace(/\s+/g, ' ').slice(0, 200) }));
  return { spans, errors: spans.filter(span => span.status === 'error').length };
}

const attr = (node, attrs) => { for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value)); return node; };
function el(tag, className, parent, text) {
  const node = Object.assign(doc.createElement(tag), { className });
  if (text !== undefined) node.textContent = text;
  parent?.append(node);
  return node;
}
const svg = (tag, attrs, parent) => { const node = attr(doc.createElementNS('http://www.w3.org/2000/svg', tag), attrs); parent.append(node); return node; };
// Status marks, about 12 viewBox units wide, in currentColor; ok has none.
const glyph = (status, x, y, parent) => (status === 'retried' ? svg('circle', { class: 'wp-glyph', cx: x, cy: y, r: 5.5 }, parent)
  : MARKS.includes(status) && svg('path', { class: `wp-glyph wp-glyph-${status}`, d: status === 'error' ? `M${x - 6} ${y - 6}l12 12m0-12l-12 12` : `M${x - 6.5} ${y + 0.5}l4.4 4.8 8.6-10.4` }, parent));
const listen = (node, handlers) => { for (const type in handlers) node.addEventListener(type, handlers[type]); };
const reduced = () => Boolean(win.matchMedia?.('(prefers-reduced-motion: reduce)').matches);

const whenVisible = (node, rootMargin, threshold = 0) => new Promise(resolve => {
  if (!win.IntersectionObserver) return resolve();
  const observer = new win.IntersectionObserver(entries => {
    if (entries.some(entry => entry.isIntersecting)) { observer.disconnect(); resolve(); }
  }, { rootMargin, threshold });
  observer.observe(node);
});

// One request per file per window, kept across calls; a failure is not kept.
const caches = new WeakMap();
const load = path => {
  const cache = caches.get(win) || {};
  caches.set(win, cache);
  return (cache[path] ||= win.fetch(new URL(path, import.meta.url), { credentials: 'same-origin' })
    .then(response => (response.ok ? response.json() : Promise.reject(new Error(response.status))))
    .catch(error => { delete cache[path]; throw error; }));
};

// During the build tour, wait until the tour shows this card (its build state leaves
// "pending") or the tour ends; outside the tour, at once.
const TOURING = /\bagentic-(?:touring|running)\b/;
const whenShown = node => new Promise(resolve => {
  const root = doc.documentElement;
  const states = () => { const found = []; for (let n = node; n && n !== root; n = n.parentElement) if (n.dataset?.buildState) found.push(n.dataset.buildState); return found; };
  const ready = () => !TOURING.test(root.className) || (states().length > 0 && !states().includes('pending'));
  if (ready() || !win.MutationObserver) return resolve();
  const observer = new win.MutationObserver(records => {
    if (ready() || records.some(r => r.oldValue === 'pending' && r.attributeName === 'data-build-state' && r.target.contains(node))) { observer.disconnect(); resolve(); }
  });
  observer.observe(root, { attributes: true, attributeFilter: ['class', 'data-build-state'], attributeOldValue: true, subtree: true });
});

// Lab: threshold, model toggle, three scores, 2 x 2 matrix.
function buildLab(data) {
  if (!validLab(data)) throw new Error('lab data');
  const id = `wp${(uid += 1)}`;
  const root = el('div', 'wp-lab');
  const head = el('div', 'wp-lab-head', root);
  el('label', 'wp-label', head, 'Decision threshold').htmlFor = `${id}-t`;
  const output = attr(el('output', 'wp-lab-value', head), { for: `${id}-t`, 'aria-live': 'off' });
  const slider = attr(el('input', 'wp-range', root), { type: 'range', id: `${id}-t`, min: 0.05, max: 0.95, step: 0.01, value: 0.5, 'aria-describedby': `${id}-c` });
  const set = el('fieldset', 'wp-seg', root);
  el('legend', 'wp-sr', set, 'Model');
  for (const [value, text] of [['A', 'A · Naive Bayes'], ['B', 'B · Logistic']]) {
    const radio = attr(el('input', '', set), { type: 'radio', name: `${id}-m`, id: `${id}-${value}`, value });
    radio.checked = value === 'B';
    el('label', '', set, text).htmlFor = radio.id;
  }
  const cells = {};
  const scores = el('dl', 'wp-scores', root);
  for (const [key, text] of Object.entries(SCORES)) {
    const row = el('div', '', scores);
    el('dt', 'wp-label', row, text);
    cells[key] = el('dd', '', row);
  }
  const table = el('table', 'wp-matrix', root);
  const caption = el('caption', 'wp-label', table);
  const rows = [['', 'Predicted pos.', 'Predicted neg.'], ['Actual pos.', 'tp', 'fn'], ['Actual neg.', 'fp', 'tn']];
  rows.forEach(([label, ...keys], r) => {
    const row = el('tr', '', el(r ? 'tbody' : 'thead', '', table));
    if (!r) { el('td', '', row); keys.forEach(text => { el('th', 'wp-label', row, text).scope = 'col'; }); return; }
    el('th', 'wp-label', row, label).scope = 'row';
    for (const key of keys) {
      const cell = el('td', key === 'tp' || key === 'tn' ? 'wp-hit' : 'wp-miss', row);
      cells[key] = el('span', 'wp-count', cell);
      el('span', 'wp-key', cell, key.toUpperCase());
    }
  });
  el('p', 'wp-caption', root, `Live: the lab’s ${data.test.length} test sentences.`).id = `${id}-c`;
  const announce = attr(el('p', 'wp-sr', root), { 'aria-live': 'polite', 'aria-atomic': 'true' });
  let timer = 0;
  const render = speak => {
    const model = set.querySelector(':checked')?.value || 'B';
    const t = fix(clamp(slider.value), 2);
    const r = labMetrics(data.test, model, t);
    output.textContent = t;
    slider.setAttribute('aria-valuetext', t);
    caption.textContent = `Model ${model} confusion matrix at ${t}`;
    for (const key in cells) cells[key].textContent = key in SCORES ? fix(r[key]) : String(r[key]);
    if (!speak) return;
    win.clearTimeout(timer);
    timer = win.setTimeout(() => {
      announce.textContent = `Threshold ${t}, model ${model}: precision ${fix(r.precision, 2)}, recall ${fix(r.recall, 2)}, F1 ${fix(r.f1, 2)}.`;
    }, 450);
  };
  listen(slider, { input: () => render(true) });
  listen(set, { change: () => render(true) });
  render(false);
  return { root };
}

// Trace: a bar per step; hover, drag or arrow keys read one.
function buildTrace(data) {
  const { spans, errors } = traceMarks(data);
  const n = spans.length;
  if (n < 2) throw new Error('trace');
  const step = 510 / (n - 1); // viewBox width 520, padding 5
  const root = el('div', 'wp-trace');
  root.dataset.play = 'wait';
  const scrub = el('div', 'wp-trace-scrub', root);
  const art = svg('svg', { class: 'wp-trace-svg', viewBox: '0 0 520 100', ...HIDE }, scrub);
  const cursor = svg('rect', { class: 'wp-cursor', y: 1, width: step, height: 98, rx: 2 }, art);
  const rows = [-99, -99]; // last mark x on each status row
  spans.forEach((span, i) => {
    const x = Number((5 + i * step).toFixed(2));
    const mark = svg('g', { class: 'wp-mark', 'data-role': span.role, 'data-status': span.status }, art);
    mark.style.setProperty('--i', String(i));
    svg('rect', { class: 'wp-bar', x: x - 3, y: 6, width: 6, height: 50, rx: 1.5 }, mark);
    // A mark goes on the upper row unless it would touch the previous one there.
    const row = x - rows[0] < 14 ? 1 : 0;
    if (glyph(span.status, x, 70 + row * 18, mark)) rows[row] = x;
  });
  const slider = attr(el('input', 'wp-trace-range', scrub), { type: 'range', min: 1, max: n, step: 1, value: 1, 'aria-label': 'Recorded step' });
  const readout = attr(el('p', 'wp-readout', root), HIDE);
  const meta = el('span', 'wp-label', readout);
  const action = el('span', 'wp-action', readout);
  const legend = attr(el('ul', 'wp-legend', root), { 'aria-label': 'Legend' });
  for (const key of [...ROLES, ...MARKS]) {
    const item = el('li', '', legend);
    if (MARKS.includes(key)) glyph(key, 7, 7, svg('svg', { class: 'wp-legend-glyph', viewBox: '0 0 14 14', ...HIDE }, item));
    else attr(el('span', 'wp-chip', item), HIDE).parentNode.dataset.role = key;
    item.append(key);
  }
  el('p', 'wp-caption', root, `${n} recorded steps, ${errors} ended in an error. Hover or drag across the strip to read each step.`);

  const select = (i, move) => {
    const k = Math.min(n - 1, Math.max(0, i));
    const { role, status, action: text } = spans[k];
    cursor.setAttribute('x', (5 + (k - 0.5) * step).toFixed(2));
    meta.textContent = `Step ${k + 1} of ${n} · ${role} · ${status}`;
    action.textContent = text;
    slider.setAttribute('aria-valuetext', `Step ${k + 1} of ${n}, ${role}, ${status}: ${text}`);
    if (move) slider.value = String(k + 1);
  };
  const cursorOn = on => { root.dataset.cursor = on; };
  const current = () => select(Number(slider.value) - 1);
  const fromPointer = event => {
    const box = slider.getBoundingClientRect();
    if (box.width > 0) select(Math.round(((event.clientX - box.left) / box.width) * (n - 1)), true);
    cursorOn(true);
  };
  listen(slider, {
    pointermove: fromPointer, pointerdown: fromPointer, input: current, blur: () => cursorOn(false),
    focus: () => { current(); cursorOn(true); }, pointerleave: () => cursorOn(doc.activeElement === slider),
  });
  current();
  return { root, stage: scrub, play: () => { root.dataset.play = reduced() ? 'static' : 'on'; } };
}

// Loop: one dot goes round once.
const STAGES = [['Trace', 44, 44], ['Classify', 276, 44], ['Fixed test set', 276, 128], ['Gate', 44, 128]];
function buildLoop() {
  const id = `wp${(uid += 1)}`;
  const root = el('figure', 'wp-loop');
  const art = svg('svg', { class: 'wp-loop-svg', viewBox: '0 0 320 172', role: 'img', 'aria-label': 'Trace, classify, fixed test set, gate, and back to trace.' }, root);
  svg('path', { class: 'wp-loop-path', id: `${id}-p`, d: 'M44 44H276V128H44Z' }, art);
  for (const d of ['M156 38l7 6-7 6', 'M270 82l6 7 6-7', 'M164 122l-7 6 7 6', 'M38 94l6-7 6 7']) svg('path', { class: 'wp-loop-arrow', d }, art);
  for (const [name, x, y] of STAGES) {
    svg('circle', { class: 'wp-loop-node', cx: x, cy: y, r: 6 }, art);
    svg('text', { class: 'wp-loop-text', x: x < 160 ? 28 : 292, y: y < 80 ? 24 : 160, 'text-anchor': x < 160 ? 'start' : 'end', 'dominant-baseline': 'middle' }, art).textContent = name;
  }
  const dot = svg('circle', { class: 'wp-loop-dot', r: 5, transform: 'translate(44 44)' }, art);
  el('figcaption', 'wp-caption', root, 'A failure found in a trace becomes a test case, and the fixed test set decides whether a change ships.');
  // SVG text stays near 12.5 px on screen.
  const fit = () => {
    const width = art.getBoundingClientRect().width;
    if (width > 0) art.style.setProperty('--wp-loop-text', `${(4000 / width).toFixed(2)}px`);
  };
  if (win.ResizeObserver) new win.ResizeObserver(fit).observe(art);
  const play = () => {
    if (reduced() || !win.SVGAnimationElement) return;
    dot.removeAttribute('transform');
    const motion = svg('animateMotion', { dur: '4.8s', begin: 'indefinite', fill: 'freeze', calcMode: 'paced' }, dot);
    svg('mpath', { href: `#${id}-p` }, motion);
    motion.beginElement();
  };
  return { root, stage: art, play };
}

const BUILDERS = { lab: [LAB_JSON, buildLab], trace: [TRACE_JSON, buildTrace], loop: [null, buildLoop] };

async function enhance(node, kind) {
  const [path, build] = BUILDERS[kind];
  try {
    const live = build(path ? await load(path) : null);
    node.replaceChildren(live.root);
    node.dataset.previewState = 'live';
    if (live.play) whenShown(node).then(() => whenVisible(live.stage, '0px', 0.9)).then(live.play).catch(() => {});
  } catch {
    node.dataset.previewState = 'fallback';
  }
}

// Resolves once wired; `settled` resolves when every preview is live or kept its fallback.
export async function initWorkPreviews(document, window) {
  const tasks = [];
  try {
    doc = document;
    win = window;
    for (const node of document.querySelectorAll('.work-preview[data-preview]')) {
      const kind = node.getAttribute('data-preview');
      if (!Object.hasOwn(BUILDERS, kind) || node.dataset.previewState) continue;
      node.dataset.previewState = 'pending';
      // During the build tour, build every preview straight away so the Lab stop never waits
      // on one card crossing the margin later than the others.
      const touring = TOURING.test(document.documentElement?.className || '');
      tasks.push((touring ? Promise.resolve() : whenVisible(node, '100% 0px 100% 0px')).then(() => enhance(node, kind)));
    }
  } catch { /* keep every fallback */ }
  return { settled: Promise.all(tasks) };
}

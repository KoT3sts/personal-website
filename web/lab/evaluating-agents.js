// "How I evaluate agents": the interactive figures. Each figure loads when it nears the
// viewport, reads same-origin JSON only (./data/agent-traces.json, ./data/sentiment-eval.json),
// computes its numbers with evaluating-agents-data.js and metrics.js, and writes text only
// through textContent. Without JavaScript, or if a fetch fails, the static data tables
// written into the page stay open and the interactive parts stay hidden.
import { evaluate } from './metrics.js';
import { TRACES_JSON, LAB_JSON, BUCKETS, measures, failures, delegation, matrix, int } from './evaluating-agents-data.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const moving = () => !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const requests = new Map();
const load = url => {
  if (!requests.has(url)) {
    requests.set(url, fetch(url, { credentials: 'same-origin' })
      .then(response => (response.ok ? response.json() : Promise.reject(new Error(`HTTP ${response.status}`)))));
  }
  return requests.get(url);
};
const validTraces = data => Boolean(data && Array.isArray(data.traces) && data.traces.length && data.rollups?.tools
  && data.rollups.latencyByKind?.LLM && Array.isArray(data.evaluators) && Array.isArray(data.evaluations));
const validLab = data => Boolean(data && Array.isArray(data.test) && data.test.length && Array.isArray(data.dataset?.sources));
const traces = () => load(TRACES_JSON).then(data => (validTraces(data) ? data : Promise.reject(new Error('shape'))));

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}
function svg(name, attrs = {}, text) {
  const node = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  if (text != null) node.textContent = text;
  return node;
}
// Polite announcements, debounced so a dragged slider speaks once.
function announcer(node, delay = 450) {
  let timer = 0;
  return text => { clearTimeout(timer); timer = setTimeout(() => { node.textContent = text; }, delay); };
}
function whenVisible(node, run) {
  if (!('IntersectionObserver' in window)) { run(); return; }
  const observer = new IntersectionObserver(entries => {
    if (entries.some(entry => entry.isIntersecting)) { observer.disconnect(); run(); }
  }, { rootMargin: '320px 0px' });
  observer.observe(node);
}
// Show the live figure and fold the static table into its "Data table" disclosure.
function reveal(fig) {
  const live = fig.querySelector('[data-ea-live]');
  if (live) live.hidden = false;
  const data = fig.querySelector('details.ea-data');
  if (data) data.open = false;
  fig.classList.add('is-live');
}
function fill(root, values) {
  for (const node of root.querySelectorAll('[data-ea-m]')) {
    const value = values[node.dataset.eaM];
    if (value != null) node.textContent = typeof value === 'number' ? int(value) : value;
  }
}
const duration = ms => (ms < 1000 ? `${ms} ms` : ms < 60000 ? `${(ms / 1000).toFixed(1)} s` : `${(ms / 60000).toFixed(1)} min`);
const dashboard = id => `./agent-observability.html#${encodeURIComponent(id)}`;
const radioValue = (root, name) => root.querySelector(`input[name="${name}"]:checked`)?.value;
const setWidth = (node, share) => node.style.setProperty('--w', `${Math.max(0, Math.min(100, share * 100)).toFixed(1)}%`);
function bar(className, share) {
  const track = el('span', 'ea-bar-track');
  const fillNode = el('span', `ea-bar-fill ${className || ''}`.trim());
  track.append(fillNode);
  // Grow from zero on the next frame (CSS skips the transition under reduced motion).
  requestAnimationFrame(() => setWidth(fillNode, share));
  return track;
}

// Figure 1: the four measures from the telemetry, and the lab's one number against its slices.
async function initMeasures(fig) {
  const [telemetry, lab] = await Promise.allSettled([traces(), load(LAB_JSON)]);
  if (telemetry.status === 'fulfilled') fill(fig, measures(telemetry.value));
  if (lab.status !== 'fulfilled' || !validLab(lab.value)) return;
  const items = lab.value.test;
  const sources = lab.value.dataset.sources;
  const slider = fig.querySelector('#ea-threshold');
  const output = fig.querySelector('#ea-threshold-value');
  const body = fig.querySelector('[data-ea-split]');
  const verdict = fig.querySelector('[data-ea-verdict]');
  if (!slider || !output || !body || !verdict) return;
  const rows = [['F1, all sentences', r => r.f1, false], ['Accuracy, all sentences', r => r.accuracy, true],
    ...sources.map(source => [`Accuracy, ${source.name}`, r => r.slices[source.id].accuracy, true])];
  const cells = rows.map(([label, , slice]) => {
    const tr = el('tr', slice ? 'ea-slice-row' : '');
    const th = el('th', '', label);
    th.scope = 'row';
    const a = el('td');
    const b = el('td');
    tr.append(th, a, b);
    body.append(tr);
    return { tr, a, b };
  });
  const say = announcer(verdict);
  const lead = (a, b) => (a > b ? 'A' : b > a ? 'B' : '');
  function render(speak) {
    const t = Math.min(0.95, Math.max(0.05, Number(slider.value) || 0.5));
    output.textContent = t.toFixed(2);
    slider.setAttribute('aria-valuetext', t.toFixed(2));
    const split = radioValue(fig, 'ea-view') === 'split';
    const ids = sources.map(source => source.id);
    const result = { A: evaluate(items, 'A', t, ids), B: evaluate(items, 'B', t, ids) };
    rows.forEach(([, pick, slice], i) => {
      const { tr, a, b } = cells[i];
      tr.hidden = slice && !split;
      const va = pick(result.A);
      const vb = pick(result.B);
      a.textContent = va.toFixed(3);
      b.textContent = vb.toFixed(3);
      a.classList.toggle('is-lead', va > vb);
      b.classList.toggle('is-lead', vb > va);
    });
    const top = lead(result.A.f1, result.B.f1);
    let text;
    if (!top) text = 'One number: the two models tie on F1.';
    else if (!split) text = `One number: model ${top} looks better, F1 ${result[top].f1.toFixed(3)}.`;
    else {
      const other = top === 'A' ? 'B' : 'A';
      const flips = sources.filter(source => lead(result.A.slices[source.id].accuracy, result.B.slices[source.id].accuracy) === other);
      text = flips.length ? `Model ${top} leads on F1, but model ${other} is more accurate on ${flips.map(source => source.name).join(' and ')}.`
        : `Model ${top} leads on F1 and is at least as accurate on every slice at this threshold.`;
    }
    if (speak) say(text); else verdict.textContent = text;
  }
  slider.addEventListener('input', () => render(true));
  for (const radio of fig.querySelectorAll('input[name="ea-view"]')) radio.addEventListener('change', () => render(true));
  render(false);
  reveal(fig);
}

// Figure 2: the loop, an illustration. Plays once (under five seconds) when it comes into
// view, unless reduced motion is on; the button replays it.
async function initLoop(fig) {
  const steps = [...fig.querySelectorAll('.ea-flow-steps li')];
  const button = el('button', 'ea-button ea-play', 'Play the loop');
  button.type = 'button';
  fig.querySelector('figcaption')?.before(button);
  let timer = 0;
  const play = () => {
    clearInterval(timer);
    let i = 0;
    fig.classList.add('is-playing');
    const tick = () => {
      steps.forEach((step, j) => step.classList.toggle('is-active', j === i));
      i += 1;
      if (i > steps.length) { clearInterval(timer); fig.classList.remove('is-playing'); }
    };
    tick();
    timer = setInterval(tick, 900);
  };
  button.addEventListener('click', play);
  if (moving()) play();
  const data = await traces();
  fill(fig, { ...measures(data), traces: data.traces.length, spans: data.meta?.spans, evaluators: data.evaluators.length });
}

// Figure 3: failed tool calls by tool or by duration bucket; a bar lists its spans.
async function initFailures(fig) {
  const data = await traces();
  const f = failures(data);
  const list = fig.querySelector('[data-ea-bars]');
  const status = fig.querySelector('[data-ea-status]');
  const examples = fig.querySelector('[data-ea-examples]');
  const more = fig.querySelector('[data-ea-more]');
  if (!list || !status || !examples || !more) return;
  const say = announcer(status, 250);
  const TOP = 7;
  const SHOW = 6;
  const views = {
    tool() {
      const top = f.tools.slice(0, TOP).map(tool => ({ name: tool.name, value: tool.errors, note: `of ${int(tool.n)} calls`,
        spans: f.spans.filter(span => span.name === tool.name) }));
      const rest = f.tools.slice(TOP);
      if (rest.length) {
        const names = new Set(rest.map(tool => tool.name));
        top.push({ name: `Other tools (${rest.length})`, value: rest.reduce((a, tool) => a + tool.errors, 0),
          note: `of ${int(rest.reduce((a, tool) => a + tool.n, 0))} calls`, spans: f.spans.filter(span => names.has(span.name)) });
      }
      return top;
    },
    bucket: () => f.buckets.map(bucket => ({ name: bucket.label, value: bucket.count, note: bucket.note,
      spans: f.spans.filter(span => span.bucket === bucket.id), bucket: true })),
  };
  let current = null;
  let all = false;
  let buttons = [];
  function show(item, speak) {
    const shown = all ? item.spans : item.spans.slice(0, SHOW);
    examples.replaceChildren(...shown.map(span => {
      const li = el('li', 'ea-example');
      const head = el('p', 'ea-example-head');
      head.append(el('span', 'mono ea-kind', span.kind), el('strong', '', span.name));
      const label = BUCKETS.find(([id]) => id === span.bucket)?.[1] || '';
      const meta = el('p', 'ea-example-meta', `${span.agent} · ${duration(span.ms)} · ${label} · trace ${span.trace} (${span.where})`);
      const link = el('a', 'lab-link ea-open', 'Open in the dashboard');
      link.href = dashboard(span.trace);
      link.append(el('span', 'visually-hidden', ` (trace ${span.trace}, ${span.name})`));
      li.append(head, meta, link);
      return li;
    }));
    more.hidden = all || item.spans.length <= SHOW;
    more.textContent = `Show all ${item.spans.length}`;
    const count = item.bucket ? `${item.value} published failed spans` : `${item.value} failed calls, ${item.spans.length} published as single spans`;
    const text = item.spans.length ? `${item.name}: ${count}. Showing ${shown.length}.`
      : `${item.name}: ${item.value} failed calls, none published as a single span; they are counted inside merged steps.`;
    if (speak) say(text); else status.textContent = text;
  }
  function select(item, button, speak) {
    current = item;
    all = false;
    for (const node of buttons) node.setAttribute('aria-pressed', String(node === button));
    show(item, speak);
  }
  function draw(view, speak) {
    const items = views[view]();
    const max = Math.max(1, ...items.map(item => item.value));
    buttons = [];
    list.replaceChildren(...items.map(item => {
      const li = el('li');
      const button = el('button', 'ea-bar');
      button.type = 'button';
      button.setAttribute('aria-pressed', 'false');
      const value = el('span', 'ea-bar-value');
      value.append(el('strong', '', String(item.value)), el('span', 'ea-bar-note', ` ${item.note}`));
      button.append(el('span', 'ea-bar-name', item.name), bar('', item.value / max), value);
      button.addEventListener('click', () => select(item, button, true));
      buttons.push(button);
      li.append(button);
      return li;
    }));
    select(items[0], buttons[0], speak);
  }
  more.addEventListener('click', () => { all = true; show(current, true); });
  for (const radio of fig.querySelectorAll('input[name="ea-group"]')) radio.addEventListener('change', () => draw(radioValue(fig, 'ea-group'), true));
  draw('tool', false);
  reveal(fig);
}

// Figure 4: traces x code evaluators. The slider and buttons pick a trace; pointing at a
// column does the same. The grid is decorative; the result list below carries the text.
async function initEvaluators(fig) {
  const data = await traces();
  const m = matrix(data);
  const grid = fig.querySelector('[data-ea-matrix]');
  const range = fig.querySelector('#ea-trace');
  const status = fig.querySelector('[data-ea-status]');
  const results = fig.querySelector('[data-ea-results]');
  if (!grid || !range || !status || !results) return;
  const say = announcer(status);
  const columns = m.traces.map(() => []);
  grid.style.setProperty('--n', String(m.traces.length));
  for (const row of m.rows) {
    const scores = row.numeric ? m.traces.map(trace => m.cell(trace.id, row.id)?.score).filter(Number.isFinite).sort((a, b) => a - b) : [];
    const quartile = score => 1 + Math.min(3, Math.floor((scores.indexOf(score) / scores.length) * 4));
    const wrap = el('div', 'ea-mrow');
    const head = el('p', 'ea-mrow-head');
    head.append(el('span', 'ea-mrow-name', row.name),
      el('span', 'mono ea-mrow-count', row.numeric ? `median ${row.median}` : `${row.pass} pass · ${row.fail} fail`));
    const cells = el('div', 'ea-mcells');
    m.traces.forEach((trace, i) => {
      const result = m.cell(trace.id, row.id);
      const kind = !result ? 'none' : row.numeric ? `q${quartile(result.score)}` : result.label === 'pass' ? 'pass' : 'fail';
      const cell = el('span', `ea-cell is-${kind}`);
      cell.dataset.i = String(i);
      columns[i].push(cell);
      cells.append(cell);
    });
    wrap.append(head, cells);
    grid.append(wrap);
  }
  range.max = String(m.traces.length - 1);
  let current = -1;
  function select(i, speak) {
    if (i === current || i < 0 || i >= m.traces.length) return;
    columns[current]?.forEach(cell => cell.classList.remove('is-on'));
    columns[i].forEach(cell => cell.classList.add('is-on'));
    current = i;
    range.value = String(i);
    const trace = m.traces[i];
    range.setAttribute('aria-valuetext', `Trace ${trace.id}, ${trace.where}`);
    let pass = 0, failed = 0, none = 0;
    results.replaceChildren(...m.rows.map(row => {
      const result = m.cell(trace.id, row.id);
      const kind = !result ? 'none' : row.numeric ? 'number' : result.label;
      if (kind === 'pass') pass += 1; else if (kind === 'fail') failed += 1; else if (kind === 'none') none += 1;
      const item = el('div', 'ea-result');
      const dd = el('dd');
      const badge = el('span', `mono ea-badge is-${kind}`, kind === 'number' ? String(result.score) : kind === 'none' ? 'not scored' : kind);
      dd.append(badge, el('span', 'ea-result-why', result ? ` ${result.explanation}` : ' The check does not apply to this trace.'),
        el('span', 'ea-result-what', row.description));
      item.append(el('dt', '', row.name), dd);
      return item;
    }));
    const text = `Trace ${trace.id} (${trace.where}): ${pass} pass, ${failed} fail, ${none} not scored.`;
    if (speak) say(text); else status.textContent = text;
  }
  range.addEventListener('input', () => select(Number(range.value), true));
  for (const button of fig.querySelectorAll('[data-ea-step]')) {
    button.addEventListener('click', () => select(Math.min(m.traces.length - 1, Math.max(0, current + Number(button.dataset.eaStep))), true));
  }
  const pointed = event => { const i = event.target?.dataset?.i; if (i != null) select(Number(i), false); };
  grid.addEventListener('pointerover', pointed);
  grid.addEventListener('click', pointed);
  select(0, false);
  reveal(fig);
}

// Figure 5: each trace with tool calls, by size (log scale) against a per-call measure.
// The pointer reads the nearest dot; the slider (and Previous / Next) reads the dots from
// fewest to most calls, for keyboards and screen readers; "Show the numbers" lists them.
const X_TITLE = 'Tool calls in the trace (log scale)';
const byCalls = points => [...points].sort((a, b) => a.calls - b.calls || a.id.localeCompare(b.id));
const pointText = p => `${p.id} (${p.where}) · ${int(p.calls)} calls, ${p.errors} failed (${p.rate.toFixed(1)}%) · ${int(p.perCall)} tokens per call · ${p.delegated ? 'delegated' : 'no delegation'}`;
async function initDelegation(fig) {
  const data = await traces();
  const { points, groups } = delegation(data);
  const plot = fig.querySelector('[data-ea-plot]');
  const tip = fig.querySelector('[data-ea-tip]');
  const pairs = fig.querySelector('[data-ea-pairs]');
  const range = fig.querySelector('#ea-point');
  const rows = fig.querySelector('[data-ea-points]');
  if (!plot || !tip || !pairs || !range || !rows || !points.length) return;
  const order = byCalls(points);
  rows.replaceChildren(...order.map(p => {
    const tr = el('tr');
    const th = el('th', '', `${p.id} (${p.where})`);
    th.scope = 'row';
    tr.append(th, ...[int(p.calls), String(p.errors), p.rate.toFixed(1), int(p.perCall), p.delegated ? 'Yes' : 'No'].map(text => el('td', '', text)));
    return tr;
  }));
  range.max = String(order.length - 1);
  const nice = v => { const p = 10 ** Math.floor(Math.log10(v || 1)); return [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].map(k => k * p).find(k => k >= v); };
  const text = {
    rate: { axis: 'Failed calls, %', pair: 'Share of calls that failed, whole group', group: g => Number(g.rate) },
    perCall: { axis: 'Generated tokens per call', pair: 'Median generated tokens per call', group: g => g.perCall },
  };
  let metric = 'rate';
  let placed = [];
  let hot = null;
  function draw() {
    const w = Math.round(plot.clientWidth);
    if (!w) return;
    const h = w < 480 ? 230 : 270;
    const pad = { l: 48, r: 14, t: 26, b: 40 };
    // At least one decade, so log10(xmax) is never 0 (a lone 1-call trace would divide by it).
    const xmax = Math.max(10, 10 ** Math.ceil(Math.log10(Math.max(...points.map(p => p.calls)))));
    const ymax = nice(Math.max(...points.map(p => p[metric])));
    const x = calls => pad.l + (Math.log10(calls) / Math.log10(xmax)) * (w - pad.l - pad.r);
    const y = v => h - pad.b - (v / ymax) * (h - pad.t - pad.b);
    const root = svg('svg', { width: w, height: h, viewBox: `0 0 ${w} ${h}`, class: 'ea-plot-svg', focusable: 'false' });
    const axes = svg('g', { class: 'ea-axes' });
    for (const v of [0, ymax / 2, ymax]) {
      axes.append(svg('line', { x1: pad.l, x2: w - pad.r, y1: y(v), y2: y(v) }), svg('text', { x: pad.l - 8, y: y(v), 'text-anchor': 'end', 'dominant-baseline': 'middle' }, int(v)));
    }
    for (let c = 1; c <= xmax; c *= 10) axes.append(svg('text', { x: x(c), y: h - pad.b + 18, 'text-anchor': 'middle' }, int(c)));
    axes.append(svg('text', { x: pad.l, y: 12, class: 'ea-axis-title' }, text[metric].axis),
      svg('text', { x: w - pad.r, y: h - 4, 'text-anchor': 'end', class: 'ea-axis-title' }, X_TITLE));
    root.append(axes);
    placed = [...points].sort((a, b) => a.delegated - b.delegated).map(point => {
      const dot = svg('circle', { cx: x(point.calls).toFixed(1), cy: y(point[metric]).toFixed(1), r: 5, class: point.delegated ? 'is-yes' : 'is-no' });
      root.append(dot);
      return { point, dot, px: x(point.calls), py: y(point[metric]) };
    });
    plot.querySelector('svg')?.remove();
    plot.prepend(root);
    tip.hidden = true;
    hot = null;
    if (document.activeElement === range) fromRange();
  }
  // Pointer moves are read once a frame (one measure, then writes), and the tip is only
  // rewritten when the nearest point changes.
  let at = null;
  function point(event) {
    const first = !at;
    at = [event.clientX, event.clientY];
    if (first) requestAnimationFrame(nearest);
  }
  function nearest() {
    if (!at) return;
    const box = plot.getBoundingClientRect();
    const px = at[0] - box.left;
    const py = at[1] - box.top;
    at = null;
    let best = null;
    let distance = 24;
    for (const item of placed) {
      const d = Math.hypot(item.px - px, item.py - py);
      if (d < distance) { distance = d; best = item; }
    }
    if (best === hot) return;
    light(best, box);
  }
  function light(best, box) {
    hot?.dot.classList.remove('is-hot');
    hot = best;
    if (!best) { tip.hidden = true; return; }
    best.dot.classList.add('is-hot');
    tip.textContent = pointText(best.point);
    tip.hidden = false;
    const half = Math.min(box.width / 2, 130);
    tip.style.setProperty('--x', `${Math.max(half, Math.min(box.width - half, best.px)).toFixed(0)}px`);
    tip.style.setProperty('--y', `${best.py.toFixed(0)}px`);
    tip.classList.toggle('is-below', best.py < 90);
  }
  function drawPairs() {
    const values = groups.map(g => text[metric].group(g));
    const max = Math.max(...values, 1);
    pairs.replaceChildren(el('p', 'mono ea-pairs-title', text[metric].pair), ...groups.map((g, i) => {
      const row = el('p', 'ea-pair');
      row.append(el('span', 'ea-pair-name', g.delegated ? 'Delegated' : 'No delegation'), bar(g.delegated ? 'is-yes' : 'is-no', values[i] / max),
        el('strong', 'ea-pair-value', metric === 'rate' ? `${g.rate}%` : int(g.perCall)));
      return row;
    }));
  }
  function fromRange() {
    const p = order[Math.min(order.length - 1, Math.max(0, Number(range.value) || 0))];
    range.setAttribute('aria-valuetext', pointText(p));
    const item = placed.find(entry => entry.point === p);
    if (item && item !== hot) light(item, plot.getBoundingClientRect());
  }
  range.addEventListener('input', fromRange);
  range.addEventListener('focus', fromRange);
  range.addEventListener('blur', () => { hot?.dot.classList.remove('is-hot'); hot = null; tip.hidden = true; });
  // The buttons keep focus, so the slider's valuetext and the tip (in the hidden plot)
  // go unheard: a polite live region says the trace they moved to.
  const status = fig.querySelector('[data-ea-point-status]');
  for (const button of fig.querySelectorAll('[data-ea-point-step]')) {
    button.addEventListener('click', () => {
      range.value = String(Math.min(order.length - 1, Math.max(0, Number(range.value) + Number(button.dataset.eaPointStep))));
      fromRange();
      if (status) status.textContent = pointText(order[Number(range.value)]);
    });
  }
  range.setAttribute('aria-valuetext', pointText(order[0]));
  plot.addEventListener('pointermove', point);
  plot.addEventListener('pointerdown', point);
  plot.addEventListener('pointerleave', () => { at = null; hot?.dot.classList.remove('is-hot'); hot = null; tip.hidden = true; });
  for (const radio of fig.querySelectorAll('input[name="ea-metric"]')) {
    radio.addEventListener('change', () => { metric = radioValue(fig, 'ea-metric') === 'perCall' ? 'perCall' : 'rate'; draw(); drawPairs(); });
  }
  reveal(fig);
  draw();
  drawPairs();
  let width = plot.clientWidth;
  const redraw = () => { if (plot.clientWidth !== width) { width = plot.clientWidth; draw(); } };
  if ('ResizeObserver' in window) new ResizeObserver(redraw).observe(plot); else window.addEventListener('resize', redraw);
}

// The checklist: tick items, see the ring fill. Nothing is saved.
function initChecklist() {
  const list = document.querySelector('.ea-checklist');
  const box = document.querySelector('[data-ea-progress]');
  if (!list || !box) return;
  const count = box.querySelector('[data-ea-count]');
  const state = box.querySelector('[data-ea-state]');
  const reset = box.querySelector('[data-ea-reset]');
  const inputs = [...list.children].map((li, i) => {
    const input = el('input');
    input.type = 'checkbox';
    input.id = `ea-check-${i + 1}`;
    const label = el('label');
    label.htmlFor = input.id;
    label.append(...li.childNodes);
    li.append(input, label);
    return input;
  });
  const say = announcer(state, 200);
  function update(speak) {
    const done = inputs.filter(input => input.checked).length;
    const total = inputs.length;
    box.style.setProperty('--p', String(Math.round((done / total) * 100)));
    box.classList.toggle('is-done', done === total);
    count.textContent = `${done} of ${total}`;
    const text = done === total ? 'Done: every item is true.' : `Not done: ${total - done} still false.`;
    if (speak) say(text);
  }
  list.addEventListener('change', () => update(true));
  reset?.addEventListener('click', () => { inputs.forEach(input => { input.checked = false; }); update(true); });
  list.classList.add('is-live');
  box.hidden = false;
  update(false);
}

const figures = { measures: initMeasures, loop: initLoop, failures: initFailures, evaluators: initEvaluators, delegation: initDelegation };
for (const fig of document.querySelectorAll('[data-ea-fig]')) {
  const run = figures[fig.dataset.eaFig];
  if (run) whenVisible(fig, () => { run(fig).catch(() => { /* keep the static tables */ }); });
}
initChecklist();

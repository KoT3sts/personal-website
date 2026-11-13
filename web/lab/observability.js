// Agent observability: the trace explorer. Same-origin JSON in; DOM out only through
// createElement, textContent and CSSOM custom properties. obs-review.js (gate, review) and
// obs-views.js (analysis views) load later, on demand.
import * as D from './obs-data.js';
import { initCharts } from './obs-charts.js';

const KIND_WORD = { AGENT: 'Agent', LLM: 'LLM step', TOOL: 'Tool call', CHAIN: 'Merged steps' };

const { el, q, setVar } = D;
const reduced = () => Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);

export function spanName(row) {
  if (row.merged) return `${row.merged.tool} × ${D.formatInt(row.merged.count)}`;
  const s = row.span;
  if (s.kind === 'LLM') return `${s.model || 'model'} · ${s.toolCalls || 0} ${s.toolCalls === 1 ? 'call' : 'calls'}`;
  if (s.kind === 'CHAIN') return `${D.formatInt(s.steps)} steps merged`;
  if (s.kind === 'TOOL' && s.category) return `${s.name} · ${s.category}`;
  return s.name;
}

// Span details: the same rows for every kind of span ('–' where one does not apply), so
// hovering never changes the side column's height.
export const SPAN_ROWS = ['Kind', 'Name', 'Category', 'Agent', 'Model', 'Status', 'Error class', 'Starts at', 'Duration', 'Tool calls', 'Steps', 'Failed', 'Input', 'Output', 'Reasoning', 'Cache read', 'Cache write'];
// A span's error class: the class of a failed call, or a merged run's classes with counts.
const classWords = s => (s.kind === 'CHAIN' ? Object.entries(s.errorClasses || {}).map(([c, n]) => `${c} ${n}`).join(', ') : s.errorClass) || '–';
export function spanFacts(row) {
  const s = row?.span;
  if (!s) return SPAN_ROWS.map(() => '–');
  const m = row.merged;
  const n = D.formatInt; // '–' for a missing number
  const failed = m ? m.errors : s.kind === 'CHAIN' ? D.sum(Object.values(s.errors || {})) : undefined;
  const calls = m ? m.count : s.kind === 'LLM' ? s.toolCalls : s.kind === 'CHAIN' ? D.sum(Object.values(s.tools || {})) : undefined;
  const ms = D.formatMs(D.duration(s));
  return [
    m ? 'Merged tool calls' : KIND_WORD[s.kind] || s.kind,
    m ? m.tool : s.kind === 'LLM' ? 'Model step' : s.kind === 'CHAIN' ? 'Steps merged for size' : s.name,
    (!m && s.category) || '–', s.agent || '–', (!m && s.model) || '–',
    m ? '–' : s.status === 'error' ? 'Error' : 'OK',
    m ? '–' : classWords(s),
    m ? '–' : `+${D.formatMs(s.start)}`,
    m ? 'Not published' : s.kind === 'LLM' ? `${ms} (est.)` : ms,
    n(calls), n(m ? undefined : s.steps), n(failed),
    ...D.TOKEN_KEYS.map(key => n(m ? undefined : s.tokens?.[key])),
  ].map(value => (value === undefined || value === null || value === '' ? '–' : String(value)));
}

// Calls fn once the input has been quiet for ms; now() runs it at once instead.
export function quiet(fn, ms) {
  let timer = 0;
  const now = () => { clearTimeout(timer); timer = 0; fn(); };
  return { later: () => { clearTimeout(timer); timer = setTimeout(now, ms); }, now };
}

// KPI count-up, once
function countUp(root) {
  const nodes = [...root.querySelectorAll('[data-count]')];
  if (reduced() || !window.IntersectionObserver) return;
  const finals = nodes.map(node => node.textContent);
  const tick = (t0, now) => {
    const k = Math.min(1, (now - t0) / 1100);
    nodes.forEach((node, i) => {
      const v = Number(node.dataset.count) * (1 - 2 ** (-10 * k));
      const digits = Number(node.dataset.digits || 0);
      node.textContent = k >= 1 ? finals[i] : `${digits ? v.toFixed(digits) : D.formatInt(v)}${node.dataset.suffix || ''}`;
    });
    if (k < 1) requestAnimationFrame(next => tick(t0, next));
  };
  const io = new IntersectionObserver(entries => {
    if (entries.some(entry => entry.isIntersecting)) { io.disconnect(); requestAnimationFrame(now => tick(now, now)); }
  });
  io.observe(root);
}

// app
export function start(data) {
  const index = D.evalIndex(data.evaluations);
  const allRows = new Map(data.traces.map(t => [t.id, D.traceRow(t, index)]));
  const byId = new Map(data.traces.map(t => [t.id, t]));
  const state = {
    filters: { ...D.EMPTY_FILTERS }, sort: { key: 'n', dir: 'asc' }, shown: data.traces,
    selected: null, toggled: new Set(), focus: null, hover: null, rows: [],
  };
  const form = q('filters');
  const tbody = q('rows');
  const tree = q('tree');
  const ordered = () => D.sortRows(state.shown.map(t => allRows.get(t.id)), state.sort.key, state.sort.dir);
  const charts = initCharts({ data, index, byId, open: id => select(id, { scroll: true, remember: true }), setDay });
  let review = null;
  let views = null;
  let cesarLabels = null;
  // Opens a trace from anywhere on the page, clearing filters that would hide it.
  function openTrace(id, scroll = true) {
    if (!byId.has(id)) return;
    if (!state.shown.some(t => t.id === id)) { form.reset(); readForm(); update(); }
    select(id, { scroll, focus: scroll, remember: true });
  }

  // The lazy modules load once (a failed import may retry) and catch up with the page.
  const once = load => { let p = null; return () => (p ||= load().catch(() => { p = null; return null; })); };
  const loadReview = once(() => import('./obs-review.js').then(({ initGate, initReview }) => {
    const gate = initGate({ data, open: openTrace, onScore: () => review?.rescored() });
    review = initReview({ data, open: openTrace, selected: () => state.selected, onLabels: renderRows, scoring: gate.scoring, order: () => ordered().map(r => r.id) });
    if (cesarLabels) review.setCesar(cesarLabels);
    renderRows(); // stored labels show in the list
    return review;
  }));
  const loadViews = once(() => import('./obs-views.js').then(({ initViews }) => {
    views = initViews({ data, open: openTrace, setFilter });
    views.sync(state.filters, state.shown.length);
    views.trace(byId.get(state.selected));
    return views;
  }));
  let ready = false;
  const loadAll = () => Promise.all([loadReview(), loadViews()]).then(([r, v]) => { ready = Boolean(r && v); });

  // One session pill per session in the data, after "All".
  const pills = q('session-pills');
  for (const s of D.sessionsOf(data.traces)) {
    const input = el('input', '', pills);
    Object.assign(input, { type: 'radio', name: 'session', id: `obs-session-${s.toLowerCase()}`, value: s });
    el('label', '', pills, s).htmlFor = input.id;
  }

  const list = q('tool-list');
  Object.keys(data.rollups.tools).sort().forEach(name => { el('option', '', list).value = name; });

  // filters
  function readForm() {
    const f = new FormData(form);
    state.filters = {
      day: f.get('day') || 'all', agent: f.get('agent') || 'all', session: f.get('session') || 'all', errorClass: f.get('errorClass') || 'all',
      delegation: f.has('delegation'), failed: f.has('failed'), tool: String(f.get('tool') || ''),
    };
  }
  // The sessions table and the failure bars set the same form controls the pills do.
  function setFilter(name, value) {
    const control = name === 'errorClass' ? form.elements.errorClass : form.querySelector(`input[name="${name}"][value="${value}"]`);
    if (!control) return;
    if (control.tagName === 'SELECT') control.value = value; else control.checked = true;
    readForm();
    update();
  }
  function setDay(day) {
    const input = form.querySelector(`input[name="day"][value="${state.filters.day === day ? 'all' : day}"]`);
    if (input) { input.checked = true; readForm(); update(); }
  }
  // The tool search redraws after a 150 ms pause; Enter, empty, change and reset at once.
  const apply = quiet(() => { readForm(); update(); }, 150);
  form.addEventListener('submit', event => { event.preventDefault(); apply.now(); });
  form.addEventListener('change', apply.now);
  form.addEventListener('input', event => { if (event.target.name === 'tool') (event.target.value ? apply.later : apply.now)(); });
  form.addEventListener('reset', () => setTimeout(apply.now));
  q('reset-empty').addEventListener('click', () => form.reset());

  // trace list
  const markRows = D.sortable([...document.querySelectorAll('[data-sort]')], 'sort', () => state.sort,
    next => { state.sort = next; renderRows(); }, key => (key === 'n' ? 'asc' : 'desc'));

  function renderRows() {
    markRows(state.sort);
    const rows = ordered();
    tbody.replaceChildren();
    for (const row of rows) {
      const tr = el('tr', '', tbody);
      tr.dataset.id = row.id;
      const th = el('th', 'obs-trace-cell', tr);
      th.scope = 'row';
      const button = el('button', 'obs-open', th);
      button.type = 'button';
      button.dataset.open = row.id;
      el('span', 'obs-open-id', button, `#${row.n}`);
      el('span', 'obs-open-topic', button, row.topic);
      const mine = review?.labelOf(row.id);
      el('span', 'obs-open-meta', button, `${D.dayLabel(row.day)} · ${row.session} · ${row.agent}${mine ? ` · you: ${mine}` : ''}`);
      el('td', '', tr, D.formatMs(row.duration));
      el('td', '', tr, D.formatInt(row.spans));
      el('td', '', tr, D.formatInt(row.llmSteps));
      el('td', '', tr, D.formatInt(row.toolCalls));
      el('td', row.errors ? 'is-err' : '', tr, D.formatInt(row.errors));
      el('td', '', tr, D.formatTokens(row.tokens));
      el('td', '', tr, D.formatInt(row.subagents));
      const checks = el('td', 'obs-checks', tr);
      el('span', 'obs-pass-count', checks, `${row.passed}/${row.checks}`);
      row.fails.forEach(id => el('span', 'obs-chip', checks, D.FAIL_WORDS[id] || id));
    }
    markSelected();
  }
  tbody.addEventListener('click', event => {
    const tr = event.target.closest('tr[data-id]');
    if (!tr) return;
    const viaButton = Boolean(event.target.closest('button'));
    select(tr.dataset.id, { scroll: true, focus: viaButton, remember: true });
  });
  function markSelected() {
    tbody.querySelectorAll('tr').forEach(tr => {
      const on = tr.dataset.id === state.selected;
      tr.classList.toggle('is-selected', on);
      const button = tr.querySelector('button');
      if (on) button.setAttribute('aria-current', 'true');
      else button.removeAttribute('aria-current');
    });
  }

  // trace detail
  function select(id, { scroll = false, focus = false, remember = false } = {}) {
    if (!byId.has(id)) return;
    if (state.selected !== id) { state.toggled = new Set(); state.focus = null; }
    state.selected = id;
    if (remember && window.history?.replaceState) window.history.replaceState(null, '', `#${id}`);
    renderDetail();
    markSelected();
    charts.highlight(id);
    views?.trace(byId.get(id));
    review?.select();
    if (scroll) {
      const title = q('detail-title');
      title.scrollIntoView({ block: 'start', behavior: reduced() ? 'auto' : 'smooth' });
      if (focus) title.focus({ preventScroll: true });
    }
  }

  function renderDetail() {
    const detail = q('detail');
    const trace = byId.get(state.selected);
    detail.hidden = !trace;
    if (!trace) return;
    const row = allRows.get(trace.id);
    q('detail-title').textContent = `Trace #${row.n} · ${D.dayLabel(trace.day)} · ${row.topic}`;
    q('detail-sub').textContent = `Session ${trace.session}, root agent ${trace.rootAgent}. ${D.formatInt(trace.spans.length)} published spans; the bars are placed on the trace’s own clock, from the request to the last span.`;
    const facts = q('facts');
    facts.replaceChildren();
    [['Duration', D.formatMs(row.duration)], ['LLM steps', row.llmSteps], ['Tool calls', row.toolCalls], ['Errors', row.errors],
      ['Subagent runs', row.subagents], ['Commits', row.commits], ['Tokens', D.formatTokens(row.tokens)]].forEach(([label, value]) => {
      const div = el('div', '', facts);
      el('dt', 'mono', div, label);
      el('dd', '', div, typeof value === 'number' ? D.formatInt(value) : value);
    });
    renderAxis(trace);
    renderTree();
    renderTraceEvals(trace);
  }

  function renderAxis(trace) {
    const axis = q('axis');
    axis.replaceChildren();
    el('span', 'obs-axis-spacer', axis);
    const track = el('span', 'obs-axis-track', axis);
    const end = trace.end - trace.start;
    for (const t of D.ticks(end, 4)) {
      const tick = el('span', 'obs-tick', track, t === 0 ? '0' : D.formatTick(t));
      setVar(tick, '--x', t / Math.max(1, end));
    }
  }

  function renderTree() {
    const trace = byId.get(state.selected);
    state.rows = D.waterfall(trace, state.toggled);
    if (!state.rows.some(r => r.id === state.focus)) state.focus = state.rows[0]?.id || null;
    // The failure-analysis filter marks the spans that hold its error class.
    const cls = state.filters.errorClass && state.filters.errorClass !== 'all' ? state.filters.errorClass : null;
    const matches = cls ? trace.spans.filter(span => D.spanClassCount(span, cls)) : [];
    const calls = D.sum(matches.map(span => D.spanClassCount(span, cls)));
    q('wf-match').textContent = cls
      ? `Marked: ${matches.length} ${matches.length === 1 ? 'span holds' : 'spans hold'} ${calls} ${cls.replace('_', ' ')} ${calls === 1 ? 'failure' : 'failures'}${matches.some(span => span.kind === 'CHAIN') ? ' (counts inside merged steps included)' : ''}.`
      : '';
    tree.replaceChildren();
    for (const row of state.rows) {
      const s = row.span;
      const kind = row.merged ? 'MERGED' : s.kind;
      const error = row.merged ? row.merged.errors > 0 : s.status === 'error' || (s.kind === 'CHAIN' && Object.keys(s.errors || {}).length > 0);
      const match = cls && !row.merged && D.spanClassCount(s, cls) > 0;
      const li = el('li', `obs-row is-${kind.toLowerCase()}${error ? ' has-error' : ''}${match ? ' is-match' : ''}`, tree);
      li.setAttribute('role', 'treeitem');
      li.setAttribute('aria-level', String(row.depth + 1));
      li.setAttribute('aria-setsize', String(row.size));
      li.setAttribute('aria-posinset', String(row.pos));
      li.dataset.id = row.id;
      li.tabIndex = row.id === state.focus ? 0 : -1;
      li.setAttribute('aria-selected', String(row.id === state.focus));
      if (row.expandable) li.setAttribute('aria-expanded', String(row.open));
      setVar(li, '--depth', row.depth);
      setVar(li, '--x', row.x.toFixed(5));
      setVar(li, '--w', row.w.toFixed(5));
      const label = el('span', 'obs-row-label', li);
      const caret = el('span', row.expandable ? 'obs-caret' : 'obs-caret is-leaf', label);
      caret.setAttribute('aria-hidden', 'true');
      if (row.expandable) caret.dataset.toggle = row.id;
      el('span', 'obs-kind', label, row.merged ? 'TOOLS' : s.kind);
      el('span', 'obs-name', label, spanName(row));
      if (error) el('span', 'obs-err', label, 'error').setAttribute('aria-hidden', 'true');
      const track = el('span', 'obs-row-track', li);
      track.setAttribute('aria-hidden', 'true');
      el('span', 'obs-bar', track);
      const dur = row.merged ? 'untimed' : D.formatMs(D.duration(s));
      el('span', 'obs-row-dur', li, dur).setAttribute('aria-hidden', 'true');
      const what = row.merged ? `${row.merged.tool}, ${row.merged.count} merged calls${row.merged.errors ? `, ${row.merged.errors} failed` : ''}` : `${KIND_WORD[s.kind]}, ${spanName(row)}, ${dur}${error ? ', error' : ''}`;
      li.setAttribute('aria-label', `${what}, ${s.agent}${match ? `, ${cls.replace('_', ' ')}` : ''}`);
    }
    inspect(state.rows.find(r => r.id === state.focus));
  }

  function focusRow(id) {
    state.focus = id;
    tree.querySelectorAll('[role="treeitem"]').forEach(li => {
      const on = li.dataset.id === id;
      li.tabIndex = on ? 0 : -1;
      li.setAttribute('aria-selected', String(on));
      if (on) li.focus();
    });
    inspect(state.rows.find(r => r.id === id));
  }
  function toggle(id, open) {
    const row = state.rows.find(r => r.id === id);
    if (!row?.expandable || (open !== undefined && row.open === open)) return;
    if (state.toggled.has(id)) state.toggled.delete(id); else state.toggled.add(id);
    state.focus = id;
    renderTree();
    tree.querySelector(`[data-id="${id}"]`)?.focus();
  }
  function setAll(open) {
    const trace = byId.get(state.selected);
    // collapsing keeps the root open
    state.toggled = new Set(trace.spans.filter(s => (open ? !D.openByDefault(s) : D.openByDefault(s) && s.parent)).map(s => s.id));
    renderTree();
  }
  q('expand-all').addEventListener('click', () => setAll(true));
  q('collapse-all').addEventListener('click', () => setAll(false));

  tree.addEventListener('click', event => {
    const li = event.target.closest('[role="treeitem"]');
    if (!li) return;
    if (event.target.closest('[data-toggle]')) toggle(li.dataset.id);
    else focusRow(li.dataset.id);
  });
  tree.addEventListener('dblclick', event => {
    const li = event.target.closest('[role="treeitem"]');
    if (li) toggle(li.dataset.id);
  });
  tree.addEventListener('keydown', event => {
    const i = state.rows.findIndex(r => r.id === state.focus);
    const row = state.rows[i];
    if (!row) return;
    const go = j => { const next = state.rows[Math.max(0, Math.min(state.rows.length - 1, j))]; if (next) focusRow(next.id); };
    const keys = {
      ArrowDown: () => go(i + 1), ArrowUp: () => go(i - 1), Home: () => go(0), End: () => go(state.rows.length - 1),
      ArrowRight: () => (row.expandable && !row.open ? toggle(row.id, true) : row.expandable ? go(i + 1) : null),
      ArrowLeft: () => (row.expandable && row.open ? toggle(row.id, false) : row.parent ? focusRow(row.parent) : null),
      Enter: () => toggle(row.id), ' ': () => toggle(row.id),
    };
    if (keys[event.key]) { event.preventDefault(); keys[event.key](); }
  });
  // Hover shows a span, leaving shows the focused one again: at most once a frame.
  let hovering = 0;
  const hoverLater = () => {
    hovering ||= requestAnimationFrame(() => { hovering = 0; inspect(state.rows.find(r => r.id === (state.hover ?? state.focus))); });
  };
  tree.addEventListener('pointerover', event => {
    const li = event.target.closest('[role="treeitem"]');
    if (li && li.dataset.id !== state.hover) { state.hover = li.dataset.id; hoverLater(); }
  });
  tree.addEventListener('pointerleave', () => { state.hover = null; hoverLater(); });

  // The rows are built once and only rewritten where a value changes.
  const dl = q('span');
  const facts = SPAN_ROWS.map(label => {
    const div = el('div', '', dl);
    el('dt', 'mono', div, label);
    return el('dd', '', div, '–');
  });
  function inspect(row) {
    spanFacts(row).forEach((value, i) => {
      if (facts[i].textContent !== value) { facts[i].textContent = value; facts[i].title = value; }
    });
  }
  function renderTraceEvals(trace) {
    const ul = q('trace-evals');
    ul.replaceChildren();
    const evals = index.get(trace.id) || new Map();
    const skipped = [];
    for (const e of data.evaluators) {
      const ev = evals.get(e.id);
      if (!ev) { skipped.push(e.name); continue; }
      const verdict = ev.label === 'pass' || ev.label === 'fail' ? ev.label : 'score';
      const li = el('li', `obs-teval is-${verdict}`, ul);
      const head = el('p', 'obs-teval-head', li);
      el('span', 'obs-verdict', head, verdict !== 'score' ? verdict : e.output === 'category' ? String(ev.label).replace('_', ' ') : D.formatScore(e.id, ev.score));
      el('span', 'obs-teval-name', head, e.name);
      el('p', 'obs-teval-why', li, ev.explanation);
    }
    if (skipped.length) el('li', 'obs-teval-skip', ul, `Not scored here: ${skipped.join(', ')} (the check does not apply).`);
  }

  // one update for every filter change
  function update() {
    state.shown = D.filterTraces(data.traces, index, state.filters);
    const n = state.shown.length;
    q('count').textContent = `${n} of ${data.traces.length} traces`;
    q('reset').disabled = !D.isFiltered(state.filters);
    q('empty').hidden = n > 0;
    tbody.closest('.obs-scroll').hidden = n === 0;
    renderRows();
    if (!state.shown.some(t => t.id === state.selected)) {
      if (n) select(ordered()[0].id);
      else { state.selected = null; renderDetail(); }
    }
    charts.update(state.shown, state.filters, state.selected);
    views?.sync(state.filters, n);
    if (state.selected) renderTree();
  }

  // #t12 opens that trace; the hash is only compared, never written into the page.
  const openHash = () => {
    const id = D.hashTrace(window.location.hash, byId);
    if (!id) return;
    if (!state.shown.some(t => t.id === id)) { form.reset(); readForm(); update(); }
    select(id, { scroll: true });
  };
  readForm(); // the browser may have restored the form on a reload
  update();
  openHash();
  window.addEventListener('hashchange', openHash);
  // Annotate sits above the lazy sections: its first press loads review.
  q('annotate-toggle').addEventListener('click', () => { if (!review) loadReview().then(r => r?.annotate(true)); });
  // Each module loads when its first section comes near, or when idle. A jump link loads
  // and builds everything first, so its target does not move.
  D.whenNear(q('gate-block'), loadReview);
  D.whenNear(q('graph-block'), loadViews);
  const idle = window.requestIdleCallback || (fn => setTimeout(fn, 1200));
  idle(() => loadAll().then(D.buildAll), { timeout: 3000 });
  const jump = hash => {
    const target = document.getElementById(hash.slice(1));
    if (!target) return;
    if (window.location.hash !== hash) window.location.hash = hash; // the browser scrolls and moves focus
    else target.scrollIntoView({ block: 'start' });
  };
  document.querySelector('.obs-toc')?.addEventListener('click', event => {
    const a = event.target.closest('a[href^="#"]');
    if (!a) return;
    if (ready) { D.buildAll(); return; }
    event.preventDefault();
    loadAll().then(() => { D.buildAll(); jump(a.getAttribute('href')); });
  });
  if (/^#obs-[a-z-]+$/.test(window.location.hash)) {
    const hash = window.location.hash;
    loadAll().then(() => { D.buildAll(); document.getElementById(hash.slice(1))?.scrollIntoView({ block: 'start' }); });
  }
  return {
    state, select, update, loadAll,
    get review() { return review; },
    setCesar(json) { cesarLabels = json; review?.setCesar(json); },
  };
}

async function boot() {
  countUp(document.querySelector('.obs-kpis'));
  const status = q('status');
  status.textContent = 'Loading the traces…';
  try {
    const response = await window.fetch(D.DATA_URL, { credentials: 'same-origin' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    if (!Array.isArray(data?.traces) || !data.traces.length) throw new Error('empty');
    document.querySelector('[data-obs-live]').hidden = false;
    const app = start(data);
    status.textContent = '';
    // Cesar's own labels, if the file has any; the page works the same without them.
    window.fetch(D.LABELS_URL, { credentials: 'same-origin' }).then(r => (r.ok ? r.json() : null)).then(json => { if (json) app.setCesar(json); }).catch(() => {});
  } catch {
    status.textContent = 'The traces could not be loaded. The numbers above and the evaluator notes below still hold; the raw file is agent-traces.json, linked at the top.';
  }
}

if (typeof document !== 'undefined' && document.querySelector('[data-obs="tree"]')) boot();

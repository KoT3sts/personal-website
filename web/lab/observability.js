// Agent observability: the trace explorer. Same-origin JSON in; DOM out only through
// createElement, textContent and CSSOM custom properties.
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
  const charts = initCharts({ data, index, byId, open: id => select(id, { scroll: true, remember: true }), setDay });

  const list = q('tool-list');
  Object.keys(data.rollups.tools).sort().forEach(name => { el('option', '', list).value = name; });

  // filters
  function readForm() {
    const f = new FormData(form);
    state.filters = { day: f.get('day') || 'all', agent: f.get('agent') || 'all', delegation: f.has('delegation'), failed: f.has('failed'), tool: String(f.get('tool') || '') };
  }
  function setDay(day) {
    const input = form.querySelector(`input[name="day"][value="${state.filters.day === day ? 'all' : day}"]`);
    if (input) { input.checked = true; readForm(); update(); }
  }
  form.addEventListener('submit', event => event.preventDefault());
  form.addEventListener('change', () => { readForm(); update(); });
  form.addEventListener('input', event => { if (event.target.name === 'tool') { readForm(); update(); } });
  form.addEventListener('reset', () => setTimeout(() => { readForm(); update(); }));
  q('reset-empty').addEventListener('click', () => form.reset());

  // trace list
  const markRows = D.sortable([...document.querySelectorAll('[data-sort]')], 'sort', () => state.sort,
    next => { state.sort = next; renderRows(); }, key => (key === 'n' ? 'asc' : 'desc'));

  function renderRows() {
    markRows(state.sort);
    const rows = D.sortRows(state.shown.map(t => allRows.get(t.id)), state.sort.key, state.sort.dir);
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
      el('span', 'obs-open-meta', button, `${D.dayLabel(row.day)} · ${row.agent}`);
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
    q('detail-sub').textContent = `Root agent ${trace.rootAgent}. ${D.formatInt(trace.spans.length)} published spans; the bars are placed on the trace’s own clock, from the request to the last span.`;
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
    tree.replaceChildren();
    for (const row of state.rows) {
      const s = row.span;
      const kind = row.merged ? 'MERGED' : s.kind;
      const error = row.merged ? row.merged.errors > 0 : s.status === 'error' || (s.kind === 'CHAIN' && Object.keys(s.errors || {}).length > 0);
      const li = el('li', `obs-row is-${kind.toLowerCase()}${error ? ' has-error' : ''}`, tree);
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
      li.setAttribute('aria-label', `${what}, ${s.agent}`);
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
  tree.addEventListener('pointerover', event => {
    const li = event.target.closest('[role="treeitem"]');
    if (li && li.dataset.id !== state.hover) { state.hover = li.dataset.id; inspect(state.rows.find(r => r.id === li.dataset.id)); }
  });
  tree.addEventListener('pointerleave', () => { state.hover = null; inspect(state.rows.find(r => r.id === state.focus)); });

  function inspect(row) {
    const dl = q('span');
    dl.replaceChildren();
    if (!row) return;
    const s = row.span;
    const item = (label, value) => { if (value === undefined || value === null || value === '') return; const div = el('div', '', dl); el('dt', 'mono', div, label); el('dd', '', div, value); };
    if (row.merged) {
      item('Kind', 'Tool calls inside merged steps');
      item('Tool', row.merged.tool);
      item('Agent', s.agent);
      item('Calls', D.formatInt(row.merged.count));
      item('Failed', D.formatInt(row.merged.errors));
      item('Timing', 'Not published for merged calls');
      return;
    }
    item('Kind', KIND_WORD[s.kind]);
    item(s.kind === 'TOOL' ? 'Tool' : 'Name', s.kind === 'LLM' ? 'Model step' : s.kind === 'CHAIN' ? 'Steps merged for size' : s.name);
    if (s.category) item('Category', s.category);
    item('Agent', s.agent);
    item('Model', s.model);
    item('Status', s.status === 'error' ? 'Error' : 'OK');
    item('Starts at', `+${D.formatMs(s.start)}`);
    item(s.kind === 'LLM' ? 'Latency (est.)' : 'Duration', D.formatMs(D.duration(s)));
    if (s.kind === 'LLM') item('Tool calls', D.formatInt(s.toolCalls));
    if (s.kind === 'CHAIN') {
      item('Steps', D.formatInt(s.steps));
      item('Tool calls', D.formatInt(D.sum(Object.values(s.tools || {}))));
      const errors = D.sum(Object.values(s.errors || {}));
      if (errors) item('Failed', D.formatInt(errors));
    }
    const words = { input: 'Input', output: 'Output', reasoning: 'Reasoning', cacheRead: 'Cache read', cacheWrite: 'Cache write' };
    if (s.tokens) D.TOKEN_KEYS.forEach(key => item(words[key], D.formatInt(s.tokens[key])));
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
      el('span', 'obs-verdict', head, verdict === 'score' ? D.formatInt(ev.score) : verdict);
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
      if (n) select(D.sortRows(state.shown.map(t => allRows.get(t.id)), state.sort.key, state.sort.dir)[0].id);
      else { state.selected = null; renderDetail(); }
    }
    charts.update(state.shown, state.filters, state.selected);
  }

  // #t12 opens that trace; the hash is only compared, never written into the page.
  const openHash = () => {
    const id = D.hashTrace(window.location.hash, byId);
    if (!id) return;
    if (!state.shown.some(t => t.id === id)) { form.reset(); readForm(); update(); }
    select(id, { scroll: true });
  };
  update();
  openHash();
  window.addEventListener('hashchange', openHash);
  return { state, select, update };
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
    start(data);
    status.textContent = '';
  } catch {
    status.textContent = 'The traces could not be loaded. The numbers above and the evaluator notes below still hold; the raw file is agent-traces.json, linked at the top.';
  }
}

if (typeof document !== 'undefined' && document.querySelector('[data-obs="tree"]')) boot();

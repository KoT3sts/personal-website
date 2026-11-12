// Agent observability: agent graph, failure analysis, pass rate by day, sessions, compare.
// Each view builds when it first scrolls near; DOM via textContent, SVG attributes, CSSOM.
import * as D from './obs-data.js';
import * as E from './obs-eval.js';

const { el, q, setVar, svg } = D;
const pct = v => (v === null ? '–' : `${Math.round(v * 100)}%`);
const ratio = (pass, n) => (n ? `${pass}/${n}` : '–');
const runs = n => `${D.formatInt(n)} ${n === 1 ? 'run' : 'runs'}`;
// "Show the numbers": one fold holding one or more tables.
function numbers(parent, tables) {
  const details = el('details', 'obs-numbers', parent);
  el('summary', '', details, 'Show the numbers');
  for (const { caption, head, rows, id } of tables) {
    const scroll = el('div', 'obs-scroll obs-scroll-mid', details);
    scroll.setAttribute('role', 'region');
    scroll.setAttribute('aria-labelledby', id);
    scroll.tabIndex = 0;
    const table = el('table', 'obs-table obs-plain', scroll);
    const cap = el('caption', 'obs-num-cap', table, caption);
    cap.id = id;
    const tr = el('tr', '', el('thead', '', table));
    head.forEach(text => { el('th', '', tr, text).scope = 'col'; });
    const body = el('tbody', '', table);
    for (const row of rows) {
      const r = el('tr', '', body);
      row.forEach((text, i) => { const c = el(i ? 'td' : 'th', '', r, text); if (!i) c.scope = 'row'; });
    }
  }
  return details;
}

export function initViews({ data, setFilter, open }) {
  const checks = E.passFail(data.evaluators);
  const view = { filters: D.EMPTY_FILTERS, n: data.traces.length, trace: null };
  const built = {};

  // ---- agent graph
  const graph = {};
  // Narrow drawings pull the subagent column left so its labels fit.
  const columns = box => (box.clientWidth < 560 ? { left: 0.07, right: 0.44 } : { left: 0.1, right: 0.5 });
  function place() {
    const box = q('graph');
    const cols = columns(box);
    if (graph.cols && graph.cols.right === cols.right) return;
    graph.cols = cols;
    const layout = E.graphLayout(data.rollups.agentGraph, cols);
    for (const { n, b } of graph.nodes) setVar(b, '--x', layout.nodes.find(x => x.agent === n.agent).x);
    for (const { e, path } of graph.edges) path.setAttribute('d', E.edgePath(layout.edges.find(x => x.from === e.from && x.to === e.to)));
  }
  function buildGraph() {
    const layout = E.graphLayout(data.rollups.agentGraph);
    const box = q('graph');
    const draw = svg('svg', { viewBox: '0 0 100 100', preserveAspectRatio: 'none', 'aria-hidden': 'true', focusable: 'false' }, box);
    graph.edges = layout.edges.map(e => {
      const path = svg('path', { d: E.edgePath(e), 'stroke-width': e.width.toFixed(2), 'vector-effect': 'non-scaling-stroke', class: 'obs-gedge' }, draw);
      return { e, path };
    });
    graph.nodes = layout.nodes.map((n, i) => {
      const b = el('button', `obs-gnode${n.root ? ' is-root' : ''}`, box);
      b.type = 'button';
      b.tabIndex = i === 0 ? 0 : -1;
      b.dataset.agent = n.agent;
      b.dataset.bucket = String(n.bucket);
      setVar(b, '--x', n.x);
      setVar(b, '--y', n.y.toFixed(4));
      setVar(b, '--r', `${n.r.toFixed(1)}px`);
      el('span', 'obs-gnode-dot', b).setAttribute('aria-hidden', 'true');
      el('span', 'obs-gnode-label', b, n.agent);
      const by = n.startedBy.map(e => `${e.from} ${e.count}×`).join(', ');
      const starts = n.starts.map(e => `${e.to} ${e.count}×`).join(', ');
      n.words = `${n.agent}: ${runs(n.runs)}, ${D.formatInt(n.toolCalls)} tool calls, ${n.rate === null ? 'no tool calls' : `${D.formatPct(n.rate)} failed`}${by ? `; started by ${by}` : ''}${starts ? `; started ${starts}` : ''}.`;
      b.setAttribute('aria-label', n.words);
      return { n, b };
    });
    const readout = q('graph-readout');
    const hot = agent => {
      const node = graph.nodes.find(x => x.n.agent === agent);
      readout.textContent = node ? node.n.words : 'Choose an agent to read it; open a trace above to see its path.';
      box.classList.toggle('has-hot', Boolean(node));
      graph.nodes.forEach(x => x.b.classList.toggle('is-hot', x.n.agent === agent));
      graph.edges.forEach(x => x.path.classList.toggle('is-hot', x.e.from === agent || x.e.to === agent));
    };
    box.addEventListener('focusin', event => { const b = event.target.closest('.obs-gnode'); if (b) hot(b.dataset.agent); });
    box.addEventListener('focusout', () => hot(null));
    box.addEventListener('pointerover', event => { const b = event.target.closest('.obs-gnode'); if (b) hot(b.dataset.agent); });
    box.addEventListener('pointerleave', () => hot(box.contains(document.activeElement) ? document.activeElement.dataset.agent : null));
    box.addEventListener('keydown', event => {
      const list = graph.nodes.map(x => x.b);
      const i = list.indexOf(event.target);
      const step = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1, Home: -1e3, End: 1e3 }[event.key];
      if (i < 0 || !step) return;
      event.preventDefault();
      const next = list[Math.max(0, Math.min(list.length - 1, i + step))];
      list.forEach(b => { b.tabIndex = b === next ? 0 : -1; });
      next.focus();
    });
    hot(null);
    place();
    document.getElementById('obs-graph-path')?.addEventListener('change', graphTrace);
    let frame = 0;
    window.addEventListener('resize', () => { frame ||= requestAnimationFrame(() => { frame = 0; place(); }); });
    const nodeRows = layout.nodes.map(n => [n.agent, D.formatInt(n.runs), D.formatInt(n.toolCalls), D.formatInt(n.toolErrors), n.rate === null ? '–' : D.formatPct(n.rate)]);
    numbers(q('graph-numbers'), [
      { caption: 'Agents: runs, tool calls and failed calls', head: ['Agent', 'Runs', 'Tool calls', 'Failed', 'Error rate'], rows: nodeRows, id: 'obs-graph-nodes-cap' },
      { caption: 'Who started whom: subagent runs per pair', head: ['Started by', 'Subagent', 'Runs'], rows: layout.edges.map(e => [e.from, e.to, D.formatInt(e.count)]), id: 'obs-graph-edges-cap' },
    ]);
    graphTrace();
  }
  // The open trace's agents and handoffs light up; the rest dims.
  function graphTrace() {
    if (!built.graph) return;
    const t = document.getElementById('obs-graph-path')?.checked === false ? null : view.trace;
    const path = new Set(t?.agentPath || []);
    const edges = new Map((t?.agentEdges || []).map(e => [`${e.from}>${e.to}`, e.count]));
    q('graph').classList.toggle('has-path', Boolean(t));
    graph.nodes.forEach(({ n, b }) => b.classList.toggle('is-path', path.has(n.agent)));
    graph.edges.forEach(({ e, path: p }) => p.classList.toggle('is-path', edges.has(`${e.from}>${e.to}`)));
    const words = (t?.agentEdges || []).map(e => `${e.from} started ${e.to} ${e.count}×`);
    q('graph-trace').textContent = t
      ? `Trace #${Number(t.id.slice(1))}: ${words.length ? `${words.join(', ')}.` : `${t.rootAgent} only, no subagent runs.`}`
      : 'Showing every agent across all traces.';
  }

  // ---- failure analysis
  function buildFailures() {
    const list = q('fail-list');
    const stats = E.errorClassStats(data.traces, data.meta.errorClasses).sort((a, b) => b.calls - a.calls || data.meta.errorClasses.indexOf(a.cls) - data.meta.errorClasses.indexOf(b.cls));
    const max = Math.max(1, ...stats.map(s => s.calls));
    for (const s of stats) {
      const li = el('li', '', list);
      const b = el('button', 'obs-fail', li);
      b.type = 'button';
      b.dataset.cls = s.cls;
      b.disabled = s.calls === 0;
      el('span', 'mono obs-fail-name', b, s.cls.replace('_', ' '));
      const track = el('span', 'obs-stack', b);
      track.setAttribute('aria-hidden', 'true');
      setVar(el('span', 'obs-seg-fail', track), '--w', (s.calls / max).toFixed(4));
      el('span', 'obs-bar-value', b, s.calls ? `${D.formatInt(s.calls)} calls · ${s.traces} ${s.traces === 1 ? 'trace' : 'traces'}` : 'none');
      el('span', 'obs-fail-desc', b, D.ERROR_CLASS_WORDS[s.cls] || '');
      b.addEventListener('click', () => setFilter('errorClass', view.filters.errorClass === s.cls ? 'all' : s.cls));
    }
    syncFailures();
  }
  function syncFailures() {
    if (!built.failures) return;
    q('fail-list').querySelectorAll('button[data-cls]').forEach(b => b.setAttribute('aria-pressed', String(view.filters.errorClass === b.dataset.cls)));
    const cls = view.filters.errorClass;
    q('fail-note').textContent = cls && cls !== 'all'
      ? `The trace list shows ${listWords('errorClass')} with a ${cls.replace('_', ' ')} failure; open one and its matching spans are marked in the waterfall.`
      : 'Choose a class to filter the trace list to the traces that hit it.';
  }
  const listWords = own => `${view.n} ${view.n === 1 ? 'trace' : 'traces'}${D.isFiltered({ ...view.filters, [own]: 'all' }) ? ' (other filters apply too)' : ''}`;

  // ---- pass rate by day
  function buildMonitor() {
    const box = q('monitor');
    const days = E.daysOf(data.traces);
    const series = checks.map(e => ({ e, rows: E.passRateByDay(data.traces, data.evaluations, e.id, days) }));
    const maxN = Math.max(1, ...series.flatMap(s => s.rows.map(r => r.n)));
    for (const { e, rows } of series) {
      const fig = el('section', 'obs-mon', box);
      const pass = D.sum(rows.map(r => r.pass));
      const n = D.sum(rows.map(r => r.n));
      const head = el('h3', 'obs-mon-title', fig, e.name);
      el('span', 'mono obs-mon-all', head, ` ${pct(n ? pass / n : null)} of ${n}`);
      const plot = el('div', 'obs-mon-plot', fig);
      plot.setAttribute('aria-hidden', 'true');
      ['100%', '50%', '0%'].forEach((t, i) => setVar(el('span', 'obs-mon-tick', plot, t), '--y', i / 2));
      const area = el('div', 'obs-mon-area', plot);
      const draw = svg('svg', { viewBox: '0 0 600 100', preserveAspectRatio: 'none', focusable: 'false' }, area);
      const x = i => ((i + 0.5) / rows.length) * 600;
      let run = [];
      const flush = () => { if (run.length > 1) svg('polyline', { points: run.join(' '), 'vector-effect': 'non-scaling-stroke', class: 'obs-mon-line' }, draw); run = []; };
      rows.forEach((r, i) => {
        if (r.rate === null) { flush(); return; }
        run.push(`${x(i).toFixed(1)},${(100 - r.rate * 100).toFixed(2)}`);
        const dot = el('span', 'obs-mon-dot', area);
        setVar(dot, '--x', ((i + 0.5) / rows.length).toFixed(4));
        setVar(dot, '--y', (1 - r.rate).toFixed(4));
        setVar(dot, '--s', `${(6 + 8 * Math.sqrt(r.n / maxN)).toFixed(1)}px`);
      });
      flush();
      const axis = el('div', 'obs-mon-days', fig);
      axis.setAttribute('aria-hidden', 'true');
      setVar(axis, '--n', rows.length);
      rows.forEach(r => {
        const cell = el('span', r.n ? '' : 'is-gap', axis);
        el('span', 'obs-mon-n', cell, r.n ? `n ${r.n}` : 'n 0');
        el('span', 'obs-mon-day', cell, D.dayLabel(r.day).replace('Nov ', ''));
      });
    }
    numbers(q('monitor-block'), [{
      caption: 'Pass rate per check and day: passed / scored', head: ['Check', ...days.map(D.dayLabel)], id: 'obs-monitor-cap',
      rows: series.map(({ e, rows }) => [e.name, ...rows.map(r => (r.n ? `${pct(r.rate)} (${r.pass}/${r.n})` : 'not scored'))]),
    }]);
  }

  // ---- sessions
  const KEY_CHECKS = ['recovered_after_error', 'review_before_commit', 'tests_run_before_commit', 'verified_after_last_edit', 'latency_budget'];
  function buildSessions() {
    const tbody = q('sessions');
    for (const [id, s] of Object.entries(data.rollups.sessions)) {
      const tr = el('tr', '', tbody);
      tr.dataset.session = id;
      const th = el('th', '', tr);
      th.scope = 'row';
      const b = el('button', 'obs-session', th);
      b.type = 'button';
      b.dataset.session = id;
      el('span', 'obs-session-id', b, id);
      el('span', 'obs-session-days', b, E.dayRange(s.days));
      b.addEventListener('click', () => setFilter('session', view.filters.session === id ? 'all' : id));
      [s.traces, s.toolCalls, s.toolErrors, s.subagentRuns].forEach((v, i) => el('td', i === 2 && v ? 'is-err' : '', tr, D.formatInt(v)));
      for (const c of KEY_CHECKS) {
        const r = s.checks[c];
        const td = el('td', 'obs-rate', tr);
        if (!r) { el('span', 'obs-rate-na', td, '–'); td.title = 'Not scored in this session'; continue; }
        const bar = el('span', 'obs-mini obs-mini-pass', td);
        bar.setAttribute('aria-hidden', 'true');
        setVar(bar, '--w', r.rate.toFixed(4));
        el('span', '', td, ratio(r.pass, r.scored));
      }
    }
    syncSessions();
  }
  function syncSessions() {
    if (!built.sessions) return;
    q('sessions').querySelectorAll('tr[data-session]').forEach(tr => {
      const on = view.filters.session === tr.dataset.session;
      tr.classList.toggle('is-selected', on);
      const b = tr.querySelector('button');
      b.setAttribute('aria-pressed', String(on));
      b.setAttribute('aria-label', `Session ${tr.dataset.session}, ${b.lastChild.textContent}: ${on ? 'show all sessions' : 'show only its traces'}`);
    });
    const id = view.filters.session;
    q('sessions-note').textContent = id && id !== 'all'
      ? `The trace list shows ${listWords('session')} from session ${id}.`
      : 'Choose a session to filter the trace list to it.';
  }

  // ---- compare
  const groups = E.compareGroups(data.traces);
  function buildCompare() {
    const a = q('cmp-a');
    const b = q('cmp-b');
    for (const select of [a, b]) for (const g of groups) { const o = el('option', '', select, g.label); o.value = g.id; }
    const presets = E.comparePresets(groups);
    a.value = presets.days?.a || 'all';
    b.value = presets.days?.b || 'all';
    q('compare-block').querySelectorAll('button[data-cmp]').forEach(btn => {
      const preset = presets[btn.dataset.cmp];
      btn.hidden = !preset;
      if (!preset) return;
      btn.textContent = preset.label;
      btn.addEventListener('click', () => { a.value = preset.a; b.value = preset.b; compare(); });
    });
    a.addEventListener('change', compare);
    b.addEventListener('change', compare);
    compare();
  }
  function compare() {
    const [ga, gb] = [q('cmp-a').value, q('cmp-b').value].map(id => groups.find(g => g.id === id));
    const ra = E.groupRates(data.evaluators, data.evaluations, ga.ids);
    const rb = E.groupRates(data.evaluators, data.evaluations, gb.ids);
    q('cmp-head-a').textContent = `A · ${ga.label}`;
    q('cmp-head-b').textContent = `B · ${gb.label}`;
    const tbody = q('compare');
    tbody.replaceChildren();
    ra.forEach((x, i) => {
      const y = rb[i];
      const tr = el('tr', '', tbody);
      el('th', '', tr, x.name).scope = 'row';
      for (const r of [x, y]) el('td', r.n && r.n < 5 ? 'is-dim' : '', tr, r.n ? `${pct(r.rate)} (${r.pass}/${r.n})` : 'not scored');
      const both = x.n && y.n;
      const delta = both ? Math.round((y.rate - x.rate) * 100) : null;
      el('td', 'obs-delta', tr, delta === null ? '–' : delta === 0 ? '0' : `${delta > 0 ? '+' : '−'}${Math.abs(delta)} pts`);
      const td = el('td', 'obs-dumbbell-cell', tr);
      const track = el('span', 'obs-dumbbell', td);
      track.setAttribute('aria-hidden', 'true');
      if (both) {
        const line = el('span', 'obs-dumbbell-line', track);
        setVar(line, '--l', Math.min(x.rate, y.rate).toFixed(4));
        setVar(line, '--w', Math.abs(x.rate - y.rate).toFixed(4));
      }
      for (const [r, cls] of [[x, 'is-a'], [y, 'is-b']]) if (r.n) setVar(el('span', `obs-dumbbell-dot ${cls}`, track), '--x', r.rate.toFixed(4));
    });
    q('cmp-caption').textContent = `${ga.label}: ${ga.ids.size} traces. ${gb.label}: ${gb.ids.size} traces. B − A is in percentage points; dimmed rates rest on fewer than five runs.`;
  }

  // lazy building
  const lazy = (name, block, build) => D.whenNear(q(block), () => { built[name] = true; build(); });
  lazy('graph', 'graph-block', buildGraph);
  lazy('failures', 'fail-block', buildFailures);
  lazy('monitor', 'monitor-block', buildMonitor);
  lazy('sessions', 'sessions-block', buildSessions);
  lazy('compare', 'compare-block', buildCompare);

  return {
    sync(filters, n) { view.filters = filters; view.n = n; syncFailures(); syncSessions(); },
    trace(trace) { view.trace = trace || null; graphTrace(); },
  };
}

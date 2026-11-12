// Agent observability charts, drawn as HTML sized through CSSOM custom properties,
// first when they scroll near the viewport, then on every filter change.
import * as D from './obs-data.js';

const { el, q, setVar } = D;

export function initCharts({ data, index, open, setDay }) {
  const view = { shown: data.traces, filters: D.EMPTY_FILTERS, selected: null, kind: 'LLM', log: true, cache: true, tsort: { key: 'calls', dir: 'desc' }, ready: false };
  const block = q('charts');

  // controls
  document.querySelectorAll('input[name="hist-kind"]').forEach(input => input.addEventListener('change', () => { view.kind = input.value; hist(); }));
  document.getElementById('obs-hist-log').addEventListener('change', event => { view.log = event.target.checked; hist(); });
  document.getElementById('obs-cache').addEventListener('change', event => { view.cache = event.target.checked; q('cache-key').hidden = !view.cache; tokens(); });
  const markTools = D.sortable([...document.querySelectorAll('[data-tsort]')], 'tsort', () => view.tsort,
    next => { view.tsort = next; tools(); }, key => (key === 'tool' ? 'asc' : 'desc'));

  // latency histogram
  function hist() {
    const box = q('hist');
    const axis = q('hist-axis');
    const readout = q('hist-readout');
    box.replaceChildren();
    axis.replaceChildren();
    readout.textContent = '';
    const values = D.durationsOf(view.shown, view.kind);
    const h = D.histogram(values, { bins: 28, log: view.log });
    const max = Math.max(1, ...h.bins.map(b => b.count));
    const bars = el('div', 'obs-hist-bars', box);
    for (const bin of h.bins) {
      const bar = el('span', 'obs-hist-bar', bars);
      setVar(bar, '--h', (bin.count / max).toFixed(4));
      bar.dataset.label = `${D.formatInt(bin.count)} ${bin.count === 1 ? 'span' : 'spans'} from ${D.formatMs(bin.x0)} to ${D.formatMs(bin.x1)}`;
    }
    // The readout names the bar under the pointer and empties again when it leaves.
    bars.addEventListener('pointerover', event => { const label = event.target.dataset?.label; if (label && readout.textContent !== label) readout.textContent = label; });
    bars.addEventListener('pointerleave', () => { readout.textContent = ''; });
    const p50 = D.percentile(values, 50);
    const p90 = D.percentile(values, 90);
    for (const [name, v] of [['p50', p50], ['p90', p90]]) {
      if (v === null) continue;
      const x = h.at(v);
      const mark = el('span', `obs-mark obs-mark-${name}${x > (name === 'p50' ? 0.25 : 0.6) ? ' is-flip' : ''}`, box);
      setVar(mark, '--x', x.toFixed(4));
      el('span', 'obs-mark-label', mark, `${name} ${D.formatMs(v)}`);
    }
    const tickValues = !values.length ? [] : view.log
      ? Array.from({ length: h.hi - h.lo + 1 }, (_, i) => 10 ** (h.lo + i))
      : [0, h.hi / 2, h.hi];
    tickValues.forEach((t, i) => {
      const tick = el('span', i % 2 && tickValues.length > 5 ? 'obs-tick is-minor' : 'obs-tick', axis, D.formatTick(t));
      setVar(tick, '--x', h.at(t).toFixed(4));
    });
    const all = data.rollups.latencyByKind[view.kind];
    const word = { LLM: 'LLM steps', TOOL: 'tool calls', AGENT: 'agent runs' }[view.kind];
    q('hist-caption').textContent = values.length
      ? `${D.formatInt(values.length)} ${word} published one by one in these traces: p50 ${D.formatMs(p50)}, p90 ${D.formatMs(p90)}. Across all ${D.formatInt(all.n)} recorded ${word}: p50 ${D.formatMs(all.p50)}, p90 ${D.formatMs(all.p90)}. The published ones lean long, because the first, last, delegating and committing steps are the ones kept whole.${view.kind === 'LLM' ? ' LLM latency is estimated.' : ''}`
      : `No ${word} published in these traces.`;
  }

  // tools
  function tools() {
    const tbody = q('tools');
    tbody.replaceChildren();
    const exact = !D.isFiltered(view.filters);
    const rows = D.toolStats(view.shown, exact ? data.rollups.tools : null);
    const { key, dir } = view.tsort;
    const sign = dir === 'asc' ? 1 : -1;
    const val = r => (r[key] === null ? -1 : r[key]);
    rows.sort((a, b) => (key === 'tool' ? a.tool.localeCompare(b.tool) : val(a) - val(b)) * sign || b.calls - a.calls);
    markTools(view.tsort);
    const max = Math.max(1, ...rows.map(r => r.calls));
    for (const r of rows) {
      const tr = el('tr', '', tbody);
      const th = el('th', 'mono-cell', tr, r.tool);
      th.scope = 'row';
      const calls = el('td', 'obs-calls', tr);
      const bar = el('span', 'obs-mini', calls);
      bar.setAttribute('aria-hidden', 'true');
      setVar(bar, '--w', (r.calls / max).toFixed(4));
      el('span', '', calls, D.formatInt(r.calls));
      const few = !r.exact && r.timed < 3;
      el('td', '', tr, few ? '–' : D.formatMs(r.p50));
      el('td', '', tr, few ? '–' : D.formatMs(r.p90));
      el('td', r.errors ? 'is-err' : '', tr, r.errors ? `${D.formatPct(r.rate)} (${r.errors})` : '0%');
    }
    q('tools-caption').textContent = exact
      ? `Calls and errors are exact. p50 and p90 cover every recorded call of each tool. The question tool’s time includes waiting for my answer.`
      : 'Calls and errors are exact for these traces. p50 and p90 use only the calls published one by one (a dash means fewer than three); the rest sit inside merged steps.';
  }

  // tokens by agent
  function tokens() {
    const ul = q('tokens');
    ul.replaceChildren();
    const rows = D.tokensByAgent(view.shown).map(r => ({ ...r, shown: view.cache ? r.total : r.total - r.cache }))
      .sort((a, b) => b.shown - a.shown);
    const max = Math.max(1, ...rows.map(r => r.shown));
    for (const r of rows) {
      const li = el('li', 'obs-bar-row', ul);
      el('span', 'obs-bar-name', li, r.agent);
      const track = el('span', 'obs-stack', li);
      track.setAttribute('aria-hidden', 'true');
      for (const part of ['input', 'output', 'reasoning', ...(view.cache ? ['cache'] : [])]) setVar(el('span', `obs-seg-${part}`, track), '--w', (r[part] / max).toFixed(5));
      const parts = [`input ${D.formatTokens(r.input)}`, `output ${D.formatTokens(r.output)}`, `reasoning ${D.formatTokens(r.reasoning)}`];
      if (view.cache) parts.push(`cache ${D.formatTokens(r.cache)}`);
      el('span', 'obs-bar-value', li, D.formatTokens(r.shown));
      el('span', 'visually-hidden', li, `: ${parts.join(', ')}`);
    }
    if (!rows.length) el('li', 'obs-none', ul, 'No tokens in these traces.');
  }

  // delegations
  function delegations() {
    const ul = q('delegations');
    ul.replaceChildren();
    const rows = D.delegations(view.shown);
    const max = Math.max(1, ...rows.map(r => r.runs));
    for (const r of rows) {
      const li = el('li', 'obs-bar-row', ul);
      el('span', 'obs-bar-name', li, r.agent);
      const track = el('span', 'obs-stack', li);
      track.setAttribute('aria-hidden', 'true');
      setVar(el('span', 'obs-seg-agent', track), '--w', (r.runs / max).toFixed(4));
      el('span', 'obs-bar-value', li, `${r.runs} ${r.runs === 1 ? 'run' : 'runs'}`);
    }
    if (!rows.length) el('li', 'obs-none', ul, 'No subagent runs in these traces.');
    const total = D.sum(rows.map(r => r.runs));
    q('deleg-caption').textContent = `${D.formatInt(total)} subagent ${total === 1 ? 'run' : 'runs'}, each started by a task call from the orchestrator. One subagent session can be resumed by several calls.`;
  }

  // traces per day
  function days() {
    const box = q('days');
    box.replaceChildren();
    const rows = D.perDay(data.traces, view.shown);
    const max = Math.max(1, ...rows.map(r => r.total));
    for (const r of rows) {
      const button = el('button', 'obs-day', box);
      button.type = 'button';
      button.setAttribute('aria-pressed', String(view.filters.day === r.day));
      button.setAttribute('aria-label', `${D.dayLabel(r.day)}: ${r.shown} of ${r.total} traces match. ${view.filters.day === r.day ? 'Show all days' : 'Filter to this day'}`);
      const col = el('span', 'obs-day-col', button);
      setVar(el('span', 'obs-day-total', col), '--h', (r.total / max).toFixed(4));
      setVar(el('span', 'obs-day-shown', col), '--h', (r.shown / max).toFixed(4));
      el('span', 'obs-day-n', button, r.shown === r.total ? String(r.total) : `${r.shown}/${r.total}`);
      el('span', 'mono obs-day-label', button, D.dayLabel(r.day));
      button.addEventListener('click', () => setDay(r.day));
    }
  }

  // evaluator matrix
  let cells = [];
  function matrix() {
    const table = q('matrix');
    table.replaceChildren();
    cells = [];
    if (!view.shown.length) return;
    const head = el('tr', '', el('thead', '', table));
    el('th', 'obs-corner', head, 'Evaluator').scope = 'col';
    for (const t of view.shown) {
      const th = el('th', 'obs-col', head, Number(t.id.slice(1)));
      th.scope = 'col';
      th.dataset.trace = t.id;
      th.title = `Trace #${Number(t.id.slice(1))}, ${D.dayLabel(t.day)}`;
    }
    const tbody = el('tbody', '', table);
    const nums = data.evaluations.filter(ev => ev.evaluator === 'tokens_per_tool_call').map(ev => ev.score).sort((a, b) => a - b);
    data.evaluators.forEach((e, r) => {
      const tr = el('tr', '', tbody);
      const th = el('th', 'obs-row-head', tr, e.name);
      th.scope = 'row';
      const row = [];
      view.shown.forEach((t, c) => {
        const ev = index.get(t.id)?.get(e.id);
        const td = el('td', '', tr);
        td.dataset.trace = t.id;
        const kind = !ev ? 'na' : ev.label === 'pass' ? 'pass' : ev.label === 'fail' ? 'fail' : 'num';
        const button = el('button', `obs-cell is-${kind}`, td);
        button.type = 'button';
        button.tabIndex = r === 0 && c === 0 ? 0 : -1;
        button.dataset.trace = t.id;
        if (kind === 'num') setVar(button, '--q', (nums.findIndex(v => v >= ev.score) / Math.max(1, nums.length - 1)).toFixed(3));
        const verdict = kind === 'na' ? 'not scored' : kind === 'num' ? `${D.formatInt(ev.score)} tokens per call` : kind;
        button.setAttribute('aria-label', `Trace #${Number(t.id.slice(1))}, ${D.dayLabel(t.day)}, ${e.name}: ${verdict}. Open trace`);
        row.push(button);
      });
      cells.push(row);
    });
    highlight(view.selected);
  }
  q('matrix').addEventListener('click', event => {
    const button = event.target.closest('button[data-trace]');
    if (button) { rove(button); open(button.dataset.trace); }
  });
  q('matrix').addEventListener('keydown', event => {
    const moves = { ArrowRight: [0, 1], ArrowLeft: [0, -1], ArrowDown: [1, 0], ArrowUp: [-1, 0], Home: [0, -1e4], End: [0, 1e4] };
    const move = moves[event.key];
    if (!move) return;
    const r = cells.findIndex(row => row.includes(event.target));
    if (r < 0) return;
    event.preventDefault();
    const c = cells[r].indexOf(event.target);
    const nr = Math.max(0, Math.min(cells.length - 1, r + move[0]));
    const nc = Math.max(0, Math.min(cells[nr].length - 1, c + move[1]));
    rove(cells[nr][nc]);
    cells[nr][nc].focus();
  });
  function rove(target) { cells.flat().forEach(button => { button.tabIndex = button === target ? 0 : -1; }); }
  function highlight(id) {
    view.selected = id;
    document.querySelectorAll('.obs-matrix [data-trace]').forEach(node => {
      if (node.tagName !== 'BUTTON') node.classList.toggle('is-current', node.dataset.trace === id);
    });
  }

  // lazy drawing
  function draw() {
    if (!view.ready) return;
    const n = view.shown.length;
    q('charts-scope').textContent = D.isFiltered(view.filters) ? `For the ${n} ${n === 1 ? 'trace' : 'traces'} that match the filters.` : `For all ${n} traces.`;
    hist(); tools(); tokens(); delegations(); days(); matrix();
  }
  const reveal = () => { if (!view.ready) { view.ready = true; draw(); } };
  if (typeof window.IntersectionObserver === 'function') {
    const io = new IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting)) { io.disconnect(); reveal(); } }, { rootMargin: '400px 0px' });
    io.observe(block);
  } else reveal();
  window.addEventListener('beforeprint', reveal);

  return {
    update(shown, filters, selected) { view.shown = shown; view.filters = filters; view.selected = selected; draw(); },
    highlight,
  };
}

// Agent observability helpers. All but the DOM helpers are pure, so node tests check every
// number the page shows. Percentiles are nearest-rank, like the exporter.

export const DATA_URL = './data/agent-traces.json';
export const TOKEN_KEYS = ['input', 'output', 'reasoning', 'cacheRead', 'cacheWrite'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// The exporter's work labels, said in plain words for the page.
export const TOPICS = {
  'Recruiter content': 'recruiter content',
  'Build tour': 'entrance and build tour',
  'Round 1': 'type, header and motion',
  'Round 2': 'portrait hero and approach',
  'Round 3': 'beam art and experience',
  'Round 4': 'hero, Icarus and layout',
  'Round 4–5': 'layout and copy polish',
  'Round 5': 'copy and polish',
  Security: 'security hardening',
  'Round 6': 'real-trace tour and lab',
  'Round 7': 'proof strip and essay',
  'Round 7–8': 'evidence-first case studies',
  'Round 9': 'case studies and charts',
  'Round 10': 'homepage work previews',
};
export const topic = trace => TOPICS[trace?.round] || 'site work';

// Short words for a failed check, used on chips.
export const FAIL_WORDS = {
  tool_error_rate: 'tool errors', recovered_after_error: 'unrecovered', delegation_used: 'no delegation',
  review_before_commit: 'no review', tests_run_before_commit: 'no tests', latency_budget: 'slow model',
};

// DOM helpers (touch document only when called)
export function el(tag, className, parent, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = String(text);
  parent?.append(node);
  return node;
}
export const q = name => document.querySelector(`[data-obs="${name}"]`);
export const setVar = (node, name, value) => node.style.setProperty(name, String(value));
// Sortable headers: the sorted column flips, another starts at first(key); returns the aria-sort marker.
export function sortable(buttons, attr, get, set, first) {
  buttons.forEach(b => b.addEventListener('click', () => {
    const key = b.dataset[attr];
    const cur = get();
    set(cur.key === key ? { key, dir: cur.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: first(key) });
  }));
  return ({ key, dir }) => buttons.forEach(b => {
    const th = b.closest('th');
    if (b.dataset[attr] === key) th.setAttribute('aria-sort', dir === 'asc' ? 'ascending' : 'descending'); else th.removeAttribute('aria-sort');
  });
}

// numbers
export function percentile(values, p) {
  const sorted = [...values].filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  return sorted[Math.min(sorted.length, Math.max(1, Math.ceil((p / 100) * sorted.length))) - 1];
}
export const sum = list => list.reduce((a, b) => a + b, 0);
export const tokenTotal = tokens => (tokens ? sum(TOKEN_KEYS.map(key => tokens[key] || 0)) : 0);
export const duration = span => Math.max(0, span.end - span.start);

export const formatInt = n => (Number.isFinite(n) ? Math.round(n).toLocaleString('en-US') : '–');
export function formatMs(ms) {
  if (!Number.isFinite(ms)) return '–';
  if (ms < 1000) return `${Math.round(ms)} ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ${String(Math.round(s % 60)).padStart(2, '0')} s`;
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min`;
}
// Short axis labels: 10 ms, 1 s, 2 min, 3 h.
export function formatTick(ms) {
  if (!Number.isFinite(ms)) return '';
  const round = v => (v < 10 && v % 1 ? v.toFixed(1) : String(Math.round(v)));
  if (ms < 1000) return `${round(ms)} ms`;
  if (ms < 60e3) return `${round(ms / 1000)} s`;
  if (ms < 36e5) return `${round(ms / 60e3)} min`;
  return `${round(ms / 36e5)} h`;
}
export function formatTokens(n) {
  if (!Number.isFinite(n)) return '–';
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)} B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)} M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)} k`;
  return String(n);
}
export const formatPct = (rate, digits = 1) => (Number.isFinite(rate) ? `${(rate * 100).toFixed(digits)}%` : '–');
export function dayLabel(day) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day || '');
  return m ? `${MONTHS[Number(m[2]) - 1]} ${Number(m[3])}` : '';
}

// the whole dataset
export function evalIndex(evaluations) {
  const index = new Map();
  for (const ev of evaluations || []) {
    if (!index.has(ev.trace)) index.set(ev.trace, new Map());
    index.get(ev.trace).set(ev.evaluator, ev);
  }
  return index;
}

// Tool names a trace used: single TOOL spans and the tools merged into CHAIN spans.
export function toolsOf(trace) {
  const names = new Set();
  for (const span of trace.spans) {
    if (span.kind === 'TOOL') names.add(span.name);
    if (span.kind === 'CHAIN') Object.keys(span.tools || {}).forEach(name => names.add(name));
  }
  return names;
}

export function kpis(data) {
  const { meta, traces, rollups } = data;
  const tokens = Object.fromEntries(TOKEN_KEYS.map(key => [key, sum(traces.map(t => t.tokens[key]))]));
  const total = tokenTotal(tokens);
  const toolCalls = sum(traces.map(t => t.toolCalls));
  const toolErrors = sum(traces.map(t => t.toolErrors));
  return {
    traces: traces.length,
    requests: traces.filter(t => t.rootAgent !== 'compaction').length,
    compactions: traces.filter(t => t.rootAgent === 'compaction').length,
    dropped: meta.droppedSpans,
    published: meta.publishedSpans,
    spans: meta.spans,
    llmSteps: sum(traces.map(t => t.llmSteps)),
    toolCalls,
    toolErrors,
    subagentRuns: sum(traces.map(t => t.subagentRuns)),
    errorRate: toolCalls ? toolErrors / toolCalls : 0,
    llmP50: rollups.latencyByKind.LLM.p50,
    llmP90: rollups.latencyByKind.LLM.p90,
    llmN: rollups.latencyByKind.LLM.n,
    tokens: total,
    cacheRead: tokens.cacheRead,
    cacheShare: total ? tokens.cacheRead / total : 0,
  };
}

// filters
export const EMPTY_FILTERS = Object.freeze({ day: 'all', agent: 'all', delegation: false, failed: false, tool: '' });
export const isFiltered = f => f.day !== 'all' || f.agent !== 'all' || f.delegation || f.failed || Boolean(f.tool.trim());

export function filterTraces(traces, index, filters = EMPTY_FILTERS) {
  const query = (filters.tool || '').trim().toLowerCase();
  return traces.filter(trace => {
    if (filters.day !== 'all' && trace.day !== filters.day) return false;
    if (filters.agent !== 'all' && trace.rootAgent !== filters.agent) return false;
    if (filters.delegation && !(trace.subagentRuns > 0)) return false;
    if (filters.failed && ![...(index.get(trace.id)?.values() || [])].some(ev => ev.label === 'fail')) return false;
    if (query && ![...toolsOf(trace)].some(name => name.toLowerCase().includes(query))) return false;
    return true;
  });
}

// One row of the trace list.
export function traceRow(trace, index) {
  const evals = [...(index.get(trace.id)?.values() || [])];
  const checks = evals.filter(ev => ev.label === 'pass' || ev.label === 'fail');
  const fails = checks.filter(ev => ev.label === 'fail');
  return {
    id: trace.id, n: Number(trace.id.slice(1)), day: trace.day, topic: topic(trace), agent: trace.rootAgent,
    duration: trace.end - trace.start, spans: trace.spans.length, llmSteps: trace.llmSteps, toolCalls: trace.toolCalls,
    errors: trace.toolErrors, tokens: tokenTotal(trace.tokens), subagents: trace.subagentRuns, commits: trace.commits,
    checks: checks.length, passed: checks.length - fails.length, fails: fails.map(ev => ev.evaluator),
  };
}

export function sortRows(rows, key, dir = 'asc') {
  const sign = dir === 'desc' ? -1 : 1;
  const value = row => (key === 'fails' ? row.fails.length : row[key]);
  return [...rows].sort((a, b) => {
    const x = value(a);
    const y = value(b);
    const c = typeof x === 'string' ? x.localeCompare(y) : x - y;
    return c * sign || a.n - b.n;
  });
}

// trace detail
// Rows in tree order, x and w as fractions of the trace. Runs start open, CHAINs closed;
// `toggled` holds flipped ids. An open CHAIN lists its merged tools as untimed rows.
export const openByDefault = span => span.kind !== 'CHAIN';
export function waterfall(trace, toggled = new Set()) {
  const end = Math.max(1, trace.end - trace.start);
  const kids = new Map();
  const roots = [];
  for (const span of trace.spans) {
    if (span.parent && trace.spans.some(s => s.id === span.parent)) {
      if (!kids.has(span.parent)) kids.set(span.parent, []);
      kids.get(span.parent).push(span);
    } else roots.push(span);
  }
  const rows = [];
  const walk = (span, depth, parent) => {
    const children = kids.get(span.id) || [];
    const merged = span.kind === 'CHAIN' ? Object.entries(span.tools || {}) : [];
    const expandable = children.length > 0 || merged.length > 0;
    const open = expandable && (toggled.has(span.id) ? !openByDefault(span) : openByDefault(span));
    rows.push({
      id: span.id, span, depth, parent, expandable, open,
      x: (span.start - trace.start) / end, w: duration(span) / end,
    });
    if (!open) return;
    children.forEach(child => walk(child, depth + 1, span.id));
    merged.forEach(([tool, count]) => rows.push({
      id: `${span.id}:${tool}`, merged: { tool, count, errors: span.errors?.[tool] || 0 }, span, depth: depth + 1, parent: span.id,
      expandable: false, open: false, x: (span.start - trace.start) / end, w: duration(span) / end,
    }));
  };
  roots.forEach(root => walk(root, 0, null));
  // aria-posinset / aria-setsize among siblings
  const n = new Map();
  rows.forEach(row => { row.pos = (n.get(row.parent) || 0) + 1; n.set(row.parent, row.pos); });
  rows.forEach(row => { row.size = n.get(row.parent); });
  return rows;
}

// The trace id in a link such as #t12, if that trace exists; anything else is ignored.
export const hashTrace = (hash, ids) => {
  const id = /^#(t\d{2,3})$/.exec(typeof hash === 'string' ? hash : '')?.[1];
  return id && ids.has(id) ? id : null;
};

// Axis ticks for a duration: about `count` round steps.
export function ticks(end, count = 4) {
  if (!(end > 0)) return [0];
  const raw = end / count;
  const steps = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1e3, 2e3, 5e3, 1e4, 15e3, 3e4, 6e4, 12e4, 3e5, 6e5, 9e5, 18e5, 36e5, 72e5];
  const step = steps.find(s => s >= raw) || Math.ceil(raw / 36e5) * 36e5;
  const out = [];
  for (let t = 0; t <= end; t += step) out.push(t);
  return out;
}

// charts
// Durations of the published single spans of a kind (CHAINs carry no per-step time).
export const durationsOf = (traces, kind) => traces.flatMap(t => t.spans.filter(s => s.kind === kind).map(duration));

// Equal-width bins on a linear or log10 axis. Values under 1 ms count as 1 ms on the log axis.
export function histogram(values, { bins = 24, log = true } = {}) {
  const list = values.filter(Number.isFinite).map(v => (log ? Math.max(1, v) : Math.max(0, v)));
  if (!list.length) return { log, lo: 0, hi: 1, bins: [], at: () => 0 };
  const f = log ? Math.log10 : v => v;
  const minV = Math.min(...list);
  const maxV = Math.max(...list);
  let lo = log ? Math.floor(f(minV)) : 0;
  let hi = log ? Math.ceil(f(maxV)) : maxV;
  if (hi <= lo) hi = lo + 1;
  const width = (hi - lo) / bins;
  const out = Array.from({ length: bins }, (_, i) => ({
    x0: log ? 10 ** (lo + i * width) : lo + i * width,
    x1: log ? 10 ** (lo + (i + 1) * width) : lo + (i + 1) * width,
    count: 0,
  }));
  for (const v of list) out[Math.min(bins - 1, Math.max(0, Math.floor((f(v) - lo) / width)))].count++;
  const at = v => Math.min(1, Math.max(0, (f(log ? Math.max(1, v) : v) - lo) / (hi - lo)));
  return { log, lo, hi, bins: out, at };
}

// Calls and errors per tool are exact (CHAIN counts included); p50/p90 come from the timed
// single spans, or from the rollup when it covers every call.
export function toolStats(traces, rollup = null) {
  const stats = new Map();
  const get = name => {
    if (!stats.has(name)) stats.set(name, { tool: name, calls: 0, errors: 0, timed: [] });
    return stats.get(name);
  };
  for (const trace of traces) {
    for (const span of trace.spans) {
      if (span.kind === 'TOOL') {
        const s = get(span.name);
        s.calls++;
        s.errors += span.status === 'error' ? 1 : 0;
        s.timed.push(duration(span));
      } else if (span.kind === 'CHAIN') {
        for (const [name, count] of Object.entries(span.tools || {})) get(name).calls += count;
        for (const [name, count] of Object.entries(span.errors || {})) get(name).errors += count;
      }
    }
  }
  return [...stats.values()].map(s => {
    const all = rollup?.[s.tool];
    return {
      tool: s.tool, calls: s.calls, errors: s.errors, rate: s.calls ? s.errors / s.calls : 0,
      timed: all ? all.n : s.timed.length, exact: Boolean(all),
      p50: all ? all.p50 : percentile(s.timed, 50), p90: all ? all.p90 : percentile(s.timed, 90),
    };
  }).sort((a, b) => b.calls - a.calls || a.tool.localeCompare(b.tool));
}

// Tokens per agent from the LLM and CHAIN spans (each carries its agent).
export function tokensByAgent(traces) {
  const out = new Map();
  for (const trace of traces) {
    for (const span of trace.spans) {
      if (!span.tokens) continue;
      if (!out.has(span.agent)) out.set(span.agent, { agent: span.agent, input: 0, output: 0, reasoning: 0, cache: 0 });
      const row = out.get(span.agent);
      row.input += span.tokens.input;
      row.output += span.tokens.output;
      row.reasoning += span.tokens.reasoning;
      row.cache += span.tokens.cacheRead + span.tokens.cacheWrite;
    }
  }
  return [...out.values()].map(row => ({ ...row, total: row.input + row.output + row.reasoning + row.cache }))
    .sort((a, b) => b.total - a.total || a.agent.localeCompare(b.agent));
}

export function delegations(traces) {
  const out = new Map();
  for (const trace of traces) {
    for (const span of trace.spans) if (span.kind === 'AGENT' && span.parent) out.set(span.agent, (out.get(span.agent) || 0) + 1);
  }
  return [...out.entries()].map(([agent, runs]) => ({ agent, runs })).sort((a, b) => b.runs - a.runs || a.agent.localeCompare(b.agent));
}

export function perDay(all, shown) {
  const days = [...new Set(all.map(t => t.day))].sort();
  return days.map(day => ({ day, total: all.filter(t => t.day === day).length, shown: shown.filter(t => t.day === day).length }));
}

// Pass/fail counts per evaluator over a set of traces.
export function evaluatorCounts(evaluators, evaluations, traceIds = null) {
  return evaluators.map(e => {
    const rows = evaluations.filter(ev => ev.evaluator === e.id && (!traceIds || traceIds.has(ev.trace)));
    const scores = rows.map(ev => ev.score).filter(Number.isFinite);
    return {
      id: e.id, scored: rows.length,
      pass: rows.filter(ev => ev.label === 'pass').length, fail: rows.filter(ev => ev.label === 'fail').length,
      median: percentile(scores, 50), min: scores.length ? Math.min(...scores) : null, max: scores.length ? Math.max(...scores) : null,
    };
  });
}

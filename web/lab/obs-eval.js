// Agent observability: the analysis behind the release gate, human review, agent graph,
// failure analysis, monitor, sessions and compare views. Pure functions over the exported
// JSON, so node tests check every number the page shows.
import { errorClassesOf, sum, dayLabel, sessionsOf } from './obs-data.js';

// The exporter's label rule: pass when the score meets the threshold in this direction.
export const DIRECTIONS = { atMost: (s, t) => s <= t, below: (s, t) => s < t, atLeast: (s, t) => s >= t };
export const passFail = evaluators => evaluators.filter(e => e.output === 'pass/fail' && e.direction in DIRECTIONS);

// ---- release gate
// One control per pass/fail check. A slider moves the threshold in display units
// (value / scale = threshold); checks scored 1 or 0 only have the "require" toggle.
export const GATE = {
  tool_error_rate: { scale: 100, min: 0, max: 30, step: 1, unit: '%', rule: v => `Fails when more than ${v}% of tool calls error` },
  recovered_after_error: { scale: 100, min: 0, max: 100, step: 5, unit: '%', rule: v => (v === 100 ? 'Passes when every failed call later succeeded' : `Passes when at least ${v}% of failed calls later succeeded`) },
  delegation_fit: { scale: 100, min: 0, max: 100, step: 5, unit: '%', rule: v => (v ? `Subagents made at least ${v}% of the calls` : 'Passes whoever made the calls (0%)') },
  review_before_commit: { toggle: true, rule: () => 'A review finished before the commit' },
  tests_run_before_commit: { toggle: true, rule: () => 'Tests ran before the commit' },
  verified_after_last_edit: { toggle: true, rule: () => 'A check passed after the last edit' },
  stuck_loop: { scale: 1, min: 2, max: 10, step: 1, unit: '', rule: v => `Fails at ${v} failed calls of one tool in a row` },
  review_addressed: { scale: 1, min: 0, max: 5, step: 1, unit: '', rule: v => (v ? `At least ${v} ${v === 1 ? 'edit' : 'edits'} after a review` : 'Passes with no edit after a review (0)') },
  latency_budget: { scale: 1, min: 5, max: 60, step: 1, unit: ' s', rule: v => `p90 model step under ${v} s` },
};
const round6 = v => Math.round(v * 1e6) / 1e6;
export const gateControl = e => GATE[e.id] || { scale: 1, min: 0, max: Math.max(1, e.threshold * 2), step: 1, unit: '', rule: v => `Threshold ${v}` };

// The starting gate: every check required, at its published threshold (slider units).
export function gateDefaults(evaluators) {
  return Object.fromEntries(passFail(evaluators).map(e => {
    const c = gateControl(e);
    return [e.id, { require: true, value: c.toggle ? null : round6(e.threshold * c.scale) }];
  }));
}
// The threshold a gate setting stands for; the published value itself at the default.
export function gateThreshold(e, setting) {
  const c = gateControl(e);
  if (!setting || c.toggle || setting.value === round6(e.threshold * c.scale)) return e.threshold;
  return setting.value / c.scale;
}

// Re-scores every recorded evaluation against the gate's thresholds. `labels`: trace ->
// evaluator -> 'pass'|'fail' for every pass/fail check; a trace is scored when a required
// check applies to it and blocked when a required check fails.
export function rescore(evaluators, evaluations, gate) {
  const checks = new Map(passFail(evaluators).map(e => [e.id, e]));
  const labels = new Map();
  const fails = Object.fromEntries([...checks.keys()].map(id => [id, 0]));
  const scored = new Set();
  const blocked = new Set();
  for (const ev of evaluations) {
    const e = checks.get(ev.evaluator);
    if (!e) continue;
    const label = DIRECTIONS[e.direction](ev.score, gateThreshold(e, gate[e.id])) ? 'pass' : 'fail';
    if (!labels.has(ev.trace)) labels.set(ev.trace, new Map());
    labels.get(ev.trace).set(e.id, label);
    if (!gate[e.id]?.require) continue;
    scored.add(ev.trace);
    if (label === 'fail') { fails[e.id] += 1; blocked.add(ev.trace); }
  }
  const top = Object.entries(fails).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1])[0] || null;
  const order = id => Number(id.slice(1));
  return {
    labels, fails, top: top && { id: top[0], fails: top[1] },
    scored: scored.size, blocked: [...blocked].sort((a, b) => order(a) - order(b)),
    required: new Set([...checks.keys()].filter(id => gate[id]?.require)),
  };
}

// ---- human review
export const ANNOTATIONS_KEY = 'cesar:portfolio:obs-annotations:v1';
export const LABEL_VALUES = ['good', 'bad'];

// Keeps good/bad labels of known trace ids (any tNN id when `ids` is null); drops the rest.
// `dataset`: the export the labels were made on (meta.dataset; see labelsFit).
export const DATASET_RE = /^[0-9a-f]{6,64}$/;
export function parseLabels(json, ids) {
  const src = json && typeof json === 'object' ? json : {};
  const labels = {};
  for (const [id, value] of Object.entries(src.labels && typeof src.labels === 'object' ? src.labels : {})) {
    if (/^t\d{2,3}$/.test(id) && (!ids || ids.has(id)) && LABEL_VALUES.includes(value)) labels[id] = value;
  }
  return {
    labeler: typeof src.labeler === 'string' ? src.labeler.slice(0, 80) : null,
    dataset: typeof src.dataset === 'string' && DATASET_RE.test(src.dataset) ? src.dataset : null,
    date: typeof src.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(src.date) ? src.date : null,
    labels,
  };
}
// The download: the same shape as data/human-labels.json, labels in trace order.
export function labelsFile(labels, date, labeler = null, dataset = null) {
  const sorted = Object.keys(labels).sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));
  return { labeler, dataset, date, labels: Object.fromEntries(sorted.map(id => [id, labels[id]])) };
}
// Labels count only on their own dataset (ids shift between exports); no labels fit any.
export const labelsFit = (parsed, dataset) => !Object.keys(parsed.labels).length || (Boolean(dataset) && parsed.dataset === dataset);

// 2x2 counts: human Good/Bad (rows) by check pass/fail (columns).
export function confusion(pairs) {
  const m = { gp: 0, gf: 0, bp: 0, bf: 0 };
  for (const [good, pass] of pairs) m[(good ? 'g' : 'b') + (pass ? 'p' : 'f')] += 1;
  return m;
}
// Cohen's kappa for two raters and two labels: (po - pe) / (1 - pe). Null when there is
// nothing to compare or chance agreement is already total (pe = 1).
export function kappa({ gp, gf, bp, bf }) {
  const n = gp + gf + bp + bf;
  if (!n) return null;
  const po = (gp + bf) / n;
  const pe = ((gp + gf) * (gp + bp) + (bp + bf) * (gf + bf)) / (n * n);
  return pe >= 1 ? null : (po - pe) / (1 - pe);
}
export const MIN_KAPPA_N = 5;
export function agreement(m) {
  const n = m.gp + m.gf + m.bp + m.bf;
  return { n, m, agree: n ? (m.gp + m.bf) / n : null, kappa: n >= MIN_KAPPA_N ? kappa(m) : null };
}

// One row per pass/fail check (the human label against the check's label on the traces
// both scored), then "all required checks pass" against the human label.
export function agreementRows(evaluators, scoring, labels) {
  const ids = Object.keys(labels);
  const rows = passFail(evaluators).map(e => {
    const pairs = ids.filter(id => scoring.labels.get(id)?.has(e.id)).map(id => [labels[id] === 'good', scoring.labels.get(id).get(e.id) === 'pass']);
    return { id: e.id, name: e.name, ...agreement(confusion(pairs)) };
  });
  const pairs = ids.filter(id => [...(scoring.labels.get(id)?.keys() || [])].some(c => scoring.required.has(c)))
    .map(id => [labels[id] === 'good', ![...scoring.labels.get(id)].some(([c, l]) => scoring.required.has(c) && l === 'fail')]);
  rows.push({ id: 'all', name: 'All required checks pass', ...agreement(confusion(pairs)) });
  return rows;
}

// ---- monitor, sessions, compare
export const daysOf = traces => [...new Set(traces.map(t => t.day))].sort();

// Pass rate per calendar day for one check; a day with nothing scored has rate null (a gap).
export function passRateByDay(traces, evaluations, id, days = daysOf(traces)) {
  const dayOf = new Map(traces.map(t => [t.id, t.day]));
  const out = new Map(days.map(day => [day, { day, pass: 0, n: 0 }]));
  for (const ev of evaluations) {
    if (ev.evaluator !== id) continue;
    const row = out.get(dayOf.get(ev.trace));
    if (!row) continue;
    row.n += 1;
    row.pass += ev.label === 'pass' ? 1 : 0;
  }
  return [...out.values()].map(row => ({ ...row, rate: row.n ? row.pass / row.n : null }));
}

// Pass / scored / rate per pass/fail check over a set of trace ids.
export function groupRates(evaluators, evaluations, ids) {
  return passFail(evaluators).map(e => {
    const rows = evaluations.filter(ev => ev.evaluator === e.id && ids.has(ev.trace));
    const pass = rows.filter(ev => ev.label === 'pass').length;
    return { id: e.id, name: e.name, pass, n: rows.length, rate: rows.length ? pass / rows.length : null };
  });
}

// "Nov 7–9", "Nov 30 – Dec 2", "Nov 12".
export function dayRange(days) {
  const [a, b] = [dayLabel(days[0]), dayLabel(days.at(-1))];
  if (a === b) return a;
  return a.split(' ')[0] === b.split(' ')[0] ? `${a}–${b.split(' ')[1]}` : `${a} – ${b}`;
}

// Compare groups: everything, the two halves of the days (the first takes an odd middle
// day), each session.
export function compareGroups(traces) {
  const sessions = sessionsOf(traces);
  const days = daysOf(traces);
  const cut = Math.ceil(days.length / 2);
  const groups = [{ id: 'all', label: `All ${traces.length} traces`, test: () => true }];
  for (const span of days.length > 1 ? [days.slice(0, cut), days.slice(cut)] : []) {
    groups.push({ id: `days:${span[0]}:${span.at(-1)}`, label: dayRange(span), test: t => t.day >= span[0] && t.day <= span.at(-1) });
  }
  for (const s of sessions) {
    const own = daysOf(traces.filter(t => t.session === s));
    groups.push({ id: `session:${s}`, label: `Session ${s} (${dayRange(own)})`, test: t => t.session === s });
  }
  return groups.map(g => ({ ...g, ids: new Set(traces.filter(g.test).map(t => t.id)) }));
}
// Presets: first half of the days against the second, the last two sessions.
export function comparePresets(groups) {
  const pair = ([x, y], name) => (x && y ? { a: x.id, b: y.id, label: `${name(x)} vs ${name(y)}` } : null);
  return {
    days: pair(groups.filter(g => g.id.startsWith('days:')), g => g.label),
    sessions: pair(groups.filter(g => g.id.startsWith('session:')).slice(-2), g => g.id.slice(8)),
  };
}

// ---- failure analysis
// Failed calls and traces per error class, in the exporter's order.
export function errorClassStats(traces, classes) {
  const stats = new Map(classes.map(c => [c, { cls: c, calls: 0, traces: 0 }]));
  for (const trace of traces) {
    for (const [c, n] of Object.entries(errorClassesOf(trace))) {
      const row = stats.get(c);
      if (!row) continue;
      row.calls += n;
      row.traces += 1;
    }
  }
  return [...stats.values()];
}

// ---- agent graph
// Bucketed tool error rate: colour carries the bucket, text carries the exact rate.
export const RATE_BUCKETS = [{ max: 0, label: '0%' }, { max: 0.02, label: 'under 2%' }, { max: 0.05, label: '2–5%' }, { max: Infinity, label: '5% or more' }];
export const rateBucket = (errors, calls) => (calls ? RATE_BUCKETS.findIndex(b => errors / calls <= b.max || b.max === Infinity) : -1);

// A fixed layout: agents nothing starts (the orchestrators) on the left, at the weighted
// mean height of the agents they start; subagents on the right, most-started first.
// x and y are fractions of the drawing; r is a radius in px from the tool calls.
export function graphLayout(graph, { left = 0.1, right = 0.5, minGap = 0.2 } = {}) {
  const incoming = new Map();
  for (const e of graph.edges) incoming.set(e.to, (incoming.get(e.to) || 0) + e.count);
  const byName = new Map(graph.nodes.map(n => [n.agent, n]));
  const subs = graph.nodes.filter(n => incoming.has(n.agent))
    .sort((a, b) => incoming.get(b.agent) - incoming.get(a.agent) || a.agent.localeCompare(b.agent));
  const roots = graph.nodes.filter(n => !incoming.has(n.agent));
  const pos = new Map();
  subs.forEach((n, i) => pos.set(n.agent, { x: right, y: (i + 0.5) / subs.length }));
  const rootY = n => {
    const out = graph.edges.filter(e => e.from === n.agent && pos.has(e.to));
    const total = sum(out.map(e => e.count));
    return total ? sum(out.map(e => pos.get(e.to).y * e.count)) / total : 2;
  };
  const placed = roots.map(n => ({ n, y: rootY(n) })).sort((a, b) => a.y - b.y || b.n.runs - a.n.runs || a.n.agent.localeCompare(b.n.agent));
  let floor = -Infinity;
  for (const p of placed) { p.y = Math.max(p.y > 1 ? 0 : p.y, floor + minGap, 0.08); floor = p.y; }
  const over = Math.max(0, (placed.at(-1)?.y ?? 0) - 0.92);
  placed.forEach(p => pos.set(p.n.agent, { x: left, y: Math.max(0.08, p.y - over) }));
  const max = Math.max(1, ...graph.nodes.map(n => n.toolCalls));
  const maxEdge = Math.max(1, ...graph.edges.map(e => e.count));
  const nodes = [...placed.map(p => p.n), ...subs].map(n => ({
    ...n, ...pos.get(n.agent), root: !incoming.has(n.agent), r: 7 + 15 * Math.sqrt(n.toolCalls / max),
    rate: n.toolCalls ? n.toolErrors / n.toolCalls : null, bucket: rateBucket(n.toolErrors, n.toolCalls),
    startedBy: graph.edges.filter(e => e.to === n.agent), starts: graph.edges.filter(e => e.from === n.agent),
  }));
  const edges = graph.edges.filter(e => byName.has(e.from) && byName.has(e.to)).map(e => ({
    ...e, a: pos.get(e.from), b: pos.get(e.to), width: 1.5 + 7 * Math.sqrt(e.count / maxEdge),
  }));
  return { nodes, edges };
}
// The cubic path of an edge in a 0..100 box.
export const edgePath = ({ a, b }) => {
  const [x1, y1, x2, y2] = [a.x * 100, a.y * 100, b.x * 100, b.y * 100];
  const mid = (x1 + x2) / 2;
  return `M${x1.toFixed(2)} ${y1.toFixed(2)}C${mid.toFixed(2)} ${y1.toFixed(2)} ${mid.toFixed(2)} ${y2.toFixed(2)} ${x2.toFixed(2)} ${y2.toFixed(2)}`;
};

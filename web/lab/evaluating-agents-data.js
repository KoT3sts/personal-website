// Numbers for the figures in "How I evaluate agents" (evaluating-agents.html), computed
// from ./data/agent-traces.json (the exported telemetry of the agent runs that built this
// site). Pure functions with no DOM, so node tests can check the page's static fallback
// tables against the same file.

import { topic, dayLabel } from './obs-data.js';

export const TRACES_JSON = './data/agent-traces.json';
export const LAB_JSON = './data/sentiment-eval.json';

const sum = values => values.reduce((a, b) => a + b, 0);
// Nearest-rank percentile, the method the exporter uses: always an observed value.
export const rank = (values, p) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length ? sorted[Math.max(0, Math.ceil(p * sorted.length) - 1)] : 0;
};
export const int = value => Math.round(value).toLocaleString('en-US');
export const seconds = ms => (ms / 1000).toFixed(1);
// Where a trace sits in the work, in the dashboard's plain words ("hero, Icarus and layout · Nov 10"),
// never the exporter's round labels. topic() falls back to "site work"; a missing day is left out.
export const where = trace => [topic(trace), dayLabel(trace?.day)].filter(Boolean).join(' · ');
export const generated = tokens => (tokens?.output || 0) + (tokens?.reasoning || 0);

// The four measures: what the telemetry can say, and what needs task labels it lacks.
export function measures(data) {
  const tools = Object.values(data.rollups.tools);
  const calls = sum(tools.map(tool => tool.n));
  const errors = sum(tools.map(tool => tool.errors));
  const llm = data.rollups.latencyByKind.LLM;
  const tokens = sum(data.traces.map(trace => generated(trace.tokens)));
  return { calls, errors, rate: ((errors / calls) * 100).toFixed(1), steps: llm.n, p50: seconds(llm.p50), p90: seconds(llm.p90),
    tokens, perCall: Math.round(tokens / calls) };
}

// Failure buckets the published data can support honestly: duration only. Wrong tool and
// bad arguments cannot be told apart without the tool inputs, which are not published.
export const BUCKETS = [
  ['fast', 'Fast failure', 'under a second'],
  ['slow', 'Slow failure', 'a second to a minute'],
  ['timeout', 'Timeout-like', 'a minute or more'],
  ['stopped', 'Delegated run stopped', 'a task call that failed after a minute or more'],
];
export function bucketOf(span) {
  const ms = span.end - span.start;
  if (ms >= 60000) return span.name === 'task' ? 'stopped' : 'timeout';
  return ms < 1000 ? 'fast' : 'slow';
}

export function failures(data) {
  const tools = Object.entries(data.rollups.tools).filter(([, tool]) => tool.errors > 0)
    .map(([name, tool]) => ({ name, errors: tool.errors, n: tool.n }))
    .sort((a, b) => b.errors - a.errors || a.name.localeCompare(b.name));
  const spans = data.traces.flatMap(trace => trace.spans.filter(span => span.kind === 'TOOL' && span.status === 'error')
    .map(span => ({ trace: trace.id, where: where(trace), kind: span.kind, name: span.name, agent: span.agent,
      ms: span.end - span.start, bucket: bucketOf(span) })));
  const buckets = BUCKETS.map(([id, label, note]) => ({ id, label, note, count: spans.filter(span => span.bucket === id).length }));
  return { tools, spans, buckets, total: sum(tools.map(tool => tool.errors)) };
}

// Traces with and without a subagent run, compared per tool call. Not a controlled test.
export function delegation(data) {
  const points = data.traces.filter(trace => trace.toolCalls > 0).map(trace => ({
    id: trace.id, where: where(trace), calls: trace.toolCalls, errors: trace.toolErrors, delegated: trace.subagentRuns > 0,
    rate: (trace.toolErrors / trace.toolCalls) * 100, perCall: generated(trace.tokens) / trace.toolCalls,
  }));
  const groups = [true, false].map(delegated => {
    const traces = data.traces.filter(trace => (trace.subagentRuns > 0) === delegated);
    const scored = points.filter(point => point.delegated === delegated);
    const calls = sum(scored.map(point => point.calls));
    const errors = sum(scored.map(point => point.errors));
    return { delegated, traces: traces.length, scored: scored.length, calls, errors, rate: ((errors / calls) * 100).toFixed(1),
      perCall: Math.round(rank(scored.map(point => point.perCall), 0.5)), medianCalls: rank(scored.map(point => point.calls), 0.5) };
  });
  return { points, groups };
}

// An error class in plain words: "not_found" -> "not found".
export const words = label => String(label).replace(/_/g, ' ');

// Traces x evaluators: pass / fail / not-scored counts, the median and range of a number,
// or a category's most common label (ties: the class listed first).
export function matrix(data) {
  const cells = new Map(data.evaluations.map(row => [`${row.trace}|${row.evaluator}`, row]));
  const rows = data.evaluators.map(evaluator => {
    const scored = data.evaluations.filter(row => row.evaluator === evaluator.id);
    const numeric = evaluator.output ? evaluator.output === 'number' : scored.length > 0 && scored.every(row => typeof row.label === 'number');
    const category = evaluator.output === 'category';
    const values = scored.map(row => row.score);
    const order = [...(evaluator.classes || []), ...scored.map(row => row.label)];
    const counts = category ? order.filter((label, i) => order.indexOf(label) === i)
      .map(label => ({ label, count: scored.filter(row => row.label === label).length })) : [];
    const top = counts.reduce((best, item) => (item.count > (best?.count || 0) ? item : best), null);
    return { ...evaluator, numeric, category, top, scored: scored.length,
      pass: scored.filter(row => row.label === 'pass').length, fail: scored.filter(row => row.label === 'fail').length,
      none: data.traces.length - scored.length,
      median: numeric ? rank(values, 0.5) : null, min: numeric ? Math.min(...values) : null, max: numeric ? Math.max(...values) : null };
  });
  return { traces: data.traces.map(trace => ({ ...trace, where: where(trace) })), rows, cell: (trace, evaluator) => cells.get(`${trace}|${evaluator}`) || null };
}

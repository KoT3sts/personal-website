// The agent observability data (web/lab/data/agent-traces.json), exported by
// scripts/telemetry/export_traces.py from the OpenCode sessions that built this
// site. Checks shape, span integrity, the privacy allowlists and denylist, and
// that the rollups agree with the published spans. Node only (no DOM).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { userInfo } from 'node:os';

const raw = readFileSync(new URL('../web/lab/data/agent-traces.json', import.meta.url), 'utf8');
const data = JSON.parse(raw);
const { meta, traces, evaluators, evaluations, rollups } = data;

const KINDS = ['AGENT', 'LLM', 'TOOL', 'CHAIN'];
const STATUSES = ['ok', 'error'];
const AGENTS = ['build', 'plan', 'orchestrator', 'implementation-worker', 'quality-reviewer', 'verification-runner',
  'ui-design-director', 'general', 'explore', 'work-analyst', 'compaction', 'other'];
const CORE_TOOLS = ['bash', 'read', 'edit', 'write', 'glob', 'grep', 'task', 'todowrite', 'question', 'skill', 'webfetch'];
const isTool = name => CORE_TOOLS.includes(name) || /^browser\.[a-z][a-z_]{0,39}$/.test(name);
const BASH_CATEGORIES = ['test', 'build', 'git-commit', 'git-other', 'server', 'other'];
const TOKEN_KEYS = ['input', 'output', 'reasoning', 'cacheRead', 'cacheWrite'];
const DENY = /adp|jira|spark-|bitbucket|jenkins|confluence|splunk|servicenow|\/users\/|\/home\/|\\users\\|http|@|ses_|prj_|msg_|prt_|(?=[a-z0-9+/=_-]*\d)(?=[a-z0-9+/=_-]*[a-z])[a-z0-9+/=_-]{20,}/i;
// the local account name, checked without writing it into this public file
const USER = userInfo().username;
const day = /^\d{4}-\d{2}-\d{2}$/;
const nonNegInt = value => Number.isInteger(value) && value >= 0;
const sum = values => values.reduce((a, b) => a + b, 0);

const strings = (value, out = []) => {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) value.forEach(item => strings(item, out));
  else if (value && typeof value === 'object') for (const [key, item] of Object.entries(value)) { out.push(key); strings(item, out); }
  return out;
};
const keys = (value, out = []) => {
  if (Array.isArray(value)) value.forEach(item => keys(item, out));
  else if (value && typeof value === 'object') for (const [key, item] of Object.entries(value)) { out.push(key); keys(item, out); }
  return out;
};
const allSpans = traces.flatMap(trace => trace.spans.map(span => ({ trace, span })));

test('the file stays within the size budget', () => {
  assert.ok(Buffer.byteLength(raw) <= 300_000, `${Buffer.byteLength(raw)} bytes`);
});

test('meta describes the export', () => {
  for (const key of ['title', 'source', 'generated', 'window', 'sessions', 'subagentSessions', 'spans', 'droppedSpans', 'notes']) {
    assert.ok(key in meta, `meta.${key}`);
  }
  assert.match(meta.source, /scripts\/telemetry\/export_traces\.py/);
  assert.match(meta.generated, day);
  assert.match(meta.window.from, day);
  assert.match(meta.window.to, day);
  assert.ok(meta.window.from <= meta.window.to);
  for (const key of ['sessions', 'subagentSessions', 'spans', 'publishedSpans', 'mergedSpans', 'droppedSpans']) {
    assert.ok(nonNegInt(meta[key]), `meta.${key}`);
  }
  assert.equal(meta.traces, traces.length);
  assert.equal(meta.publishedSpans, allSpans.length);
  const chains = allSpans.filter(({ span }) => span.kind === 'CHAIN').length;
  assert.equal(meta.spans, meta.publishedSpans - chains + meta.mergedSpans, 'every source span is published or merged');
  assert.ok(Array.isArray(meta.notes) && meta.notes.length > 0);
  assert.ok(meta.notes.some(note => /LLM-as-judge/.test(note)), 'notes say there is no LLM-as-judge');
});

test('traces are sorted, uniquely numbered and rebased to zero', () => {
  assert.ok(traces.length > 0);
  const ids = traces.map(trace => trace.id);
  assert.equal(new Set(ids).size, ids.length);
  ids.forEach((id, i) => assert.equal(id, `t${String(i + 1).padStart(2, '0')}`));
  for (const trace of traces) {
    assert.match(trace.day, day, trace.id);
    assert.ok(trace.day >= meta.window.from && trace.day <= meta.window.to, `${trace.id} day inside the window`);
    assert.equal(trace.start, 0, trace.id);
    assert.ok(nonNegInt(trace.end), trace.id);
    assert.ok(AGENTS.includes(trace.rootAgent), `${trace.id} root agent`);
    if ('round' in trace) assert.match(trace.round, /^(Round \d+(–\d+)?|[A-Z][a-z]+( [a-z]+)?( – .+)?)$/, trace.id);
    assert.ok(Array.isArray(trace.spans) && trace.spans.length > 0, trace.id);
  }
  for (let i = 1; i < traces.length; i++) assert.ok(traces[i - 1].day <= traces[i].day, 'traces in time order');
});

test('every span is well formed, inside its trace, and its parent exists', () => {
  for (const trace of traces) {
    const byId = new Map();
    for (const span of trace.spans) {
      const where = `${trace.id}/${span.id}`;
      assert.match(span.id, /^s\d+$/, where);
      assert.ok(!byId.has(span.id), `${where} unique`);
      byId.set(span.id, span);
      assert.ok(KINDS.includes(span.kind), `${where} kind ${span.kind}`);
      assert.ok(STATUSES.includes(span.status), `${where} status ${span.status}`);
      assert.ok(AGENTS.includes(span.agent), `${where} agent ${span.agent}`);
      assert.ok(nonNegInt(span.start) && nonNegInt(span.end), `${where} times`);
      assert.ok(span.start <= span.end, `${where} start <= end`);
      assert.ok(span.end <= trace.end, `${where} ends inside the trace`);
      if ('model' in span) assert.match(span.model, /^[a-z0-9][a-z0-9.-]{1,40}$/, `${where} model`);
      if (span.kind === 'TOOL') {
        assert.ok(isTool(span.name), `${where} tool ${span.name} is allowlisted`);
        if (span.name === 'bash') assert.ok(BASH_CATEGORIES.includes(span.category), `${where} bash category`);
        else assert.ok(!('category' in span), `${where} only bash has a category`);
      }
      if (span.kind === 'AGENT') assert.equal(span.name, span.agent, where);
      if (span.kind === 'LLM' || span.kind === 'CHAIN') {
        assert.deepEqual(Object.keys(span.tokens), TOKEN_KEYS, `${where} token keys`);
        for (const key of TOKEN_KEYS) assert.ok(nonNegInt(span.tokens[key]), `${where} tokens.${key}`);
      } else {
        assert.ok(!('tokens' in span), `${where} only LLM and CHAIN spans carry tokens`);
      }
      if (span.kind === 'CHAIN') {
        assert.ok(Number.isInteger(span.steps) && span.steps >= 2, `${where} merged steps`);
        for (const [name, count] of Object.entries(span.tools)) assert.ok(isTool(name) && count > 0, `${where} merged tool ${name}`);
        for (const [name, count] of Object.entries(span.errors ?? {})) assert.ok(count <= (span.tools[name] ?? 0), `${where} errors <= calls`);
      }
    }
    const roots = trace.spans.filter(span => span.parent === null);
    assert.equal(roots.length, 1, `${trace.id} has one root`);
    assert.equal(roots[0].kind, 'AGENT', `${trace.id} root is an AGENT span`);
    assert.equal(roots[0].agent, trace.rootAgent, `${trace.id} root agent`);
    for (const span of trace.spans) {
      if (span.parent === null) continue;
      const parent = byId.get(span.parent);
      assert.ok(parent, `${trace.id}/${span.id} parent ${span.parent} exists`);
      assert.ok(trace.spans.indexOf(parent) < trace.spans.indexOf(span), `${trace.id}/${span.id} parent comes first`);
      if (span.kind === 'AGENT') assert.ok(parent.kind === 'AGENT' || (parent.kind === 'TOOL' && parent.name === 'task'), `${trace.id}/${span.id} subagents hang off a task call or an agent`);
      else assert.equal(parent.kind, 'AGENT', `${trace.id}/${span.id} steps and tools hang off an agent`);
    }
  }
});

test('nothing on the denylist and no cost fields are published', () => {
  for (const text of strings(data)) assert.doesNotMatch(text, DENY, JSON.stringify(text));
  assert.doesNotMatch(raw, DENY);
  if (USER.length >= 4) assert.ok(!raw.toLowerCase().includes(USER.toLowerCase()), 'no local account name');
  for (const key of keys({ traces, evaluations, rollups })) assert.doesNotMatch(key, /cost|price|usd|dollar|prompt|^title$|path|url|command|^(text|content|args|arguments)$/i, `key ${key}`);
});

test('evaluators are code checks and every evaluation points at a known trace and evaluator', () => {
  const evaluatorIds = new Set(evaluators.map(e => e.id));
  assert.equal(evaluatorIds.size, evaluators.length);
  for (const e of evaluators) {
    assert.equal(e.kind, 'code', e.id);
    for (const key of ['name', 'description', 'question']) assert.ok(typeof e[key] === 'string' && e[key].length > 10, `${e.id}.${key}`);
  }
  const traceIds = new Set(traces.map(trace => trace.id));
  const seen = new Set();
  for (const ev of evaluations) {
    const where = `${ev.trace}/${ev.evaluator}`;
    assert.ok(traceIds.has(ev.trace), `${where} trace`);
    assert.ok(evaluatorIds.has(ev.evaluator), `${where} evaluator`);
    assert.ok(!seen.has(where), `${where} once`);
    seen.add(where);
    assert.ok(ev.label === 'pass' || ev.label === 'fail' || (typeof ev.label === 'number' && Number.isFinite(ev.label)), `${where} label`);
    if ('score' in ev) assert.ok(typeof ev.score === 'number' && Number.isFinite(ev.score), `${where} score`);
    assert.ok(typeof ev.explanation === 'string' && ev.explanation.length > 0, `${where} explanation`);
  }
  assert.ok(traces.every(trace => seen.has(`${trace.id}/delegation_used`)), 'delegation_used scores every trace');
});

test('evaluations agree with the published traces', () => {
  const byTrace = new Map(traces.map(trace => [trace.id, trace]));
  for (const ev of evaluations) {
    const trace = byTrace.get(ev.trace);
    if (ev.evaluator === 'delegation_used') {
      const runs = trace.spans.filter(span => span.kind === 'AGENT' && span.parent !== null).length;
      assert.equal(ev.label, runs > 0 ? 'pass' : 'fail', ev.trace);
      assert.equal(runs, trace.subagentRuns, ev.trace);
    }
    if (ev.evaluator === 'tool_error_rate') {
      assert.equal(ev.score, Math.round(trace.toolErrors / trace.toolCalls * 1e4) / 1e4, ev.trace);
      assert.equal(ev.label, ev.score > 0.1 ? 'fail' : 'pass', ev.trace);
    }
    if (ev.evaluator === 'review_before_commit' || ev.evaluator === 'tests_run_before_commit') {
      assert.ok(trace.commits > 0, `${ev.trace} only scored when the trace commits`);
    }
    if (ev.evaluator === 'recovered_after_error') assert.ok(trace.toolErrors > 0, `${ev.trace} only scored after an error`);
  }
  for (const trace of traces.filter(t => t.commits > 0)) {
    const commitSpans = trace.spans.filter(span => span.category === 'git-commit' && span.status === 'ok').length;
    assert.equal(commitSpans, trace.commits, `${trace.id} commit steps are always kept`);
  }
});

test('trace totals and rollups agree with the published spans', () => {
  const toolCounts = {};
  const toolErrors = {};
  const tokensByAgent = {};
  const delegations = {};
  for (const trace of traces) {
    const tools = trace.spans.filter(span => span.kind === 'TOOL');
    const chains = trace.spans.filter(span => span.kind === 'CHAIN');
    const llms = trace.spans.filter(span => span.kind === 'LLM');
    assert.equal(tools.length + sum(chains.map(c => sum(Object.values(c.tools)))), trace.toolCalls, `${trace.id} tool calls`);
    assert.equal(llms.length + sum(chains.map(c => c.steps)), trace.llmSteps, `${trace.id} LLM steps`);
    for (const key of TOKEN_KEYS) {
      assert.equal(sum([...llms, ...chains].map(span => span.tokens[key])), trace.tokens[key], `${trace.id} tokens.${key}`);
    }
    for (const span of tools) {
      toolCounts[span.name] = (toolCounts[span.name] ?? 0) + 1;
      if (span.status === 'error') toolErrors[span.name] = (toolErrors[span.name] ?? 0) + 1;
    }
    for (const chain of chains) {
      for (const [name, n] of Object.entries(chain.tools)) toolCounts[name] = (toolCounts[name] ?? 0) + n;
      for (const [name, n] of Object.entries(chain.errors ?? {})) toolErrors[name] = (toolErrors[name] ?? 0) + n;
    }
    for (const span of [...llms, ...chains]) {
      const total = (tokensByAgent[span.agent] ??= Object.fromEntries(TOKEN_KEYS.map(k => [k, 0])));
      for (const key of TOKEN_KEYS) total[key] += span.tokens[key];
    }
    for (const span of trace.spans.filter(s => s.kind === 'AGENT' && s.parent !== null)) {
      delegations[span.agent] = (delegations[span.agent] ?? 0) + 1;
    }
  }
  assert.deepEqual(Object.fromEntries(Object.entries(rollups.tools).map(([name, t]) => [name, t.n])), toolCounts);
  for (const [name, t] of Object.entries(rollups.tools)) {
    assert.equal(t.errors, toolErrors[name] ?? 0, `${name} errors`);
    assert.ok(t.p50 <= t.p90 && t.p90 <= t.p99, `${name} percentiles ordered`);
  }
  for (const [agent, totals] of Object.entries(tokensByAgent)) assert.deepEqual(rollups.byAgent[agent].tokens, totals, `${agent} tokens`);
  assert.deepEqual(rollups.delegations, delegations);

  const perDay = {};
  for (const trace of traces) perDay[trace.day] = (perDay[trace.day] ?? 0) + 1;
  assert.deepEqual(Object.fromEntries(Object.entries(rollups.byDay).map(([d, v]) => [d, v.traces])), perDay);
  assert.equal(sum(Object.values(rollups.byDay).map(v => v.toolCalls)), sum(traces.map(t => t.toolCalls)));
  assert.equal(sum(Object.values(rollups.byRound)), traces.length);

  for (const kind of ['AGENT', 'LLM', 'TOOL']) {
    const p = rollups.latencyByKind[kind];
    assert.ok(p.n > 0 && p.p50 <= p.p90 && p.p90 <= p.p99, `${kind} percentiles`);
  }
  assert.equal(rollups.latencyByKind.TOOL.n, sum(Object.values(toolCounts)));
  assert.equal(rollups.latencyByKind.LLM.n, sum(traces.map(t => t.llmSteps)));
  assert.equal(sum(Object.values(rollups.toolCallsPerStep.histogram)), rollups.latencyByKind.LLM.n);
  const bash = sum(Object.values(rollups.bashCategories));
  assert.equal(bash, toolCounts.bash);
});

test('the homepage summary is cut from the full file: same traces, counts, window and pass/fail evaluations', async () => {
  const { topic } = await import('../web/lab/obs-data.js');
  const summaryRaw = readFileSync(new URL('../web/lab/data/agent-traces-summary.json', import.meta.url), 'utf8');
  const summary = JSON.parse(summaryRaw);
  assert.ok(Buffer.byteLength(summaryRaw) < 40 * 1024, `${Buffer.byteLength(summaryRaw)} bytes`);
  assert.deepEqual(Object.keys(summary), ['meta', 'evaluators', 'traces', 'evaluations']);
  assert.deepEqual(summary.meta.window, meta.window);
  assert.equal(summary.meta.traces, traces.length);
  assert.deepEqual(summary.evaluators, evaluators.map(({ id, name, kind }) => ({ id, name, kind })));
  assert.deepEqual(summary.traces, traces.map(t => ({ id: t.id, day: t.day, topic: topic(t), toolCalls: t.toolCalls, toolErrors: t.toolErrors })));
  assert.deepEqual(summary.evaluations, evaluations.filter(e => e.label === 'pass' || e.label === 'fail').map(({ trace, evaluator, label }) => ({ trace, evaluator, label })));
  for (const text of strings(summary)) assert.doesNotMatch(text, DENY, JSON.stringify(text));
  if (USER.length >= 4) assert.ok(!summaryRaw.toLowerCase().includes(USER.toLowerCase()), 'no local account name');
});

// The agent observability data (web/lab/data/agent-traces.json, its homepage
// summary and the OpenInference span lines), exported by
// scripts/telemetry/export_traces.py from the OpenCode sessions that built this
// site. Checks shape, span integrity, the privacy allowlists and denylist, the
// evaluators and their thresholds, and that the rollups and the other two files
// agree with the published spans. Node only (no DOM).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { userInfo } from 'node:os';

const raw = readFileSync(new URL('../web/lab/data/agent-traces.json', import.meta.url), 'utf8');
const jsonlRaw = readFileSync(new URL('../web/lab/data/agent-traces.openinference.jsonl', import.meta.url), 'utf8');
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
const ERROR_CLASSES = ['timeout', 'not_found', 'permission', 'test_failure', 'bad_arguments', 'network', 'other'];
const EVALUATOR_IDS = ['tool_error_rate', 'recovered_after_error', 'delegation_fit', 'review_before_commit',
  'tests_run_before_commit', 'verified_after_last_edit', 'stuck_loop', 'review_addressed', 'latency_budget',
  'tokens_per_tool_call', 'parallel_fanout', 'cache_reuse', 'error_class'];
const DIRECTIONS = { atMost: (s, t) => s <= t, below: (s, t) => s < t, atLeast: (s, t) => s >= t };
const EDIT_TOOLS = ['edit', 'write'];
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

test('the files stay within their size budgets', () => {
  assert.ok(Buffer.byteLength(raw) <= 360_000, `${Buffer.byteLength(raw)} bytes`);
  assert.ok(Buffer.byteLength(jsonlRaw) <= 480_000, `${Buffer.byteLength(jsonlRaw)} bytes of OpenInference lines (budget 480 KB raw)`);
});

test('meta describes the export', () => {
  for (const key of ['title', 'source', 'generated', 'window', 'sessions', 'subagentSessions', 'spans', 'droppedSpans', 'notes', 'thresholds', 'largeTrace', 'errorClasses', 'files']) {
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
  assert.deepEqual(meta.errorClasses, ERROR_CLASSES);
  assert.deepEqual(meta.files, { openinference: 'agent-traces.openinference.jsonl', summary: 'agent-traces-summary.json' });
  assert.ok(nonNegInt(meta.largeTrace.minToolCalls) && nonNegInt(meta.largeTrace.minEdits));
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
    assert.match(trace.session, /^S\d+$/, `${trace.id} session`);
    assert.ok(typeof trace.topic === 'string' && trace.topic.length > 2, `${trace.id} topic`);
    assert.equal(trace.agentPath[0], trace.rootAgent, `${trace.id} agent path starts at the root agent`);
    assert.equal(new Set(trace.agentPath).size, trace.agentPath.length, `${trace.id} agent path is distinct`);
    assert.ok(trace.agentPath.every(a => AGENTS.includes(a)), `${trace.id} agent path names`);
    if ('round' in trace) assert.match(trace.round, /^(Round \d+(–\d+)?|[A-Z][a-z]+( [a-z]+)?( – .+)?)$/, trace.id);
    assert.ok(Array.isArray(trace.spans) && trace.spans.length > 0, trace.id);
  }
  for (let i = 1; i < traces.length; i++) assert.ok(traces[i - 1].day <= traces[i].day, 'traces in time order');
  // sessions are numbered S1, S2, ... in the order they first appear
  const order = [...new Set(traces.map(t => t.session))];
  assert.deepEqual(order, order.map((_, i) => `S${i + 1}`));
  assert.equal(order.length, meta.sessions);
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
        if (span.status === 'error') assert.ok(ERROR_CLASSES.includes(span.errorClass), `${where} error class`);
        else assert.ok(!('errorClass' in span), `${where} only failed calls have an error class`);
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
        assert.equal(sum(Object.values(span.errorClasses ?? {})), sum(Object.values(span.errors ?? {})), `${where} every merged error has a class`);
        for (const c of Object.keys(span.errorClasses ?? {})) assert.ok(ERROR_CLASSES.includes(c), `${where} class ${c}`);
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
  for (const key of keys({ traces, evaluations, rollups })) {
    if (key === 'agentPath') continue;
    assert.doesNotMatch(key, /cost|price|usd|dollar|prompt|^title$|path|url|command|^messages?$|^error$|^(text|content|args|arguments|input\.value|output\.value)$/i, `key ${key}`);
  }
});

test('evaluators are code checks with published thresholds, and every evaluation points at a known trace and evaluator', () => {
  assert.deepEqual(evaluators.map(e => e.id), EVALUATOR_IDS);
  const byId = new Map(evaluators.map(e => [e.id, e]));
  for (const e of evaluators) {
    assert.equal(e.kind, 'code', e.id);
    for (const key of ['name', 'description', 'question']) assert.ok(typeof e[key] === 'string' && e[key].length > 10, `${e.id}.${key}`);
    assert.ok(['pass/fail', 'number', 'category'].includes(e.output), `${e.id}.output`);
    if (e.output === 'pass/fail') {
      assert.ok(typeof e.threshold === 'number' && e.direction in DIRECTIONS, `${e.id} threshold and direction`);
      assert.deepEqual(meta.thresholds[e.id], { threshold: e.threshold, direction: e.direction }, `${e.id} meta.thresholds`);
    } else {
      assert.ok(!('threshold' in e) && !(e.id in meta.thresholds), `${e.id} has no threshold`);
    }
  }
  assert.deepEqual(byId.get('error_class').classes, ERROR_CLASSES);
  assert.deepEqual(byId.get('delegation_fit').scope, meta.largeTrace);
  const traceIds = new Set(traces.map(trace => trace.id));
  const seen = new Set();
  for (const ev of evaluations) {
    const where = `${ev.trace}/${ev.evaluator}`;
    assert.ok(traceIds.has(ev.trace), `${where} trace`);
    assert.ok(byId.has(ev.evaluator), `${where} evaluator`);
    assert.ok(!seen.has(where), `${where} once`);
    seen.add(where);
    assert.ok(typeof ev.score === 'number' && Number.isFinite(ev.score), `${where} numeric score`);
    const e = byId.get(ev.evaluator);
    if (e.output === 'pass/fail') {
      assert.ok(ev.label === 'pass' || ev.label === 'fail', `${where} label`);
      assert.equal(ev.label, DIRECTIONS[e.direction](ev.score, e.threshold) ? 'pass' : 'fail', `${where} label follows the threshold`);
    } else if (e.output === 'number') {
      assert.equal(ev.label, ev.score, `${where} number label`);
    } else {
      assert.ok(ERROR_CLASSES.includes(ev.label), `${where} category`);
    }
    assert.ok(typeof ev.explanation === 'string' && ev.explanation.length > 0, `${where} explanation`);
  }
  assert.ok(traces.every(trace => seen.has(`${trace.id}/latency_budget`) === trace.llmSteps > 0), 'latency_budget scores every trace with model steps');
});

// error classes per trace from the published spans (TOOL errorClass + CHAIN errorClasses)
const classesOf = trace => {
  const out = {};
  for (const span of trace.spans) {
    if (span.kind === 'TOOL' && span.status === 'error') out[span.errorClass] = (out[span.errorClass] ?? 0) + 1;
    for (const [c, n] of Object.entries(span.errorClasses ?? {})) out[c] = (out[c] ?? 0) + n;
  }
  return out;
};
const editCalls = trace => sum(trace.spans.map(span => span.kind === 'TOOL' ? Number(EDIT_TOOLS.includes(span.name))
  : span.kind === 'CHAIN' ? sum(EDIT_TOOLS.map(n => span.tools[n] ?? 0)) : 0));
const fanout = trace => {
  const runs = trace.spans.filter(span => span.kind === 'AGENT' && span.parent !== null);
  return Math.max(0, ...runs.map(a => runs.filter(b => b === a || (b.start <= a.start && a.start < b.end)).length));
};

// Tool calls made inside a subagent run: TOOL spans and CHAIN tool counts whose nearest
// AGENT ancestor is not the trace's root agent.
const subagentCalls = trace => {
  const byId = new Map(trace.spans.map(span => [span.id, span]));
  const inSubagent = span => {
    let p = byId.get(span.parent);
    while (p && p.kind !== 'AGENT') p = byId.get(p.parent);
    return Boolean(p && p.parent !== null);
  };
  return sum(trace.spans.filter(inSubagent).map(span => (span.kind === 'TOOL' ? 1 : span.kind === 'CHAIN' ? sum(Object.values(span.tools)) : 0)));
};

test('evaluations agree with the published traces', () => {
  const byTrace = new Map(traces.map(trace => [trace.id, trace]));
  const scored = new Map(EVALUATOR_IDS.map(id => [id, new Set()]));
  for (const ev of evaluations) {
    const trace = byTrace.get(ev.trace);
    scored.get(ev.evaluator).add(ev.trace);
    if (ev.evaluator === 'delegation_fit') {
      assert.equal(ev.score, Math.round(subagentCalls(trace) / trace.toolCalls * 1e4) / 1e4, ev.trace);
      assert.ok(trace.toolCalls >= meta.largeTrace.minToolCalls || editCalls(trace) >= meta.largeTrace.minEdits, `${ev.trace} is large`);
    }
    if (ev.evaluator === 'tool_error_rate') {
      assert.equal(ev.score, Math.round(trace.toolErrors / trace.toolCalls * 1e4) / 1e4, ev.trace);
    }
    if (['review_before_commit', 'tests_run_before_commit', 'review_addressed'].includes(ev.evaluator)) {
      assert.ok(trace.commits > 0, `${ev.trace} ${ev.evaluator} only scored when the trace commits`);
    }
    if (['review_before_commit', 'tests_run_before_commit', 'verified_after_last_edit'].includes(ev.evaluator)) {
      assert.ok(ev.score === 0 || ev.score === 1, `${ev.trace} ${ev.evaluator} boolean score`);
    }
    if (ev.evaluator === 'verified_after_last_edit') assert.ok(editCalls(trace) > 0, `${ev.trace} only scored after an edit`);
    if (ev.evaluator === 'recovered_after_error') assert.ok(trace.toolErrors > 0, `${ev.trace} only scored after an error`);
    if (ev.evaluator === 'stuck_loop') assert.ok(nonNegInt(ev.score) && ev.score <= trace.toolErrors, ev.trace);
    if (ev.evaluator === 'parallel_fanout') assert.equal(ev.score, fanout(trace), ev.trace);
    if (ev.evaluator === 'cache_reuse') {
      const t = trace.tokens;
      assert.equal(ev.score, Math.round(t.cacheRead / (t.input + t.cacheRead + t.cacheWrite) * 1e4) / 1e4, ev.trace);
    }
    if (ev.evaluator === 'error_class') {
      const classes = classesOf(trace);
      const top = Object.entries(classes).sort((a, b) => b[1] - a[1] || ERROR_CLASSES.indexOf(a[0]) - ERROR_CLASSES.indexOf(b[0]))[0];
      assert.deepEqual([ev.label, ev.score], top, ev.trace);
    }
  }
  for (const trace of traces) {
    const has = id => scored.get(id).has(trace.id);
    assert.equal(has('tool_error_rate'), trace.toolCalls > 0, `${trace.id} tool_error_rate`);
    assert.equal(has('stuck_loop'), trace.toolCalls > 0, `${trace.id} stuck_loop`);
    assert.equal(has('error_class'), trace.toolErrors > 0, `${trace.id} error_class`);
    assert.equal(has('parallel_fanout'), trace.subagentRuns > 0, `${trace.id} parallel_fanout`);
    assert.equal(has('delegation_fit'), trace.toolCalls >= meta.largeTrace.minToolCalls || editCalls(trace) >= meta.largeTrace.minEdits, `${trace.id} delegation_fit`);
    assert.equal(has('review_before_commit'), trace.commits > 0, `${trace.id} review_before_commit`);
    assert.equal(sum(Object.values(classesOf(trace))), trace.toolErrors, `${trace.id} every error has a class`);
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

  const classes = Object.fromEntries(ERROR_CLASSES.map(c => [c, 0]));
  for (const trace of traces) for (const [c, n] of Object.entries(classesOf(trace))) classes[c] += n;
  assert.deepEqual(rollups.errorClasses, classes);
  assert.equal(sum(Object.values(classes)), sum(traces.map(t => t.toolErrors)));

  for (const [id, c] of Object.entries(rollups.checks)) {
    const rows = evaluations.filter(e => e.evaluator === id);
    assert.deepEqual(c, { pass: rows.filter(e => e.label === 'pass').length, fail: rows.filter(e => e.label === 'fail').length, notScored: traces.length - rows.length }, id);
  }
  assert.deepEqual(Object.keys(rollups.checks), evaluators.filter(e => e.output === 'pass/fail').map(e => e.id));
});

test('sessions, agent paths and the agent graph agree with the published spans', () => {
  const sessions = {};
  for (const trace of traces) {
    const row = (sessions[trace.session] ??= { traces: 0, days: [], toolCalls: 0, toolErrors: 0, subagentRuns: 0 });
    row.traces += 1;
    if (!row.days.includes(trace.day)) row.days.push(trace.day);
    row.toolCalls += trace.toolCalls;
    row.toolErrors += trace.toolErrors;
    row.subagentRuns += trace.subagentRuns;
  }
  assert.deepEqual(Object.keys(rollups.sessions), Object.keys(sessions));
  for (const [id, row] of Object.entries(sessions)) {
    const { checks, ...rest } = rollups.sessions[id];
    assert.deepEqual(rest, row, id);
    for (const [evaluator, c] of Object.entries(checks)) {
      const rows = evaluations.filter(e => e.evaluator === evaluator && traces.find(t => t.id === e.trace).session === id);
      assert.equal(c.scored, rows.length, `${id} ${evaluator}`);
      assert.equal(c.pass, rows.filter(e => e.label === 'pass').length, `${id} ${evaluator}`);
      assert.equal(c.rate, Math.round(c.pass / c.scored * 1e4) / 1e4, `${id} ${evaluator}`);
    }
  }

  const edges = {};
  for (const trace of traces) {
    const byId = new Map(trace.spans.map(span => [span.id, span]));
    const local = {};
    const agents = trace.spans.filter(span => span.kind === 'AGENT');
    for (const span of agents.filter(s => s.parent !== null)) {
      const key = `${byId.get(span.parent).agent}>${span.agent}`;
      local[key] = (local[key] ?? 0) + 1;
      edges[key] = (edges[key] ?? 0) + 1;
    }
    assert.deepEqual(Object.fromEntries(trace.agentEdges.map(e => [`${e.from}>${e.to}`, e.count])), local, `${trace.id} agentEdges`);
    assert.deepEqual(new Set(trace.agentPath), new Set(agents.map(s => s.agent)), `${trace.id} agentPath has every agent`);
  }
  assert.deepEqual(Object.fromEntries(rollups.agentGraph.edges.map(e => [`${e.from}>${e.to}`, e.count])), edges);
  assert.equal(sum(rollups.agentGraph.edges.map(e => e.count)), sum(Object.values(rollups.delegations)));
  for (const node of rollups.agentGraph.nodes) {
    const a = rollups.byAgent[node.agent];
    assert.deepEqual([node.runs, node.toolCalls, node.toolErrors], [a.runs, a.toolCalls, a.toolErrors], node.agent);
    assert.ok(node.spans >= node.runs + node.toolCalls, node.agent);
  }
});

test('the OpenInference lines mirror the published spans and carry no text', () => {
  const lines = jsonlRaw.trimEnd().split('\n');
  assert.equal(lines.length, meta.publishedSpans);
  const spans = new Map(traces.flatMap(t => t.spans.map(s => [`${t.id}.${s.id}`, { trace: t, span: s }])));
  const ATTRS = ['openinference.span.kind', 'session.id', 'agent.name', 'tool.name', 'llm.model_name', 'llm.token_count.prompt',
    'llm.token_count.completion', 'llm.token_count.total', 'llm.token_count.prompt_details.cache_read',
    'llm.token_count.prompt_details.cache_write', 'llm.token_count.completion_details.reasoning', 'error.class', 'error.count'];
  const iso = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
  const seen = new Set();
  for (const line of lines) {
    const row = JSON.parse(line);
    assert.deepEqual(Object.keys(row), ['trace_id', 'span_id', 'parent_id', 'name', 'span_kind', 'start_time', 'end_time', 'status_code', 'attributes']);
    const hit = spans.get(row.span_id);
    assert.ok(hit, row.span_id);
    seen.add(row.span_id);
    const { trace, span } = hit;
    assert.equal(row.trace_id, trace.id);
    assert.equal(row.parent_id, span.parent === null ? null : `${trace.id}.${span.parent}`);
    assert.equal(row.name, span.name);
    assert.equal(row.span_kind, span.kind);
    // A CHAIN with failed calls is ERROR in the file (the JSON keeps it "ok" with its counts).
    const failed = span.kind === 'CHAIN' ? sum(Object.values(span.errors ?? {})) : 0;
    assert.equal(row.status_code, span.status === 'error' || failed ? 'ERROR' : 'OK');
    assert.match(row.start_time, iso);
    assert.match(row.end_time, iso);
    const epoch = Date.parse(`${trace.day}T00:00:00Z`);
    assert.equal(Date.parse(row.start_time) - epoch, span.start, `${row.span_id} start offset`);
    assert.equal(Date.parse(row.end_time) - epoch, span.end, `${row.span_id} end offset`);
    const a = row.attributes;
    for (const key of Object.keys(a)) assert.ok(ATTRS.includes(key) || /^error\.class\.[a-z_]+$/.test(key), `${row.span_id} attribute ${key}`);
    assert.equal(a['error.count'], failed || undefined, `${row.span_id} error.count`);
    const perClass = Object.fromEntries(Object.entries(a).filter(([key]) => key.startsWith('error.class.')).map(([key, n]) => [key.slice(12), n]));
    assert.deepEqual(perClass, span.kind === 'CHAIN' && failed ? span.errorClasses : {}, `${row.span_id} error.class.<class>`);
    assert.equal(a['openinference.span.kind'], span.kind);
    assert.equal(a['session.id'], trace.session);
    assert.equal(a['agent.name'], span.agent);
    assert.equal(a['tool.name'], span.kind === 'TOOL' ? span.name : undefined);
    assert.equal(a['llm.model_name'], span.model);
    assert.equal(a['error.class'], span.errorClass);
    if (span.tokens) {
      const k = span.tokens;
      assert.equal(a['llm.token_count.prompt'], k.input + k.cacheRead + k.cacheWrite);
      assert.equal(a['llm.token_count.completion'], k.output + k.reasoning);
      assert.equal(a['llm.token_count.total'], k.input + k.cacheRead + k.cacheWrite + k.output + k.reasoning);
      assert.equal(a['llm.token_count.prompt_details.cache_read'], k.cacheRead);
      assert.equal(a['llm.token_count.prompt_details.cache_write'], k.cacheWrite);
      assert.equal(a['llm.token_count.completion_details.reasoning'], k.reasoning);
    } else {
      assert.ok(!('llm.token_count.total' in a), row.span_id);
    }
    for (const text of strings(row)) assert.doesNotMatch(text, DENY, JSON.stringify(text));
  }
  assert.equal(seen.size, spans.size, 'every published span has a line');
  // No failure is lost: a failed TOOL row counts 1, a CHAIN row its error.count.
  const rows = lines.map(line => JSON.parse(line));
  const failedInFile = rows.filter(r => r.span_kind === 'TOOL' && r.status_code === 'ERROR').length
    + sum(rows.filter(r => r.span_kind === 'CHAIN').map(r => r.attributes['error.count'] ?? 0));
  const toolErrors = sum(traces.map(t => t.toolErrors));
  assert.equal(failedInFile, toolErrors, 'the file holds every failed tool call');
  assert.equal(failedInFile, sum(Object.values(rollups.errorClasses)));
  assert.equal(toolErrors, 162, 'the current export: 162 failed calls');
  if (USER.length >= 4) assert.ok(!jsonlRaw.toLowerCase().includes(USER.toLowerCase()), 'no local account name');
});

test('the homepage summary is cut from the full file: same traces, counts, window and pass/fail evaluations', () => {
  const summaryRaw = readFileSync(new URL('../web/lab/data/agent-traces-summary.json', import.meta.url), 'utf8');
  const summary = JSON.parse(summaryRaw);
  assert.ok(Buffer.byteLength(summaryRaw) < 30 * 1024, `${Buffer.byteLength(summaryRaw)} bytes`);
  assert.deepEqual(Object.keys(summary), ['meta', 'evaluators', 'traces', 'evaluations']);
  assert.deepEqual(summary.meta.window, meta.window);
  assert.equal(summary.meta.traces, traces.length);
  assert.deepEqual(summary.evaluators, evaluators.map(({ id, name, kind, output }) => ({ id, name, kind, output })));
  assert.deepEqual(summary.traces, traces.map(t => ({ id: t.id, day: t.day, topic: t.topic, toolCalls: t.toolCalls, toolErrors: t.toolErrors })));
  const passFail = evaluators.filter(e => e.output === 'pass/fail').map(e => e.id);
  assert.deepEqual(Object.keys(summary.evaluations), passFail);
  for (const id of passFail) {
    assert.deepEqual(summary.evaluations[id], Object.fromEntries(evaluations.filter(e => e.evaluator === id).map(e => [e.trace, e.label])), id);
  }
  for (const text of strings(summary)) assert.doesNotMatch(text, DENY, JSON.stringify(text));
  if (USER.length >= 4) assert.ok(!summaryRaw.toLowerCase().includes(USER.toLowerCase()), 'no local account name');
});

test('the topic map in web/lab/obs-data.js agrees with the exporter topics', async () => {
  const { topic, TOPICS } = await import('../web/lab/obs-data.js');
  for (const t of traces) {
    assert.equal(topic(t), t.topic, `${t.id} ${t.round}`);
    assert.equal(TOPICS[t.round], t.topic, `${t.id}: the fallback map has ${t.round}`);
    assert.equal(topic({ round: t.round }), t.topic, `${t.id}: a record without a topic falls back to the map`);
  }
});

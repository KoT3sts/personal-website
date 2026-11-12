// Agent observability page (web/lab/agent-observability.html): security headers, links,
// the static numbers written into the page, and the pure helpers in obs-data.js on small
// fixtures and on the real export (web/lab/data/agent-traces.json). Node only, no DOM.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import * as D from '../web/lab/obs-data.js';

const web = new URL('../web/', import.meta.url);
const read = path => readFileSync(new URL(path, web), 'utf8');
const page = read('lab/agent-observability.html');
const lab = read('lab/sentiment-eval.html');
const css = read('lab/observability.css');
const JS = ['lab/observability.js', 'lab/obs-data.js', 'lab/obs-charts.js'];
const scripts = Object.fromEntries(JS.map(file => [file, read(file)]));
const data = JSON.parse(read('lab/data/agent-traces.json'));
const index = D.evalIndex(data.evaluations);

const entities = { '&amp;': '&', '&quot;': '"', '&#x27;': "'", '&lt;': '<', '&gt;': '>', '&nbsp;': ' ' };
const plain = html => html.replace(/<!--[\s\S]*?-->/g, '').replace(/<(script|style)\b[\s\S]*?<\/\1>/g, ' ')
  .replace(/<\/?(?:a|span|strong|em|code|b|i)(?:\s[^>]*)?>/g, '').replace(/<[^>]+>/g, ' ')
  .replace(/&(?:amp|quot|#x27|lt|gt|nbsp);/g, match => entities[match]).replace(/\s+/g, ' ').trim();
const kpi = name => page.match(new RegExp(`data-kpi="${name}"[^>]*>([^<]+)<`))?.[1];

// ---- the page ----------------------------------------------------------------------

test('the same strict CSP and referrer policy as the other lab pages; one module script, no inline code or styles', () => {
  const csp = html => html.match(/<meta http-equiv="Content-Security-Policy" content="[^"]+">/)[0];
  assert.equal(csp(page), csp(lab), 'CSP copied exactly from sentiment-eval.html');
  assert.match(page, /<meta name="referrer" content="strict-origin-when-cross-origin">/);
  assert.ok(page.indexOf('Content-Security-Policy') < page.indexOf('<link'), 'the policy comes before any resource');
  assert.deepEqual([...page.matchAll(/<script\b[^>]*>/g)].map(m => m[0]), ['<script type="module" src="./observability.js">']);
  assert.doesNotMatch(page, /\sstyle="|\son[a-z]+="|javascript:/i);
  for (const sheet of ['../project.css', './lab.css', './observability.css']) assert.ok(page.includes(`<link rel="stylesheet" href="${sheet}">`), sheet);
});

test('title, one h1, the point of the page, and the honest scope', () => {
  assert.match(page, /<title>Agent observability — Cesar Tortolero<\/title>/);
  assert.equal(page.match(/<h1[\s>]/g).length, 1);
  assert.match(page, /<h1 id="obs-title" class="lab-title">Watch the agents work\.<\/h1>/);
  const text = plain(page);
  assert.ok(text.includes('Real traces from the AI agents that built this site: every model call, allowlisted tool call and handoff, with code evaluators on top.'));
  assert.doesNotMatch(page, /every model call, tool call/, 'tool calls outside the allowlist are dropped, so the claim says allowlisted');
  assert.ok(text.includes(`calls to tools outside an allowlist are dropped (${data.meta.droppedSpans} of them)`));
  for (const fact of ['OpenCode’s local session store', 'November 7–12, 2026', 'Prompts, responses, file contents and commands are never published',
    'Model latency is estimated from message timings', 'there is no LLM judge', 'most spans are merged into summary spans']) {
    assert.ok(text.includes(fact), fact);
  }
  assert.equal(new URL(page.match(/<link rel="canonical" href="([^"]+)">/)[1]).pathname, '/lab/agent-observability.html');
});

test('links: back to Work, both agent pages, the raw data; every relative link resolves', () => {
  assert.match(page, /<a class="cs-back" href="\.\.\/#work">/);
  for (const href of ['../#work', './evaluating-agents.html', './build-trace.html', './data/agent-traces.json']) assert.ok(page.includes(`href="${href}"`), href);
  assert.match(page, /<nav class="cs-pager"[\s\S]*How I evaluate agents[\s\S]*The agent run behind this site[\s\S]*<\/nav>/);
  assert.match(page, /<a href="\.\.\/#work">Back to Work<\/a>/);
  for (const [, ref] of page.matchAll(/\s(?:href|src)="(\.{1,2}\/[^"#]*)/g)) {
    const target = new URL(ref, new URL('lab/agent-observability.html', web));
    assert.ok(statSync(target.pathname.endsWith('/') ? new URL('index.html', target) : target), `${ref} exists`);
  }
  assert.match(page, /<noscript>[\s\S]*href="\.\/data\/agent-traces\.json"[\s\S]*<\/noscript>/, 'no-JS readers get the raw file');
});

test('the KPI numbers written into the page equal the values computed from the JSON', () => {
  const k = D.kpis(data);
  assert.equal(kpi('traces'), D.formatInt(k.traces));
  assert.equal(kpi('published'), D.formatInt(k.published));
  assert.equal(kpi('spans'), D.formatInt(k.spans));
  assert.equal(kpi('llmSteps'), D.formatInt(k.llmSteps));
  assert.equal(kpi('toolCalls'), D.formatInt(k.toolCalls));
  assert.equal(kpi('subagentRuns'), D.formatInt(k.subagentRuns));
  assert.equal(kpi('toolErrors'), D.formatInt(k.toolErrors));
  assert.equal(kpi('errorRate'), D.formatPct(k.errorRate));
  assert.equal(`${kpi('llmP50')} s`, D.formatMs(k.llmP50));
  assert.equal(`${kpi('llmP90')} s`, D.formatMs(k.llmP90));
  assert.equal(kpi('tokens'), D.formatTokens(k.tokens));
  assert.equal(kpi('cacheRead'), D.formatTokens(k.cacheRead));
  assert.equal(kpi('requests'), String(k.requests));
  assert.equal(kpi('compactions'), String(k.compactions));
  assert.equal(k.requests + k.compactions, k.traces);
  assert.equal(k.compactions, 1, 'the page words the compaction in the singular');
  assert.match(page, /<span data-kpi="compactions">1<\/span> compaction<\/span>/);
  assert.equal(kpi('dropped'), String(data.meta.droppedSpans));
  assert.ok(k.cacheShare > 0.9, 'cache reads dominate, as the unit line says');
  // the count-up target matches the text it ends on
  for (const [, count, digits, suffix, text] of page.matchAll(/data-count="([\d.]+)"(?: data-digits="(\d)")?(?: data-suffix="([^"]*)")?>([^<]+)</g)) {
    const value = Number(count);
    assert.equal(digits ? `${value.toFixed(Number(digits))}${suffix || ''}` : `${D.formatInt(value)}${suffix || ''}`, text, `count-up ${count}`);
  }
  assert.match(page, new RegExp(`All ${data.traces.length} traces · every span`));
  assert.equal(data.traces.length, data.meta.traces);
});

test('filters list every day and root agent in the data; the notes repeat the exported counts', () => {
  const days = [...page.matchAll(/name="day" id="[^"]+" value="(\d{4}-\d{2}-\d{2})"/g)].map(m => m[1]);
  assert.deepEqual(days, [...new Set(data.traces.map(t => t.day))].sort());
  const agents = [...page.matchAll(/name="agent" id="[^"]+" value="([a-z-]+)"/g)].map(m => m[1]).filter(a => a !== 'all');
  assert.deepEqual(agents.sort(), [...new Set(data.traces.map(t => t.rootAgent))].sort());
  const text = plain(page);
  assert.ok(text.includes(`${D.formatInt(data.meta.publishedSpans)} of ${D.formatInt(data.meta.spans)} spans are published`));
  const requests = data.traces.filter(t => t.rootAgent !== 'compaction');
  const compactions = data.traces.filter(t => t.rootAgent === 'compaction');
  assert.ok(text.includes(`${requests.length} requests and one automatic context compaction in five sessions, with ${data.meta.subagentSessions} subagent sessions`));
  assert.equal(compactions.length, 1);
  assert.ok(text.includes(`One row per request I gave the agents, except #${Number(compactions[0].id.slice(1))}, an automatic context compaction.`));
  assert.ok(text.includes(`Calls to tools outside an allowlist are dropped: ${data.meta.droppedSpans} of them.`));
  assert.doesNotMatch(text, new RegExp(`\\b${data.traces.length} requests`), 'the compaction is not counted as a request');
  assert.equal(data.meta.sessions, 5);
  assert.equal(data.meta.window.from, '2026-11-07');
  assert.equal(data.meta.window.to, '2026-11-12');
});

test('the evaluator notes carry the exported pass/fail counts, in the exporter’s order', () => {
  const counts = D.evaluatorCounts(data.evaluators, data.evaluations);
  const items = [...page.matchAll(/<li data-eval="([a-z_]+)">([\s\S]*?)<\/li>/g)];
  assert.deepEqual(items.map(m => m[1]), data.evaluators.map(e => e.id));
  for (const [, id, body] of items) {
    const c = counts.find(x => x.id === id);
    const e = data.evaluators.find(x => x.id === id);
    assert.ok(body.includes(`<h3>${e.name}</h3>`), `${id} name`);
    assert.ok(body.includes(e.question), `${id} question`);
    const num = key => body.match(new RegExp(`<span data-${key}>([^<]+)</span>`))?.[1];
    assert.equal(num('scored'), String(c.scored), `${id} scored`);
    if (id === 'tokens_per_tool_call') {
      assert.equal(num('median'), D.formatInt(c.median));
      assert.equal(num('min'), D.formatInt(c.min));
      assert.equal(num('max'), D.formatInt(c.max));
    } else {
      assert.equal(num('pass'), String(c.pass), `${id} pass`);
      assert.equal(num('fail'), String(c.fail), `${id} fail`);
    }
  }
  const tools = data.traces.filter(t => t.toolCalls > 0).length;
  assert.match(plain(page), new RegExp(`${['Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'][data.traces.length - tools]} traces made no tool call`));
  assert.match(plain(page), /looks back only to the previous commit in the same session/, 'review_before_commit carries its caveat');
});

test('no round labels in the visible page; every exported label has a plain-words topic', () => {
  assert.doesNotMatch(plain(page), /\brounds?\s*\d/i);
  assert.doesNotMatch(page, /rounds 4–5/i);
  for (const trace of data.traces) assert.notEqual(D.topic(trace), 'site work', `${trace.id} ${trace.round}`);
  for (const value of Object.values(D.TOPICS)) assert.doesNotMatch(value, /round|\d/i);
  for (const source of Object.values(scripts)) assert.doesNotMatch(source.replace(/export const TOPICS = \{[\s\S]*?\};/, ''), /rounds? \d/i);
});

// ---- the scripts --------------------------------------------------------------------

test('scripts fetch only the same-origin JSON and never build HTML from strings', () => {
  const all = Object.values(scripts).join('\n');
  assert.equal(D.DATA_URL, './data/agent-traces.json');
  assert.equal((all.match(/\bfetch\(/g) || []).length, 1, 'one fetch');
  assert.match(scripts['lab/observability.js'], /window\.fetch\(D\.DATA_URL, \{ credentials: 'same-origin' \}\)/);
  assert.doesNotMatch(all, /https?:|\/\/[a-z0-9.-]+\.[a-z]{2,}|XMLHttpRequest|WebSocket|EventSource|sendBeacon|import\(/i);
  assert.doesNotMatch(all, /innerHTML|outerHTML|insertAdjacentHTML|document\.write|\beval\(|new Function|setAttribute\('style'|DOMParser/);
  for (const [file, source] of Object.entries(scripts)) {
    for (const [, spec] of source.matchAll(/^import .* from '([^']+)';$/gm)) assert.match(spec, /^\.\/obs-[a-z]+\.js$/, `${file} imports ${spec}`);
  }
});

test('JavaScript stays inside the budget; the filter count and the loading status are the only live regions', () => {
  const bytes = Object.values(scripts).reduce((n, source) => n + Buffer.byteLength(source), 0);
  assert.ok(bytes <= 44_000, `${bytes} bytes of JavaScript (target about 40 KB)`);
  assert.deepEqual([...page.matchAll(/<[^>]+aria-live="[^"]+"[^>]*>/g)].map(m => m[0]), ['<p class="obs-count" data-obs="count" aria-live="polite">']);
  assert.deepEqual([...page.matchAll(/<[^>]+role="(?:status|alert|log)"[^>]*>/g)].map(m => m[0]), ['<p class="obs-status" data-obs="status" role="status">']);
  assert.match(page, /<p class="obs-status" data-obs="status" role="status"><\/p>/, 'empty and in the page from the start, so changes are announced');
  for (const source of Object.values(scripts)) assert.doesNotMatch(source, /aria-live|setAttribute\('role', '(?:status|alert|log)'/);
  assert.doesNotMatch(scripts['lab/observability.js'], /status\.hidden/, 'the status is emptied, not hidden');
});

test('stylesheet: no text under 11px, 44px targets on touch, reduced motion and print handled', () => {
  for (const [, size] of css.matchAll(/font-size: ([\d.]+)px/g)) assert.ok(Number(size) >= 11, `font-size ${size}px`);
  const touch = css.match(/@media \(max-width: 560px\), \(pointer: coarse\) \{([\s\S]*?)\n\}/)[1];
  for (const sel of ['.obs-pills label', '.obs-btn', '.obs-search input', '.obs-cell', '.obs-sort']) assert.ok(touch.includes(sel), sel);
  assert.match(touch, /min-height: 44px/);
  assert.match(touch, /\.obs-cell \{ width: 44px; height: 44px; \}/);
  assert.match(css, /@media \(prefers-reduced-motion: no-preference\) \{/);
  assert.doesNotMatch(css.replace(/@media \(prefers-reduced-motion: no-preference\) \{[\s\S]*?\n\}/, ''), /transition|animation/);
  assert.match(css, /@media print \{/);
  assert.doesNotMatch(css, /url\(\s*["']?(?:https?:)?\/\//);
});

// ---- pure helpers on fixtures -------------------------------------------------------

test('percentile uses the nearest rank, so every value is an observed one', () => {
  assert.equal(D.percentile([], 50), null);
  assert.equal(D.percentile([7], 90), 7);
  assert.equal(D.percentile([4, 1, 3, 2], 50), 2);
  assert.equal(D.percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 90), 9);
  assert.equal(D.percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 91), 10);
  assert.equal(D.percentile([10, 20, 30], 0), 10);
  assert.equal(D.percentile([10, 20, 30], 100), 30);
});

test('formatters', () => {
  assert.equal(D.formatMs(88), '88 ms');
  assert.equal(D.formatMs(5516), '5.5 s');
  assert.equal(D.formatMs(1918727), '31 min 59 s');
  assert.equal(D.formatMs(4825000), '1 h 20 min');
  assert.equal(D.formatTokens(1653554739), '1.65 B');
  assert.equal(D.formatTokens(30812345), '30.8 M');
  assert.equal(D.formatTokens(999), '999');
  assert.equal(D.formatPct(0.016442), '1.6%');
  assert.equal(D.formatTick(1e5), '1.7 min');
  assert.equal(D.formatTick(1e7), '2.8 h');
  assert.equal(D.dayLabel('2026-11-08'), 'Nov 8');
});

const fixture = {
  id: 't01', day: '2026-11-08', round: 'Round 4', rootAgent: 'build', start: 0, end: 1000, llmSteps: 4, toolCalls: 5, toolErrors: 1, subagentRuns: 1, commits: 0,
  tokens: { input: 1, output: 2, reasoning: 3, cacheRead: 4, cacheWrite: 0 },
  spans: [
    { id: 's1', parent: null, kind: 'AGENT', name: 'build', agent: 'build', start: 0, end: 1000, status: 'ok' },
    { id: 's2', parent: 's1', kind: 'LLM', name: 'llm', agent: 'build', model: 'm', start: 0, end: 100, status: 'ok', tokens: { input: 1, output: 1, reasoning: 1, cacheRead: 2, cacheWrite: 0 }, toolCalls: 1 },
    { id: 's3', parent: 's1', kind: 'TOOL', name: 'task', agent: 'build', start: 100, end: 900, status: 'ok' },
    { id: 's4', parent: 's3', kind: 'AGENT', name: 'quality-reviewer', agent: 'quality-reviewer', start: 100, end: 900, status: 'ok' },
    { id: 's5', parent: 's4', kind: 'CHAIN', name: 'steps', agent: 'quality-reviewer', model: 'm', start: 100, end: 900, status: 'ok', tokens: { input: 0, output: 1, reasoning: 2, cacheRead: 2, cacheWrite: 0 }, steps: 3, tools: { read: 3, bash: 1 }, errors: { bash: 1 } },
    { id: 's6', parent: 's1', kind: 'TOOL', name: 'bash', agent: 'build', start: 900, end: 1000, status: 'ok', category: 'test' },
  ],
};

test('waterfall: tree order, depth, fractions of the trace, and open/closed runs', () => {
  const rows = D.waterfall(fixture);
  assert.deepEqual(rows.map(r => [r.id, r.depth]), [['s1', 0], ['s2', 1], ['s3', 1], ['s4', 2], ['s5', 3], ['s6', 1]]);
  assert.deepEqual(rows.map(r => [r.x, r.w]), [[0, 1], [0, 0.1], [0.1, 0.8], [0.1, 0.8], [0.1, 0.8], [0.9, 0.1]]);
  assert.deepEqual(rows.filter(r => r.expandable).map(r => [r.id, r.open]), [['s1', true], ['s3', true], ['s4', true], ['s5', false]]);
  // opening the merged steps lists their tools as untimed children
  const open = D.waterfall(fixture, new Set(['s5']));
  assert.deepEqual(open.filter(r => r.merged).map(r => [r.id, r.depth, r.merged.count, r.merged.errors]), [['s5:read', 4, 3, 0], ['s5:bash', 4, 1, 1]]);
  // closing the task call hides the subagent below it
  assert.deepEqual(D.waterfall(fixture, new Set(['s3'])).map(r => r.id), ['s1', 's2', 's3', 's6']);
  assert.deepEqual(D.waterfall(fixture, new Set(['s1'])).map(r => r.id), ['s1']);
  // aria-posinset / aria-setsize within each group of siblings
  assert.deepEqual(rows.map(r => [r.id, r.pos, r.size]), [['s1', 1, 1], ['s2', 1, 3], ['s3', 2, 3], ['s4', 1, 1], ['s5', 1, 1], ['s6', 3, 3]]);
  assert.deepEqual(open.filter(r => r.parent === 's5').map(r => [r.pos, r.size]), [[1, 2], [2, 2]]);
});

test('hash links open a known trace; anything else is ignored', () => {
  const ids = new Map(data.traces.map(t => [t.id, t]));
  assert.equal(D.hashTrace('#t12', ids), 't12');
  for (const hash of ['', '#', '#t99', '#t1', '#T12', '#t12x', '#obs-evals-title', '#t12;alert(1)', '#%3Cimg%3E', 't12', null, undefined]) {
    assert.equal(D.hashTrace(hash, ids), null, String(hash));
  }
});

test('histogram: bins cover every value on linear and log axes, and positions map into 0..1', () => {
  const values = [1, 10, 100, 1000, 10000, 5, 50];
  const log = D.histogram(values, { bins: 4, log: true });
  assert.equal(log.lo, 0);
  assert.equal(log.hi, 4);
  assert.equal(D.sum(log.bins.map(b => b.count)), values.length);
  assert.deepEqual(log.bins.map(b => b.count), [2, 2, 1, 2]);
  assert.equal(log.at(100), 0.5);
  assert.equal(log.at(0), 0, 'zero sits on the 1 ms edge of a log axis');
  const lin = D.histogram([0, 2, 4, 6, 8, 10], { bins: 5, log: false });
  assert.deepEqual(lin.bins.map(b => b.count), [1, 1, 1, 1, 2]);
  assert.equal(lin.at(5), 0.5);
  for (let i = 1; i < lin.bins.length; i++) assert.equal(lin.bins[i].x0, lin.bins[i - 1].x1);
  assert.deepEqual(D.histogram([]).bins, []);
});

test('filters: day, root agent, delegation, failed evaluator, tool search; reset state is unfiltered', () => {
  const a = { ...fixture, id: 't01', day: '2026-11-08' };
  const b = { ...fixture, id: 't02', day: '2026-11-09', rootAgent: 'plan', subagentRuns: 0, spans: [fixture.spans[0], fixture.spans[1], { ...fixture.spans[5], name: 'webfetch', category: undefined }] };
  const idx = D.evalIndex([{ trace: 't02', evaluator: 'delegation_used', label: 'fail' }, { trace: 't01', evaluator: 'delegation_used', label: 'pass' }]);
  const ids = f => D.filterTraces([a, b], idx, { ...D.EMPTY_FILTERS, ...f }).map(t => t.id);
  assert.deepEqual(ids({}), ['t01', 't02']);
  assert.deepEqual(ids({ day: '2026-11-09' }), ['t02']);
  assert.deepEqual(ids({ agent: 'build' }), ['t01']);
  assert.deepEqual(ids({ delegation: true }), ['t01']);
  assert.deepEqual(ids({ failed: true }), ['t02']);
  assert.deepEqual(ids({ tool: '  READ ' }), ['t01'], 'tools merged into CHAIN spans count');
  assert.deepEqual(ids({ tool: 'fetch' }), ['t02']);
  assert.deepEqual(ids({ tool: 'nothing' }), []);
  assert.equal(D.isFiltered(D.EMPTY_FILTERS), false);
  assert.equal(D.isFiltered({ ...D.EMPTY_FILTERS, tool: ' ' }), false);
  assert.equal(D.isFiltered({ ...D.EMPTY_FILTERS, failed: true }), true);
});

test('trace rows sort both ways with a stable tie-break', () => {
  const rows = [{ n: 1, tokens: 5, fails: [] }, { n: 2, tokens: 9, fails: ['x', 'y'] }, { n: 3, tokens: 5, fails: ['x'] }];
  assert.deepEqual(D.sortRows(rows, 'tokens', 'desc').map(r => r.n), [2, 1, 3]);
  assert.deepEqual(D.sortRows(rows, 'tokens', 'asc').map(r => r.n), [1, 3, 2]);
  assert.deepEqual(D.sortRows(rows, 'fails', 'desc').map(r => r.n), [2, 3, 1]);
  const row = D.traceRow(fixture, D.evalIndex([{ trace: 't01', evaluator: 'review_before_commit', label: 'fail' }, { trace: 't01', evaluator: 'tokens_per_tool_call', label: 12.5, score: 12.5 }]));
  assert.deepEqual([row.checks, row.passed, row.fails, row.tokens, row.spans, row.topic], [1, 0, ['review_before_commit'], 10, 6, 'hero, Icarus and layout']);
});

test('tool stats, tokens and delegations on the fixture', () => {
  const tools = D.toolStats([fixture]);
  assert.deepEqual(tools.map(t => [t.tool, t.calls, t.errors, t.timed]), [['read', 3, 0, 0], ['bash', 2, 1, 1], ['task', 1, 0, 1]]);
  assert.equal(tools.find(t => t.tool === 'bash').p50, 100);
  assert.equal(tools.find(t => t.tool === 'read').p50, null, 'no timed call');
  assert.deepEqual(D.tokensByAgent([fixture]).map(r => [r.agent, r.input, r.output, r.reasoning, r.cache, r.total]), [['build', 1, 1, 1, 2, 5], ['quality-reviewer', 0, 1, 2, 2, 5]]);
  assert.deepEqual(D.delegations([fixture]), [{ agent: 'quality-reviewer', runs: 1 }]);
  assert.deepEqual(D.ticks(1000, 4), [0, 500, 1000]);
  assert.deepEqual(D.ticks(0), [0]);
});

// ---- pure helpers on the real export -----------------------------------------------

test('on the real data: published agent spans reproduce the rollup percentiles exactly', () => {
  const agents = D.durationsOf(data.traces, 'AGENT');
  const roll = data.rollups.latencyByKind.AGENT;
  assert.equal(agents.length, roll.n, 'every agent run is published one by one');
  for (const p of [50, 90, 99]) assert.equal(D.percentile(agents, p), roll[`p${p}`], `AGENT p${p}`);
  // LLM and TOOL spans are mostly merged, so their published sample is smaller than the rollup
  assert.ok(D.durationsOf(data.traces, 'LLM').length < data.rollups.latencyByKind.LLM.n);
});

test('on the real data: tool calls, errors, tokens, delegations and days agree with the rollups', () => {
  const tools = D.toolStats(data.traces);
  assert.equal(tools.length, Object.keys(data.rollups.tools).length);
  for (const t of tools) {
    const r = data.rollups.tools[t.tool];
    assert.equal(t.calls, r.n, `${t.tool} calls`);
    assert.equal(t.errors, r.errors, `${t.tool} errors`);
  }
  const exact = D.toolStats(data.traces, data.rollups.tools);
  assert.ok(exact.every(t => t.exact && t.p50 === data.rollups.tools[t.tool].p50 && t.p90 === data.rollups.tools[t.tool].p90));
  for (const row of D.tokensByAgent(data.traces)) {
    const r = data.rollups.byAgent[row.agent].tokens;
    assert.equal(row.total, D.tokenTotal(r), `${row.agent} tokens`);
    assert.equal(row.cache, r.cacheRead + r.cacheWrite, `${row.agent} cache`);
  }
  assert.deepEqual(Object.fromEntries(D.delegations(data.traces).map(d => [d.agent, d.runs])), data.rollups.delegations);
  assert.deepEqual(Object.fromEntries(D.perDay(data.traces, data.traces).map(d => [d.day, d.total])), Object.fromEntries(Object.entries(data.rollups.byDay).map(([day, v]) => [day, v.traces])));
  const k = D.kpis(data);
  assert.equal(k.llmSteps, D.sum(Object.values(data.rollups.byDay).map(v => v.llmSteps)));
  assert.equal(k.toolCalls, D.sum(Object.values(data.rollups.tools).map(v => v.n)));
  assert.equal(k.tokens, D.sum(Object.values(data.rollups.byDay).map(v => v.tokens)));
});

test('on the real data: every trace lays out as a waterfall inside its own clock', () => {
  for (const trace of data.traces) {
    const rows = D.waterfall(trace);
    assert.equal(rows.length, trace.spans.length, `${trace.id}: every span is a row when CHAINs are closed`);
    for (const row of rows) assert.equal(row.size, rows.filter(r => r.parent === row.parent).length, `${trace.id}/${row.id} setsize`);
    assert.equal(rows[0].depth, 0);
    for (const row of rows) {
      assert.ok(row.x >= 0 && row.w >= 0 && row.x + row.w <= 1 + 1e-9, `${trace.id}/${row.id}`);
      if (row.parent) assert.ok(rows.findIndex(r => r.id === row.parent) < rows.indexOf(row), `${trace.id}/${row.id} after its parent`);
    }
    const open = D.waterfall(trace, new Set(trace.spans.filter(s => s.kind === 'CHAIN').map(s => s.id)));
    const merged = D.sum(trace.spans.filter(s => s.kind === 'CHAIN').map(s => Object.keys(s.tools).length));
    assert.equal(open.length, trace.spans.length + merged, `${trace.id}: open CHAINs list their tools`);
  }
});

test('on the real data: filters partition sensibly and the evaluator counts match the evaluations', () => {
  const all = D.filterTraces(data.traces, index, D.EMPTY_FILTERS);
  assert.equal(all.length, data.traces.length);
  const byDay = D.sum([...new Set(data.traces.map(t => t.day))].map(day => D.filterTraces(data.traces, index, { ...D.EMPTY_FILTERS, day }).length));
  assert.equal(byDay, data.traces.length);
  const delegated = D.filterTraces(data.traces, index, { ...D.EMPTY_FILTERS, delegation: true });
  assert.equal(delegated.length, data.evaluations.filter(e => e.evaluator === 'delegation_used' && e.label === 'pass').length);
  const failed = D.filterTraces(data.traces, index, { ...D.EMPTY_FILTERS, failed: true });
  assert.equal(failed.length, new Set(data.evaluations.filter(e => e.label === 'fail').map(e => e.trace)).size);
  const browser = D.filterTraces(data.traces, index, { ...D.EMPTY_FILTERS, tool: 'browser' });
  assert.ok(browser.length > 0 && browser.length < data.traces.length);
  const counts = D.evaluatorCounts(data.evaluators, data.evaluations);
  assert.equal(D.sum(counts.map(c => c.scored)), data.evaluations.length);
  const some = new Set(failed.slice(0, 5).map(t => t.id));
  assert.ok(D.evaluatorCounts(data.evaluators, data.evaluations, some).every(c => c.scored <= 5));
});

// The recorded trace behind the build tour (web/trace/build-trace.json) and the
// pure helpers entrance.js uses to map it onto tour stops. Node only (no DOM).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  TOUR_STOPS, TRACE_HONESTY, TRACE_ROLE_NAMES, TRACE_ROLE_OF, TRACE_STATUSES, TRACE_TIMINGS, TRACE_SPREAD, ROLES,
  normalizeTrace, traceStopSpans, traceRotation, traceChain, traceAxis, traceHeading, traceDates, shortAction,
} from '../web/entrance.js';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const raw = read('web/trace/build-trace.json');
const data = JSON.parse(raw);
const trace = normalizeTrace(data);
const stops = [...new Set(TOUR_STOPS.map(stop => stop.name))];
const iso = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:[+-]\d{2}:\d{2}|Z)$/;

test('the trace file has the expected shape', () => {
  assert.equal(typeof data.title, 'string');
  assert.ok(data.run && typeof data.run === 'object');
  assert.match(data.run.from, /^[0-9a-f]{7,40}$/);
  assert.match(data.run.to, /^[0-9a-f]{7,40}$/);
  assert.match(data.run.started, iso);
  assert.match(data.run.ended, iso);
  assert.ok(Number.isInteger(data.run.commits) && data.run.commits > 0);
  assert.deepEqual(data.roles.map(role => role.id), TRACE_ROLE_NAMES);
  assert.ok(Array.isArray(data.spans) && data.spans.length >= 20);
  const ids = new Set();
  const known = new Set([...stops, ...TRACE_SPREAD]);
  for (const span of data.spans) {
    const where = span.id;
    assert.match(span.id, /^s\d{2}$/, where);
    assert.ok(!ids.has(span.id), `${where}: unique id`);
    ids.add(span.id);
    assert.ok(TRACE_ROLE_NAMES.includes(span.role), `${where}: role ${span.role}`);
    for (const key of ['action', 'result', 'evidence']) assert.ok(typeof span[key] === 'string' && span[key].trim(), `${where}: ${key}`);
    assert.ok(TRACE_STATUSES.includes(span.status), `${where}: status ${span.status}`);
    assert.ok(TRACE_TIMINGS.includes(span.timing), `${where}: timing ${span.timing}`);
    assert.match(span.start, iso, where);
    assert.match(span.end, iso, where);
    assert.ok(Date.parse(span.start) <= Date.parse(span.end), `${where}: start <= end`);
    assert.ok(span.commit === null || /^[0-9a-f]{7,40}$/.test(span.commit), `${where}: commit`);
    if (span.timing === 'commit') {
      assert.ok(span.commit, `${where}: a commit-timed span names its commit`);
      assert.equal(span.start, span.end, `${where}: a commit is a point in time`);
    }
    assert.ok(Array.isArray(span.sections) && span.sections.length, `${where}: sections`);
    span.sections.forEach(name => assert.ok(known.has(name), `${where}: unknown section ${name}`));
  }
  for (const span of data.spans) assert.ok(span.parent === null || ids.has(span.parent), `${span.id}: parent ${span.parent}`);
  assert.equal(data.totals.spans, data.spans.length);
});

test('every span survives validation, and the heading matches the run', () => {
  assert.ok(trace);
  assert.equal(trace.spans.length, data.spans.length);
  assert.equal(traceHeading(trace), 'Recorded replay · rounds 4–5 · 16 commits · Nov 10–11, 2026');
  assert.equal(trace.scope, 'rounds 4–5');
  assert.equal(traceDates('2026-11-10', '2026-11-10'), 'Nov 10, 2026');
  assert.equal(traceDates('2026-10-31', '2026-11-01'), 'Oct 31 – Nov 1, 2026');
  // Bad data never throws; it is dropped.
  assert.equal(normalizeTrace(null), null);
  assert.equal(normalizeTrace({ spans: [{ id: 'x', role: 'hacker', action: 'a', status: 'ok', timing: 'commit', start: 'x', end: 'y' }] }), null);
  const bad = normalizeTrace({ spans: [...data.spans, { ...data.spans[2], id: 's99', start: data.spans[2].end, end: data.spans[2].start }] });
  assert.equal(bad.spans.length, data.spans.length, 'start after end is dropped');
});

test('every tour stop has at least two spans of its own or via All/Tour, and every role a crew', () => {
  for (const stop of stops) {
    const { direct, spread } = traceStopSpans(trace, stop);
    assert.ok(direct.length + spread.length >= 2, `${stop}: ${direct.length} + ${spread.length}`);
    // Lab was added in round 10, after the recorded run: it may only use run-wide steps.
    if (stop !== 'Lab') assert.ok(direct.length >= 2, `${stop}: ${direct.length} spans of its own`);
    // The orchestrator, the workers and the reviewer always have something to show.
    for (const role of ['orchestrator', 'implementation-worker', 'quality-reviewer']) {
      assert.ok(traceRotation(trace, stop, role).length >= 1, `${stop}: ${role}`);
    }
  }
  // Every choreography role maps onto one of the four recorded roles.
  assert.deepEqual(Object.keys(TRACE_ROLE_OF).sort(), Object.keys(ROLES).sort());
  assert.deepEqual([...new Set(Object.values(TRACE_ROLE_OF))].sort(), [...TRACE_ROLE_NAMES].sort());
});

test('recorded errors lead to their retry or fix on the same role', () => {
  const chains = trace.spans.filter(span => span.status === 'error').map(span => traceChain(trace, span).map(step => `${step.id}:${step.status}`).join('>'));
  assert.ok(chains.includes('s11:error>s13:retried'), chains.join(' '));
  assert.ok(chains.includes('s22:error>s25:retried'), chains.join(' '));
  assert.ok(chains.includes('s19:error>s23:fixed'), chains.join(' '));
  for (const span of trace.spans.filter(item => item.status === 'error')) {
    traceChain(trace, span).forEach(step => assert.equal(step.role, span.role));
  }
  // The retry is reached through its error, so it is not handed out on its own where both apply.
  const capabilities = traceRotation(trace, 'Capabilities', 'implementation-worker').map(span => span.id);
  assert.ok(capabilities.includes('s11') && !capabilities.includes('s13'), capabilities.join(','));
  // At least one stop shows an error that is then retried or fixed.
  assert.ok(stops.some(stop => TRACE_ROLE_NAMES.some(role => traceRotation(trace, stop, role).some(span => traceChain(trace, span).length > 1))));
});

test('labels are shortened at word boundaries; bars stay within the axis and keep order', () => {
  assert.equal(shortAction('Move the project explorer into the Work section', 38), 'move the project explorer…');
  assert.equal(shortAction('Save clearer copy', 38), 'save clearer copy');
  for (const span of trace.spans) {
    for (const max of [20, 30, 38]) {
      const text = shortAction(span.action, max);
      assert.ok(text.length <= max, `${text} (${max})`);
      assert.doesNotMatch(text, /\s…$/);
    }
  }
  const axis = traceAxis(trace.spans);
  let last = -1;
  for (const span of trace.spans) {
    const { x0, x1 } = axis.get(span.id);
    assert.ok(x0 >= 0 && x1 <= 1 && x0 <= x1, span.id);
    assert.ok(x0 >= last - 1e-9, `${span.id} in time order`);
    last = x0;
  }
});

test('every commit hash exists in the git history', t => {
  const root = fileURLToPath(new URL('..', import.meta.url));
  const hashes = [...new Set([data.run.from, data.run.to, ...data.spans.map(span => span.commit).filter(Boolean)])];
  try { execFileSync('git', ['rev-parse', '--git-dir'], { cwd: root, stdio: 'ignore' }); }
  catch { t.skip('git is not available'); return; }
  for (const hash of hashes) {
    assert.doesNotThrow(() => execFileSync('git', ['cat-file', '-e', `${hash}^{commit}`], { cwd: root, stdio: 'ignore' }), `${hash} is a commit`);
  }
});

test('the trace leaks no paths, emails, links or employer details', () => {
  assert.doesNotMatch(raw, /\/Users\/|[A-Za-z]:\\|@|https?:|www\./);
  assert.doesNotMatch(raw, /\bADP\b|Jira/i);
});

test('entrance.js states what is real and what is visualization', () => {
  const source = read('web/entrance.js');
  assert.equal(TRACE_HONESTY, 'Steps, results and commits are real. Cursor positions and typing are a visualization. Commit times are exact; other times are estimated.');
  assert.ok(source.includes(TRACE_HONESTY));
  assert.match(source, /fetch\(TRACE_URL/);
  assert.match(source, /TRACE_URL = '\.\/trace\/build-trace\.json'/);
});

test('the trace panel and labels keep readable text (11px floor)', () => {
  const css = read('web/entrance.css');
  for (const match of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const [, selector, body] = match;
    if (!/agentic-(?:trace|span)/.test(selector)) continue;
    for (const size of body.matchAll(/font-size: ([\d.]+)px/g)) assert.ok(Number(size[1]) >= 11, `${selector.trim()} ${size[0]}`);
  }
  // Reduced motion: no animated bars.
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{[^@]*\.agentic-trace, \.agentic-span-bar \{ animation: none; \}/);
});

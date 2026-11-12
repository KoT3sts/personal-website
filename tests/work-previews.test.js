// Homepage work previews (web/work-previews.js + .css): the numbers come from the same
// data as the observability lab and the build trace, the module only fetches its two
// same-origin JSON files, builds no HTML from strings, and keeps the static fallback when
// anything fails. Node only (no DOM): pure helpers, source checks and a tiny fake page.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { initWorkPreviews, obsSummary, obsHead, daysText, traceMarks, OBS_JSON, TRACE_JSON, ROLES, CHECKS } from '../web/work-previews.js';
import { topic } from '../web/lab/obs-data.js';
import { readSpans } from '../web/lab/build-trace.js';

const web = new URL('../web/', import.meta.url);
const read = path => readFileSync(new URL(path, web), 'utf8');
const source = read('work-previews.js');
const css = read('work-previews.css');
// The homepage reads the exporter's summary; the lab reads the full file it is cut from.
const obs = JSON.parse(read('lab/data/agent-traces-summary.json'));
const full = JSON.parse(read('lab/data/agent-traces.json'));
const home = read('index.html');
const trace = JSON.parse(read('trace/build-trace.json'));

test('the module exports initWorkPreviews and reads the two shipped JSON files', () => {
  assert.equal(typeof initWorkPreviews, 'function');
  assert.equal(initWorkPreviews.constructor.name, 'AsyncFunction');
  assert.equal(OBS_JSON, './lab/data/agent-traces-summary.json');
  assert.equal(TRACE_JSON, './trace/build-trace.json');
  for (const path of [OBS_JSON, TRACE_JSON]) assert.ok(statSync(new URL(path, web)).isFile(), path);
  // Budget: 17 KB unminified (about 5 KB gzipped), with no imports; it loads lazily, after the page.
  assert.ok(statSync(new URL('work-previews.js', web)).size < 17 * 1024, 'stays under 17 KB');
});

test('the observability preview and its static summary carry the same numbers, from agent-traces-summary.json', () => {
  const summary = obsSummary(obs);
  const calls = obs.traces.reduce((sum, trace) => sum + trace.toolCalls, 0);
  const errors = obs.traces.reduce((sum, trace) => sum + trace.toolErrors, 0);
  assert.equal(summary.traces.length, obs.traces.length, 'every trace is valid');
  assert.equal(summary.traces.length, obs.meta.traces);
  assert.deepEqual(summary.kpis, [['Traces', String(obs.traces.length)], ['Tool calls', calls.toLocaleString('en-US')], ['Tool error rate', `${((100 * errors) / calls).toFixed(1)}%`]]);
  // The homepage's no-JS summary says the same, so it never disagrees with the live preview.
  const card = home.match(/<div class="work-preview" data-preview="obs">([\s\S]*?)<\/div>\s*<a /)[1];
  assert.deepEqual([...card.matchAll(/<dt>([^<]+)<\/dt><dd>([^<]+)<\/dd>/g)].map(m => [m[1], m[2]]), summary.kpis);
  const [from, to] = [obs.meta.window.from, obs.meta.window.to];
  assert.equal(summary.dates, daysText(from, to));
  assert.match(card, new RegExp(`<p class="open-note mono">${summary.dates.toUpperCase()}, ${from.slice(0, 4)} · ${summary.rows.length} PASS/FAIL CHECKS · ${obs.evaluators.length} EVALUATORS, NO LLM JUDGE</p>`));
  assert.ok(obs.evaluators.every(item => item.kind === 'code'), 'no LLM judge');
  // One row per pass/fail evaluator, one cell per evaluation; blanks where it does not apply.
  assert.deepEqual(summary.rows.map(row => row.id), Object.keys(CHECKS));
  for (const row of summary.rows) {
    const rows = obs.evaluations.filter(item => item.evaluator === row.id);
    assert.equal(row.scored, rows.length, row.id);
    assert.equal(row.pass, rows.filter(item => item.label === 'pass').length, row.id);
    assert.equal(row.cells.length, obs.traces.length);
  }
  assert.equal(daysText('2026-11-07', '2026-11-12'), 'Nov 7–12');
  assert.equal(daysText('2026-10-31', '2026-11-02'), 'Oct 31 – Nov 2');
  assert.equal(daysText('2026-11-07', '2026-11-07'), 'Nov 7');
  // Bad data is dropped, never thrown.
  assert.deepEqual(obsSummary(null).traces, []);
  assert.deepEqual(obsSummary({ traces: [{ id: 't', toolCalls: 1, toolErrors: 2 }], evaluators: [{ id: 'nope' }] }), { traces: [], rows: [], kpis: [['Traces', '0'], ['Tool calls', '0'], ['Tool error rate', '–']], dates: '' });
});

test('the summary file gives the preview exactly what the full trace file would, and it is small', () => {
  const [small, big] = [obsSummary(obs), obsSummary(full)];
  assert.deepEqual(small.kpis, big.kpis);
  assert.deepEqual(small.rows, big.rows);
  assert.equal(small.dates, big.dates);
  const counts = list => list.map(({ id, day, toolCalls, toolErrors }) => ({ id, day, toolCalls, toolErrors }));
  assert.deepEqual(counts(small.traces), counts(big.traces));
  // Each topic is the lab's plain-words topic for that trace, never a round label.
  assert.deepEqual(small.traces.map(t => t.topic), big.traces.map(topic));
  assert.ok(small.traces.every(t => typeof t.topic === 'string' && t.topic && !/round/i.test(t.topic)));
  assert.deepEqual(obs.meta.window, full.meta.window);
  assert.deepEqual(obs.evaluators.map(e => e.id), full.evaluators.map(e => e.id));
  assert.ok(statSync(new URL(OBS_JSON, web)).size < 40 * 1024, 'the homepage loads under 40 KB of trace data');
});

test('the readout names the day and the topic, never a round label or "undefined"', () => {
  const first = obs.traces[0];
  assert.equal(obsHead(first, 0, obs.traces.length), `Trace 1 of ${obs.traces.length} · Nov 7 · ${first.topic}`);
  assert.equal(obsHead({ id: 't', day: '2026-11-12' }, 1, 3), 'Trace 2 of 3 · Nov 12');
  assert.equal(obsHead({ id: 't', round: 'Round 4' }, 0, 1), 'Trace 1 of 1');
  assert.equal(obsHead({ id: 't', day: 7, topic: 42 }, 0, 1), 'Trace 1 of 1');
  assert.equal(obsHead(undefined, 0, 1), 'Trace 1 of 1');
  assert.doesNotMatch(source, /trace\.round/, 'the preview never reads round labels');
});

test('the trace strip counts come from the JSON: 52 spans, 8 errors, in the build-trace page\'s order', () => {
  const { spans, errors } = traceMarks(trace);
  assert.equal(spans.length, trace.spans.length);
  assert.equal(spans.length, trace.totals.spans);
  assert.equal(spans.length, 52);
  assert.equal(errors, trace.spans.filter(span => span.status === 'error').length);
  assert.equal(errors, 8);
  assert.deepEqual(spans.map(span => span.id), readSpans(trace).map(span => span.id));
  assert.deepEqual([...new Set(spans.map(span => span.role))].sort(), [...ROLES].sort());
  assert.deepEqual(traceMarks({ spans: [{ id: 'x', role: 'intruder', status: 'ok', action: 'a', start: '2026-11-10T10:00:00-05:00', end: '2026-11-10T10:00:00-05:00' }] }).spans, []);
  assert.deepEqual(traceMarks(null), { spans: [], errors: 0 });
});

test('no network beyond the two same-origin JSON files, and no HTML built from strings', () => {
  const calls = [...source.matchAll(/\bfetch\(/g)];
  assert.equal(calls.length, 1, 'one fetch call');
  assert.match(source, /win\.fetch\(new URL\(path, import\.meta\.url\), \{ credentials: 'same-origin' \}\)/);
  assert.match(source, /const BUILDERS = \{ obs: \[OBS_JSON, buildObs\], trace: \[TRACE_JSON, buildTrace\], loop: \[null, buildLoop\] \};/);
  assert.doesNotMatch(source, /XMLHttpRequest|WebSocket|EventSource|sendBeacon|importScripts|\bimport\(|https?:\/\/(?!www\.w3\.org\/2000\/svg)/);
  assert.equal([...source.matchAll(/^import /gm)].length, 0, 'no imports');
  assert.doesNotMatch(source, /innerHTML|outerHTML|insertAdjacentHTML|document\.write|DOMParser|createContextualFragment|\beval\(|new Function/);
  assert.doesNotMatch(source, /setAttribute\('style'|\.style\s*=|cssText/, 'styles only through CSSOM custom properties');
});

// A minimal fake page: enough DOM for initWorkPreviews to find containers.
function fakePage(kinds) {
  const nodes = kinds.map(kind => ({
    dataset: {}, replaced: false,
    getAttribute: name => (name === 'data-preview' ? kind : null),
    replaceChildren() { this.replaced = true; },
  }));
  return { nodes, document: { querySelectorAll: () => nodes } };
}

test('a failed load or build keeps the static fallback and never throws', async () => {
  const urls = [];
  const window = { fetch: (url, options) => { urls.push([String(url), options.credentials]); return Promise.reject(new Error('offline')); } };
  const { nodes, document } = fakePage(['obs', 'trace', 'loop', 'lab']);
  const result = await initWorkPreviews(document, window);
  await result.settled;
  assert.deepEqual(nodes.map(node => node.dataset.previewState), ['fallback', 'fallback', 'fallback', undefined]);
  assert.ok(nodes.every(node => !node.replaced), 'fallback markup untouched');
  assert.deepEqual(urls.map(([url]) => new URL(url).pathname.replace(/^.*\/web\//, '')).sort(), ['lab/data/agent-traces-summary.json', 'trace/build-trace.json']);
  assert.ok(urls.every(([url, credentials]) => url.startsWith(new URL('.', new URL('work-previews.js', web)).href) && credentials === 'same-origin'), 'resolved next to the module, same origin');
  // A broken document is swallowed too.
  await assert.doesNotReject(initWorkPreviews({ querySelectorAll() { throw new Error('boom'); } }, window));
});

test('each JSON file is fetched once per page, however many times the previews start', async () => {
  const calls = [];
  const window = { fetch: url => { calls.push(String(url)); return Promise.resolve({ ok: true, json: async () => ({}) }); } };
  for (let round = 0; round < 3; round += 1) {
    const { document } = fakePage(['obs', 'trace', 'obs']);
    await (await initWorkPreviews(document, window)).settled;
  }
  assert.equal(calls.length, 2, `one request per file, got ${calls.length}`);
});

test('styles: 11px text, 44px targets, currentColor theming, motion only when allowed', () => {
  for (const [, selector, body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    for (const size of body.matchAll(/font-size: ([\d.]+)px/g)) assert.ok(Number(size[1]) >= 11, `${selector.trim()} ${size[0]}`);
  }
  assert.match(css, /\.wp-label \{[^}]*font-size: 11px/);
  assert.match(css, /\.wp-trace-scrub \{[^}]*min-height: 44px/);
  assert.match(css, /\.wp-obs-grid \{ --wp-row: 15px;/, 'six 15px rows: a 90px target');
  assert.match(css, /\.wp-obs-scrub \.wp-trace-range \{ left: 0; width: 100%; \}/);
  assert.match(source, /4000 \/ width/, 'loop labels render at 12.5px (4000 / width viewBox units)');
  assert.doesNotMatch(css, /(?:@import|url\()/, 'nothing remote');
  const outside = css.replace(/@media \(prefers-reduced-motion: no-preference\) \{[\s\S]*?\n\}/, '').replace(/@keyframes [\w-]+ \{[^\n]*\}\n/g, '');
  assert.doesNotMatch(outside, /transition|animation/, 'motion only when allowed');
  assert.equal([...source.matchAll(/reduced\(\) \? 'static' : 'on'/g)].length, 2, 'the trace and the grid stay static under reduced motion');
  assert.match(source, /if \(reduced\(\) \|\| !win\.SVGAnimationElement\) return;/, 'the loop dot stays still under reduced motion');
  // Text colours are never hard-coded: every color: is currentColor or inherited.
  for (const [, value] of css.matchAll(/[{;]\s*color: ([^;]+);/g)) assert.ok(['currentColor', 'inherit'].includes(value), value);
});

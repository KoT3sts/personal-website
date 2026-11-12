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
  // Budget: 18 KB unminified (about 5 KB gzipped), with no imports; it loads lazily, after the page.
  assert.ok(statSync(new URL('work-previews.js', web)).size < 18 * 1024, 'stays under 18 KB');
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
  assert.match(card, new RegExp(`<p class="open-note mono">${summary.dates.toUpperCase()}, ${from.slice(0, 4)} · ${obs.evaluators.length} AUTOMATED CHECKS · NO LLM JUDGE</p>`));
  assert.ok(obs.evaluators.every(item => item.kind === 'code'), 'no LLM judge');
  // One row per pass/fail evaluator, one cell per evaluation; blanks where it does not apply.
  assert.deepEqual(summary.rows.map(row => row.id), Object.keys(CHECKS));
  // The summary groups the labels by evaluator: {evaluator: {trace: "pass" | "fail"}}.
  assert.deepEqual(Object.keys(CHECKS), ['tool_error_rate', 'recovered_after_error', 'delegation_fit', 'review_before_commit', 'verified_after_last_edit', 'latency_budget']);
  assert.ok(Object.values(CHECKS).every(label => label.length <= 11), 'short row labels ("Tool errors" is the longest) keep the readout and the grid narrow');
  for (const row of summary.rows) {
    const labels = Object.entries(obs.evaluations[row.id]);
    assert.equal(row.scored, labels.length, row.id);
    assert.equal(row.pass, labels.filter(([, label]) => label === 'pass').length, row.id);
    assert.equal(row.cells.length, obs.traces.length);
    for (const [id, label] of labels) assert.equal(row.cells[summary.traces.findIndex(t => t.id === id)], label, `${row.id} ${id}`);
  }
  assert.ok(obs.evaluators.filter(e => e.output === 'pass/fail').length >= summary.rows.length, 'every row is a pass/fail check');
  for (const id of Object.keys(CHECKS)) assert.equal(obs.evaluators.find(e => e.id === id)?.output, 'pass/fail', id);
  // Only own keys count: an inherited name ("toString") or an odd label is a blank cell.
  const odd = { traces: [{ id: 't1', toolCalls: 1, toolErrors: 0 }, { id: 'toString', toolCalls: 1, toolErrors: 0 }, { id: 't3', toolCalls: 1, toolErrors: 0 }],
    evaluators: [{ id: 'tool_error_rate' }], evaluations: { tool_error_rate: { t1: 'pass', t2: 'fail', t3: 0.5 } } };
  assert.deepEqual(obsSummary(odd).rows[0].cells, ['pass', null, null]);
  assert.deepEqual(obsSummary({ ...odd, evaluations: 'x' }).rows[0].cells, [null, null, null]);
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
  assert.ok(statSync(new URL(OBS_JSON, web)).size < 30 * 1024, 'the homepage loads under 30 KB of trace data');
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

test('scrubbing cannot move the page: a fixed-height readout, contained previews, one frame per move', () => {
  // One meta line (11px x 1.4) and two text lines (14px x 1.4) with the 4px gap fit 4.6em of 13px.
  assert.match(css, /\.wp-readout \{[^}]*\bheight: 4\.6em;[^}]*overflow: hidden;[^}]*contain: strict;/);
  assert.ok(11 * 1.4 + 4 + 2 * 14 * 1.4 <= 4.6 * 13, 'the clamped lines fit the readout');
  assert.doesNotMatch(css, /\.wp-readout \{[^}]*min-height/, 'no growing readout');
  assert.match(css, /\.wp-readout \.wp-label \{ white-space: nowrap; text-overflow: ellipsis; \}/);
  assert.match(css, /\.wp-readout \.wp-action \{[^}]*-webkit-line-clamp: 2;[^}]*line-clamp: 2;/);
  assert.match(css, /\.wp-obs \{ contain: content; \}/);
  assert.match(css, /\.wp-trace \{ contain: layout style; \}/);
  // The pointer path: one frame per burst of moves, the box measured once, writes only on a new step.
  assert.match(source, /frame \|\|= w\.requestAnimationFrame\(paint\)/);
  assert.match(source, /box \|\|= slider\.getBoundingClientRect\(\)/);
  assert.match(source, /if \(k !== shown\) select\(shown = k\)/, 'an unchanged step writes nothing');
  assert.equal([...source.matchAll(/^ {4}slider\.setAttribute\('aria-valuetext'/gm)].length, 2, 'aria-valuetext follows the shown step in both strips');
  assert.match(source, /w\.addEventListener\('scroll', forget, \{ capture: true, passive: true \}\)/, 'a scroll drops the measured box');
});

// ---- status colours shared with the lab pages ---------------------------------------

const lum = hex => {
  const [r, g, b] = [0, 2, 4].map(i => parseInt(hex.slice(i + 1, i + 3), 16) / 255).map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);
const hue = hex => {
  const [r, g, b] = [0, 2, 4].map(i => parseInt(hex.slice(i + 1, i + 3), 16) / 255);
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  if (!d) return 0;
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
};
const hueGap = (a, b) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b));
const tokens = (text, where) => {
  const block = text.match(new RegExp(`${where.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\{([^}]*)\\}`))?.[1] || '';
  return Object.fromEntries(['pass', 'fail', 'na'].map(key => [key, block.match(new RegExp(`--status-${key}: (#[0-9a-f]{6});`))?.[1]]));
};

test('status colours: one hue family per status on the homepage, the essay and the dashboard, each 3:1 on its own ground', () => {
  const sets = {
    homepage: { tokens: tokens(css, '.wp-obs, .wp-trace, .wp-loop'), grounds: ['#eeede8', '#f7f6f0', '#101114'] },
    paper: { tokens: tokens(read('lab/lab.css'), ':root'), grounds: ['#eeede8'] },
    dashboard: { tokens: tokens(read('lab/observability.css'), '.obs-console'), grounds: ['#101114', '#17191c'] },
  };
  for (const [name, { tokens: set, grounds }] of Object.entries(sets)) {
    for (const key of ['pass', 'fail', 'na']) assert.ok(set[key], `${name} defines --status-${key}`);
    assert.ok(hue(set.pass) >= 75 && hue(set.pass) <= 130, `${name} pass ${set.pass} is green`);
    assert.ok(hue(set.fail) <= 15 || hue(set.fail) >= 345, `${name} fail ${set.fail} is red`);
    for (const ground of grounds) {
      for (const key of ['pass', 'fail', 'na']) assert.ok(ratio(set[key], ground) >= 3, `${name} --status-${key} ${set[key]} on ${ground}: ${ratio(set[key], ground).toFixed(2)}`);
    }
  }
  // The homepage grid uses the tokens, pass cells included; no stray fail red is left.
  assert.match(css, /\.wp-pass \{ fill: var\(--status-pass\); \}/);
  assert.match(css, /\.wp-fail \{ fill: var\(--status-fail\); \}/);
  assert.match(css, /\.wp-obs \.wp-chip-pass \{[^}]*background: var\(--status-pass\); \}/);
  assert.match(css, /\.wp-obs \.wp-chip-fail \{ background: var\(--status-fail\); \}/);
  assert.doesNotMatch(css, /#e0483f|--wp-fail/);
  // Fail differs without colour: a fail cell is taller than a pass cell.
  assert.match(source, /y: r \+ \(cell === 'fail' \? 0\.12 : 0\.3\), height: cell === 'fail' \? 0\.76 : 0\.4/);
});

test('roles never wear a status colour: the quality-reviewer is teal on the homepage and the build trace', () => {
  const roles = Object.fromEntries([...css.matchAll(/--wp-([a-z-]+): (#[0-9a-f]{6})/g)].map(([, name, value]) => [name, value]));
  const status = tokens(css, '.wp-obs, .wp-trace, .wp-loop');
  const reviewer = roles['quality-reviewer'];
  assert.equal(reviewer, '#16897f');
  for (const [name, colour] of Object.entries(roles)) {
    assert.ok(hueGap(hue(colour), hue(status.fail)) >= 40, `${name} ${colour} is not a fail red`);
    assert.ok(hueGap(hue(colour), hue(status.pass)) >= 40, `${name} ${colour} is not a pass green`);
    for (const ground of ['#eeede8', '#f7f6f0', '#101114']) assert.ok(ratio(colour, ground) >= 3, `${name} ${colour} on ${ground}`);
  }
  assert.ok(hueGap(hue(reviewer), hue(roles['implementation-worker'])) >= 30, 'reviewer and implementation worker differ');
  assert.match(read('lab/build-trace.css'), new RegExp(`\\[data-role="quality-reviewer"\\] \\.bt-chip \\{ background: ${reviewer}; \\}`), 'the build trace chip matches');
});

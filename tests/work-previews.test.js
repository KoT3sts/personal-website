// Homepage work previews (web/work-previews.js + .css): the numbers come from the same
// function and data as the lab and the build trace, the module only fetches its two
// same-origin JSON files, builds no HTML from strings, and keeps the static fallback when
// anything fails. Node only (no DOM): pure helpers, source checks and a tiny fake page.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { initWorkPreviews, labMetrics, traceMarks, validLab, LAB_JSON, TRACE_JSON, ROLES } from '../web/work-previews.js';
import { readSpans } from '../web/lab/build-trace.js';

const web = new URL('../web/', import.meta.url);
const read = path => readFileSync(new URL(path, web), 'utf8');
const source = read('work-previews.js');
const css = read('work-previews.css');
const lab = JSON.parse(read('lab/data/sentiment-eval.json'));
const trace = JSON.parse(read('trace/build-trace.json'));

test('the module exports initWorkPreviews and reads the two shipped JSON files', () => {
  assert.equal(typeof initWorkPreviews, 'function');
  assert.equal(initWorkPreviews.constructor.name, 'AsyncFunction');
  assert.equal(LAB_JSON, './lab/data/sentiment-eval.json');
  assert.equal(TRACE_JSON, './trace/build-trace.json');
  for (const path of [LAB_JSON, TRACE_JSON]) assert.ok(statSync(new URL(path, web)).isFile(), path);
  // Budget: 16 KB unminified (about 5 KB gzipped); it loads lazily, after the page.
  assert.ok(statSync(new URL('work-previews.js', web)).size < 16 * 1024, 'stays under 16 KB');
});

test('the lab preview uses the lab\'s own function: at 0.5 it matches the Python reference exactly', () => {
  assert.ok(validLab(lab));
  assert.match(source, /import \{ evaluate \} from '\.\/lab\/metrics\.js';/);
  for (const model of ['A', 'B']) {
    const result = labMetrics(lab.test, model, 0.5);
    for (const key of ['tp', 'fp', 'tn', 'fn', 'precision', 'recall', 'f1', 'accuracy']) {
      assert.equal(result[key], lab.reference[model][key], `${model} ${key}`);
    }
  }
  // The slider's range is clamped like the lab's.
  assert.deepEqual(labMetrics(lab.test, 'B', 2), labMetrics(lab.test, 'B', 0.95));
  assert.deepEqual(labMetrics(lab.test, 'B', 0), labMetrics(lab.test, 'B', 0.05));
  assert.equal(validLab({ test: [] }), false);
  assert.equal(validLab({ test: [{ pA: '0.5', pB: 0.5, label: 1 }] }), false);
  assert.match(source, /`Live: the lab’s \$\{data\.test\.length\} test sentences\.`/, 'the caption counts the sentences from the JSON');
  assert.equal(lab.test.length, 596);
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
  assert.match(source, /const BUILDERS = \{ lab: \[LAB_JSON, buildLab\], trace: \[TRACE_JSON, buildTrace\], loop: \[null, buildLoop\] \};/);
  assert.doesNotMatch(source, /XMLHttpRequest|WebSocket|EventSource|sendBeacon|importScripts|\bimport\(|https?:\/\/(?!www\.w3\.org\/2000\/svg)/);
  assert.equal([...source.matchAll(/^import /gm)].length, 1, 'only metrics.js is imported');
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
  const { nodes, document } = fakePage(['lab', 'trace', 'loop', 'unknown']);
  const result = await initWorkPreviews(document, window);
  await result.settled;
  assert.deepEqual(nodes.map(node => node.dataset.previewState), ['fallback', 'fallback', 'fallback', undefined]);
  assert.ok(nodes.every(node => !node.replaced), 'fallback markup untouched');
  assert.deepEqual(urls.map(([url]) => new URL(url).pathname.replace(/^.*\/web\//, '')).sort(), ['lab/data/sentiment-eval.json', 'trace/build-trace.json']);
  assert.ok(urls.every(([url, credentials]) => url.startsWith(new URL('.', new URL('work-previews.js', web)).href) && credentials === 'same-origin'), 'resolved next to the module, same origin');
  // A broken document is swallowed too.
  await assert.doesNotReject(initWorkPreviews({ querySelectorAll() { throw new Error('boom'); } }, window));
});

test('each JSON file is fetched once per page, however many times the previews start', async () => {
  const calls = [];
  const window = { fetch: url => { calls.push(String(url)); return Promise.resolve({ ok: true, json: async () => ({}) }); } };
  for (let round = 0; round < 3; round += 1) {
    const { document } = fakePage(['lab', 'trace', 'lab']);
    await (await initWorkPreviews(document, window)).settled;
  }
  assert.equal(calls.length, 2, `one request per file, got ${calls.length}`);
});

test('styles: 11px text, 44px targets, currentColor theming, motion only when allowed', () => {
  for (const [, selector, body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    for (const size of body.matchAll(/font-size: ([\d.]+)px/g)) assert.ok(Number(size[1]) >= 11, `${selector.trim()} ${size[0]}`);
  }
  assert.match(css, /\.wp-label \{[^}]*font-size: 11px/);
  assert.match(css, /\.wp-seg label \{[^}]*min-height: 44px/);
  assert.match(css, /\.wp-range \{[^}]*height: 44px/);
  assert.match(css, /\.wp-trace-scrub \{[^}]*min-height: 44px/);
  assert.match(source, /4000 \/ width/, 'loop labels render at 12.5px (4000 / width viewBox units)');
  assert.doesNotMatch(css, /(?:@import|url\()/, 'nothing remote');
  const outside = css.replace(/@media \(prefers-reduced-motion: no-preference\) \{[\s\S]*?\n\}/, '').replace(/@keyframes [\w-]+ \{[^\n]*\}\n/g, '');
  assert.doesNotMatch(outside, /transition|animation/, 'motion only when allowed');
  assert.match(source, /reduced\(\) \? 'static' : 'on'/, 'the trace stays static under reduced motion');
  assert.match(source, /if \(reduced\(\) \|\| !win\.SVGAnimationElement\) return;/, 'the loop dot stays still under reduced motion');
  // Text colours are never hard-coded: every color: is currentColor or inherited.
  for (const [, value] of css.matchAll(/[{;]\s*color: ([^;]+);/g)) assert.ok(['currentColor', 'inherit'].includes(value), value);
});

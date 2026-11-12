// The static build-trace page (web/lab/build-trace.html + build-trace.js/.css),
// checked as text and through its pure helpers. Node only (no DOM).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { TRACE_HONESTY, TRACE_CURSORS, TRACE_PAGE } from '../web/entrance.js';
import { TRACE_JSON, HONESTY, CURSORS, readSpans, summarize, groupByDay, agentNote, timeText, offsetText, dayLabel } from '../web/lab/build-trace.js';

const web = new URL('../web/', import.meta.url);
const read = path => readFileSync(new URL(path, web), 'utf8');
const page = read('lab/build-trace.html');
const script = read('lab/build-trace.js');
const css = read('lab/build-trace.css');
const data = JSON.parse(read('trace/build-trace.json'));

test('the page: title, honesty sentence, no-JS link to the raw trace, own script and styles', () => {
  // Scoped honestly, in plain dates (no internal round numbers): the Nov 10–11 redesign only.
  assert.match(page, /<title>The agent run behind this site — Cesar Tortolero<\/title>/);
  assert.match(page, /<h1 id="bt-title" class="lab-title">The agent run behind this site<\/h1>\s*<p class="bt-dated">Recorded Nov 10–11, 2026: the redesign of this site, step by step\.<\/p>/);
  for (const name of ['description', 'og:description', 'twitter:description']) {
    assert.match(page, new RegExp(`(?:name|property)="${name}" content="The recorded agent run behind this portfolio’s redesign on Nov 10–11, 2026: 16 commits`), name);
  }
  for (const name of ['og:title', 'twitter:title']) assert.match(page, new RegExp(`(?:name|property)="${name}" content="The agent run behind this site — Cesar Tortolero"`), name);
  assert.match(page, /This recording covers those two days only\. Earlier work and everything since, including this page, are not in it\./);
  assert.deepEqual([data.run.from, data.run.to], ['3839873', '7395a47'], 'the commits the recording covers');
  assert.doesNotMatch(page, /3839873|7395a47/, 'dates in the page text, not commit hashes');
  assert.equal(data.title, 'The agent run behind this site');
  assert.doesNotMatch(page + data.title, /\brounds? \d/i, 'no internal round numbers');
  assert.equal(HONESTY, TRACE_HONESTY, 'the same sentence as the dock panel');
  assert.equal(CURSORS, TRACE_CURSORS);
  assert.ok(page.includes(`<p class="lab-disclaimer">${TRACE_HONESTY} ${TRACE_CURSORS}</p>`), 'the honesty sentences are in the markup itself');
  // Without JavaScript only the <noscript> line speaks: the status starts empty and hidden.
  assert.match(page, /<p class="bt-status" data-bt="status" role="status" hidden><\/p>/);
  assert.match(script, /status\.textContent = 'Loading the recorded trace…'/);
  assert.match(page, /<noscript><p class="bt-status">[^<]*<a class="lab-link" href="\.\.\/trace\/build-trace\.json">build-trace\.json<\/a>\.<\/p><\/noscript>/);
  assert.match(page, /<script type="module" src="\.\/build-trace\.js"><\/script>/);
  for (const sheet of ['../project.css', './lab.css', './build-trace.css']) assert.ok(page.includes(`<link rel="stylesheet" href="${sheet}">`), sheet);
  assert.match(page, /<link rel="canonical" href="https:\/\/[^"]+\/lab\/build-trace\.html">/);
  assert.doesNotMatch(page, /<script(?![^>]*\bsrc=)[^>]*>/, 'no inline scripts');
  assert.doesNotMatch(page, /\sstyle="/);
  // Every relative link and asset exists.
  for (const [, ref] of page.matchAll(/(?:href|src)="(\.{1,2}\/[^"#]*)/g)) {
    const target = new URL(ref, new URL('lab/build-trace.html', web));
    const file = target.pathname.endsWith('/') ? new URL('index.html', target) : target;
    assert.ok(existsSync(file), `${ref} exists`);
  }
  assert.ok(existsSync(new URL(TRACE_JSON, new URL('lab/build-trace.html', web))), 'the script reads the shipped trace');
  assert.ok(existsSync(new URL(TRACE_PAGE, web)), 'the dock links to this page');
  assert.match(read('sitemap.xml'), /<loc>https:\/\/[^<]+\/lab\/build-trace\.html<\/loc>/);
});

test('the script builds the page with createElement/textContent from ../trace/build-trace.json only', () => {
  assert.match(script, /TRACE_JSON = '\.\.\/trace\/build-trace\.json'/);
  assert.match(script, /window\.fetch\(TRACE_JSON/);
  assert.doesNotMatch(script, /innerHTML|insertAdjacentHTML|outerHTML|document\.write|DOMParser|eval\(|new Function/);
});

test('run summary, roles and checks come from the trace file', () => {
  const summary = summarize(data);
  assert.equal(summary.spans.length, data.spans.length);
  assert.equal(summary.commits, 16);
  assert.equal(summary.dates, 'Nov 10–11, 2026');
  assert.deepEqual(summary.roles.map(role => role.id), ['orchestrator', 'implementation-worker', 'quality-reviewer', 'ui-design-director']);
  assert.equal(summary.roles.reduce((sum, role) => sum + role.count, 0), data.spans.length);
  assert.ok(summary.roles.every(role => role.what));
  assert.equal(summary.tests, data.totals.tests_last);
  assert.deepEqual(summary.tours.map(tour => [tour.width, tour.seconds]), [[1280, 51.4], [390, 46.6]]);
  assert.equal(summary.errors, data.spans.filter(span => span.status === 'error').length);
  assert.ok(summary.recovered > 0 && summary.recovered <= summary.errors);
  assert.equal(summary.saves, summary.commits, 'every commit after the baseline is a recorded save point');
});

test('steps are grouped by day in time order, with exact or estimated times as recorded', () => {
  const groups = groupByDay(readSpans(data));
  assert.deepEqual(groups.map(group => group.label), ['Tuesday, November 10, 2026', 'Wednesday, November 11, 2026']);
  assert.equal(groups.reduce((sum, group) => sum + group.spans.length, 0), data.spans.length);
  for (const group of groups) {
    group.spans.forEach((span, k) => { if (k) assert.ok(span.at >= group.spans[k - 1].at, span.id); });
  }
  const byId = id => data.spans.find(span => span.id === id);
  assert.equal(timeText(byId('s05')), '12:08');
  assert.equal(timeText(byId('s02')), '10:46–11:26');
  assert.equal(timeText(byId('s00')), 'Nov 10 10:12 – Nov 11 12:03');
  assert.equal(offsetText(readSpans(data)), 'UTC−05:00');
  assert.equal(dayLabel('2026-11-11T00:02:12-05:00'), 'Wednesday, November 11, 2026');
  // Bad data is dropped, never thrown.
  assert.deepEqual(readSpans({ spans: [{ id: 'x', role: 'admin', action: 'a', status: 'ok', timing: 'commit', start: 'x', end: 'x' }] }), []);
  assert.deepEqual(readSpans(null), []);
});

test('"What I did vs what the agents did" states only facts from the trace', () => {
  const lines = agentNote(summarize(data));
  const all = lines.join(' ');
  assert.match(all, /^The orchestrator is my primary agent and works under my direction: it plans, delegates, integrates, commits\. It recorded \d+ of the 52 steps, and it made all 16 commits\./);
  assert.match(all, /implementation-worker \(builds assigned sections and fixes tour behavior\) recorded \d+ steps/);
  assert.match(all, /Roles count role types, not separate agent instances\./);
  assert.doesNotMatch(all, /%|percent/i);
});

test('the page styles keep text at 11px or more and status colours at 4.5:1 on the paper', () => {
  for (const size of css.matchAll(/font-size: ([\d.]+)px/g)) assert.ok(Number(size[1]) >= 11, size[0]);
  const lum = hex => {
    const [r, g, b] = [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const ratio = (a, b) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);
  const colours = [...css.matchAll(/\.bt-state \{ color: #([0-9a-f]{6}); \}/g)].map(match => match[1]);
  assert.equal(colours.length, 4);
  for (const colour of colours) assert.ok(ratio(colour, 'eeede8') >= 4.5, colour);
});

test('role chips: the quality-reviewer is teal, never the error red of the status badges', () => {
  const chip = css.match(/\[data-role="quality-reviewer"\] \.bt-chip \{ background: (#[0-9a-f]{6}); \}/)?.[1];
  assert.equal(chip, '#16897f');
  const error = css.match(/\[data-status="error"\] \.bt-state \{ color: (#[0-9a-f]{6}); \}/)[1];
  assert.notEqual(chip, error);
  assert.doesNotMatch(css, /#ff6767/, 'the old red chip is gone');
});

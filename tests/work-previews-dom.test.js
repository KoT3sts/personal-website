// The work previews rendered for real (jsdom): initWorkPreviews against the shipped
// JSON and three containers like the homepage's. Checks the rendered numbers against
// agent-traces-summary.json, the trace caption, the fallback and the tour gate.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { initWorkPreviews, obsSummary } from '../web/work-previews.js';

const web = new URL('../web/', import.meta.url);
const obs = JSON.parse(readFileSync(new URL('lab/data/agent-traces-summary.json', web), 'utf8'));
const trace = JSON.parse(readFileSync(new URL('trace/build-trace.json', web), 'utf8'));
const MARKUP = `<!doctype html><html><body><section id="lab"><ul>
  <li class="open-card"><div class="work-preview" data-preview="obs"><p class="fallback">obs summary</p></div></li>
  <li class="open-card"><div class="work-preview" data-preview="trace"><p class="fallback">trace summary</p></div></li>
  <li class="open-card"><div class="work-preview" data-preview="loop"><p class="fallback">loop summary</p></div></li>
</ul></section></body></html>`;

// jsdom has no fetch, layout or IntersectionObserver: the previews then load at once.
function page({ missing = [], edit = {} } = {}) {
  const { window } = new JSDOM(MARKUP, { url: 'https://portfolio.test/' });
  const requests = [];
  window.fetch = async (url, options) => {
    requests.push([String(url), options?.credentials]);
    const file = new URL(String(url));
    if (missing.some(name => file.pathname.endsWith(name))) return { ok: false, status: 404, json: async () => null };
    const body = JSON.parse(readFileSync(file, 'utf8'));
    const change = Object.entries(edit).find(([name]) => file.pathname.endsWith(name));
    return { ok: true, status: 200, json: async () => (change ? change[1](body) : body) };
  };
  return { window, document: window.document, requests, preview: kind => window.document.querySelector(`.work-preview[data-preview="${kind}"]`) };
}

test('obs, trace and loop go live with the numbers from the shipped JSON', async t => {
  const { window, document, requests, preview } = page();
  t.after(() => window.close());
  await (await initWorkPreviews(document, window)).settled;
  for (const kind of ['obs', 'trace', 'loop']) {
    assert.equal(preview(kind).dataset.previewState, 'live', kind);
    assert.equal(preview(kind).querySelector('.fallback'), null, `${kind} fallback replaced`);
  }
  for (const [url, credentials] of requests) {
    assert.ok(url.startsWith(new URL('.', new URL('work-previews.js', web)).href), url);
    assert.equal(credentials, 'same-origin');
  }

  // Observability: three KPIs, a column per trace, a cell per evaluation, the readout.
  const box = preview('obs');
  const summary = obsSummary(obs);
  assert.deepEqual([...box.querySelectorAll('.wp-kpis > div')].map(row => [row.querySelector('dt').textContent, row.querySelector('dd').textContent]), summary.kpis);
  assert.equal(box.querySelectorAll('.wp-col').length, obs.traces.length);
  const scored = summary.rows.reduce((sum, row) => sum + row.scored, 0);
  assert.equal(box.querySelectorAll('.wp-cell').length, scored);
  assert.equal(box.querySelectorAll('.wp-fail').length, summary.rows.reduce((sum, row) => sum + row.scored - row.pass, 0));
  assert.deepEqual([...box.querySelectorAll('.wp-obs-names li')].map(li => li.textContent), ['Tool errors', 'Recovered', 'Delegated', 'Reviewed', 'Verified', 'Latency']);
  assert.deepEqual([...box.querySelectorAll('.wp-obs-tally li')].map(li => li.textContent), summary.rows.map(row => `${row.pass}/${row.scored}`));
  const range = box.querySelector('.wp-trace-range');
  assert.equal(range.getAttribute('aria-label'), 'Trace');
  assert.equal(range.max, String(obs.traces.length));
  const first = obs.traces[0];
  const escape = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  assert.match(range.getAttribute('aria-valuetext'), new RegExp(`^Trace 1 of ${obs.traces.length} · Nov 7 · ${escape(first.topic)}\\. ${first.toolCalls} tool calls, ${first.toolErrors} failed\\. \\d of \\d checks passed`));
  assert.doesNotMatch(range.getAttribute('aria-valuetext'), /Round \d|undefined/);
  // Keyboard: the last trace.
  range.value = String(obs.traces.length);
  range.dispatchEvent(new window.Event('input', { bubbles: true }));
  assert.match(box.querySelector('.wp-readout .wp-label').textContent, new RegExp(`^Trace ${obs.traces.length} of ${obs.traces.length} · `));
  assert.match(box.querySelector('.wp-caption').textContent, new RegExp(`^${obs.traces.length} traces from the agents that built this site, Nov 7–12, with 6 of the ${obs.evaluators.length} automated checks shown\\.`));
  assert.match(box.querySelector('.wp-sr').textContent, /^Checks passed: Tool error rate \d+ of \d+, /);

  // Trace: one bar per span, a mark per error/retried/fixed, the caption counts.
  const strip = preview('trace');
  const errors = trace.spans.filter(span => span.status === 'error').length;
  assert.equal(strip.querySelectorAll('.wp-mark').length, trace.spans.length);
  assert.equal(strip.querySelectorAll('.wp-mark[data-status="error"] .wp-glyph').length, errors);
  assert.equal(strip.querySelectorAll('.wp-mark .wp-glyph').length, trace.spans.filter(span => span.status !== 'ok').length);
  assert.equal(strip.querySelector('.wp-caption').textContent, `${trace.spans.length} recorded steps, ${errors} ended in an error. Hover or drag across the strip to read each step.`);
  assert.match(strip.querySelector('.wp-trace-range').getAttribute('aria-valuetext'), new RegExp(`^Step 1 of ${trace.spans.length}, `));
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(strip.querySelector('.wp-trace').dataset.play, 'on', 'played once shown (no observer, no tour)');
  assert.equal(box.querySelector('.wp-obs').dataset.play, 'on', 'the grid too');

  // Loop: four labelled stages.
  assert.deepEqual([...preview('loop').querySelectorAll('text')].map(node => node.textContent), ['Trace', 'Classify', 'Fixed test set', 'Gate']);
});

test('a missing file keeps that card\'s static summary', async t => {
  const { window, document, preview } = page({ missing: ['build-trace.json', 'agent-traces-summary.json'] });
  t.after(() => window.close());
  await (await initWorkPreviews(document, window)).settled;
  for (const kind of ['obs', 'trace']) {
    assert.equal(preview(kind).dataset.previewState, 'fallback');
    assert.equal(preview(kind).querySelector('.fallback').textContent, `${kind} summary`);
  }
  assert.equal(preview('loop').dataset.previewState, 'live');
});

test('a trace without a topic or day reads by position, never "undefined"', async t => {
  const strip = body => ({ ...body, traces: body.traces.map((trace, i) => (i ? trace : { id: trace.id, toolCalls: trace.toolCalls, toolErrors: trace.toolErrors })) });
  const { window, document, preview } = page({ edit: { 'agent-traces-summary.json': strip } });
  t.after(() => window.close());
  await (await initWorkPreviews(document, window)).settled;
  const box = preview('obs');
  assert.equal(box.dataset.previewState, 'live');
  const text = box.querySelector('.wp-trace-range').getAttribute('aria-valuetext');
  assert.match(text, new RegExp(`^Trace 1 of ${obs.traces.length}\\. `));
  assert.doesNotMatch(text + box.querySelector('.wp-readout').textContent, /undefined|null/);
});

test('during the build tour the trace waits until the tour shows its card', async t => {
  const { window, document, preview } = page();
  t.after(() => window.close());
  const html = document.documentElement;
  html.classList.add('agentic-touring', 'agentic-running');
  const card = preview('trace').closest('.open-card');
  await (await initWorkPreviews(document, window)).settled;
  const strip = () => preview('trace').querySelector('.wp-trace');
  const tick = () => new Promise(resolve => setTimeout(resolve, 10));
  await tick();
  assert.equal(strip().dataset.play, 'wait', 'not before the tour reaches the card');
  card.dataset.buildState = 'pending';
  await tick();
  assert.equal(strip().dataset.play, 'wait', 'not while the card is pending');
  card.dataset.buildState = 'placing';
  await tick();
  assert.equal(strip().dataset.play, 'on', 'plays as the tour places the card');
  // A card the tour never reached plays when the tour ends.
  const other = page();
  t.after(() => other.window.close());
  other.document.documentElement.classList.add('agentic-touring');
  await (await initWorkPreviews(other.document, other.window)).settled;
  await tick();
  assert.equal(other.preview('trace').querySelector('.wp-trace').dataset.play, 'wait');
  other.document.documentElement.classList.remove('agentic-touring');
  await tick();
  assert.equal(other.preview('trace').querySelector('.wp-trace').dataset.play, 'on');
});

test('pointer moves are coalesced into one frame and an unchanged step writes nothing', async t => {
  const { window, document, preview } = page();
  t.after(() => window.close());
  const frames = [];
  window.requestAnimationFrame = fn => frames.push(fn);
  window.cancelAnimationFrame = id => { frames[id - 1] = () => {}; };
  const flush = () => frames.splice(0).forEach(fn => fn(0));
  await (await initWorkPreviews(document, window)).settled;
  await new Promise(resolve => setTimeout(resolve, 10)); // the grid's one-time play has run
  const box = preview('obs');
  const live = box.querySelector('.wp-obs');
  const range = box.querySelector('.wp-trace-range');
  const n = obs.traces.length;
  let reads = 0;
  range.getBoundingClientRect = () => { reads += 1; return { left: 0, top: 0, width: n * 10, height: 90 }; };
  const spoken = range.getAttribute('aria-valuetext');
  const move = clientX => range.dispatchEvent(new window.MouseEvent('pointermove', { clientX, bubbles: true }));
  range.dispatchEvent(new window.MouseEvent('pointerenter'));

  // Three moves before a frame: one frame, one measure, the last position wins.
  move(5); move(15); move(25);
  assert.equal(frames.length, 1, 'one frame for the burst');
  assert.equal(reads, 0, 'nothing measured outside the frame');
  flush();
  assert.equal(reads, 1);
  assert.equal(range.value, '3');
  assert.match(box.querySelector('.wp-readout .wp-label').textContent, new RegExp(`^Trace 3 of ${n} · `));
  assert.equal(live.dataset.cursor, 'true');
  assert.notEqual(range.getAttribute('aria-valuetext'), spoken);
  assert.match(range.getAttribute('aria-valuetext'), new RegExp(`^Trace 3 of ${n} · `), 'the accessible text follows the shown step');

  // The same trace again: no writes at all, and the box is not measured again.
  const records = [];
  const observer = new window.MutationObserver(list => records.push(...list));
  observer.observe(live, { subtree: true, childList: true, characterData: true, attributes: true });
  move(21); move(29);
  flush();
  await new Promise(resolve => setTimeout(resolve));
  assert.equal(reads, 1, 'measured once per enter');
  assert.deepEqual(records.map(r => r.type), [], 'an unchanged step writes nothing');

  // A scroll drops the measured box; a leave cancels a pending frame and hides the cursor.
  window.dispatchEvent(new window.Event('scroll'));
  move(55);
  flush();
  assert.equal(reads, 2, 'measured again after a scroll');
  assert.equal(range.value, '6');
  move(95);
  range.dispatchEvent(new window.MouseEvent('pointerleave'));
  flush();
  assert.equal(range.value, '6', 'the cancelled frame did not move the cursor');
  assert.equal(live.dataset.cursor, 'false');

  // The keyboard moves it too: input rewrites aria-valuetext.
  range.value = '9';
  range.dispatchEvent(new window.Event('input', { bubbles: true }));
  assert.match(range.getAttribute('aria-valuetext'), new RegExp(`^Trace 9 of ${n} · `));
  observer.disconnect();
});

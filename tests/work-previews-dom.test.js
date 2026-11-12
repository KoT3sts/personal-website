// The work previews rendered for real (jsdom): initWorkPreviews against the shipped
// JSON and three containers like the homepage's. Checks the rendered numbers against
// the lab's Python reference, the trace caption, the fallback and the tour gate.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { initWorkPreviews } from '../web/work-previews.js';

const web = new URL('../web/', import.meta.url);
const lab = JSON.parse(readFileSync(new URL('lab/data/sentiment-eval.json', web), 'utf8'));
const trace = JSON.parse(readFileSync(new URL('trace/build-trace.json', web), 'utf8'));
const MARKUP = `<!doctype html><html><body><section id="lab"><ul>
  <li class="open-card"><div class="work-preview" data-preview="lab"><p class="fallback">lab summary</p></div></li>
  <li class="open-card"><div class="work-preview" data-preview="trace"><p class="fallback">trace summary</p></div></li>
  <li class="open-card"><div class="work-preview" data-preview="loop"><p class="fallback">loop summary</p></div></li>
</ul></section></body></html>`;

// jsdom has no fetch, layout or IntersectionObserver: the previews then load at once.
function page({ missing = [] } = {}) {
  const { window } = new JSDOM(MARKUP, { url: 'https://portfolio.test/' });
  const requests = [];
  window.fetch = async (url, options) => {
    requests.push([String(url), options?.credentials]);
    const file = new URL(String(url));
    if (missing.some(name => file.pathname.endsWith(name))) return { ok: false, status: 404, json: async () => null };
    return { ok: true, status: 200, json: async () => JSON.parse(readFileSync(file, 'utf8')) };
  };
  return { window, document: window.document, requests, preview: kind => window.document.querySelector(`.work-preview[data-preview="${kind}"]`) };
}

test('lab, trace and loop go live with the numbers from the shipped JSON', async t => {
  const { window, document, requests, preview } = page();
  t.after(() => window.close());
  await (await initWorkPreviews(document, window)).settled;
  for (const kind of ['lab', 'trace', 'loop']) {
    assert.equal(preview(kind).dataset.previewState, 'live', kind);
    assert.equal(preview(kind).querySelector('.fallback'), null, `${kind} fallback replaced`);
  }
  for (const [url, credentials] of requests) {
    assert.ok(url.startsWith(new URL('.', new URL('work-previews.js', web)).href), url);
    assert.equal(credentials, 'same-origin');
  }

  // Lab: model B by default, threshold 0.50, every number equal to the reference.
  const box = preview('lab');
  const checked = box.querySelector('input[type="radio"]:checked');
  assert.equal(checked.value, 'B');
  assert.equal(box.querySelector(`label[for="${checked.id}"]`).textContent, 'B · Logistic');
  const slider = box.querySelector('input[type="range"]');
  assert.equal(slider.value, '0.5');
  assert.equal(box.querySelector(`label[for="${slider.id}"]`).textContent, 'Decision threshold');
  assert.equal(box.querySelector('output').textContent, '0.50');
  const ref = lab.reference.B;
  assert.deepEqual([...box.querySelectorAll('.wp-scores dd')].map(dd => dd.textContent), [ref.precision, ref.recall, ref.f1].map(value => value.toFixed(3)));
  assert.deepEqual([...box.querySelectorAll('.wp-count')].map(cell => Number(cell.textContent)), [ref.tp, ref.fn, ref.fp, ref.tn]);
  assert.equal(box.querySelector('caption').textContent, 'Model B confusion matrix at 0.50');
  assert.equal(box.querySelector('.wp-caption').textContent, `Live: the lab’s ${lab.test.length} test sentences.`);
  // Model A through the toggle.
  const a = box.querySelector('input[value="A"]');
  a.checked = true;
  a.dispatchEvent(new window.Event('change', { bubbles: true }));
  assert.deepEqual([...box.querySelectorAll('.wp-count')].map(cell => Number(cell.textContent)), ['tp', 'fn', 'fp', 'tn'].map(key => lab.reference.A[key]));

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

  // Loop: four labelled stages.
  assert.deepEqual([...preview('loop').querySelectorAll('text')].map(node => node.textContent), ['Trace', 'Classify', 'Fixed test set', 'Gate']);
});

test('a missing file keeps that card\'s static summary', async t => {
  const { window, document, preview } = page({ missing: ['build-trace.json', 'sentiment-eval.json'] });
  t.after(() => window.close());
  await (await initWorkPreviews(document, window)).settled;
  for (const kind of ['lab', 'trace']) {
    assert.equal(preview(kind).dataset.previewState, 'fallback');
    assert.equal(preview(kind).querySelector('.fallback').textContent, `${kind} summary`);
  }
  assert.equal(preview('loop').dataset.previewState, 'live');
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

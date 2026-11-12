// Homepage data widgets (web/home-charts.js, web/home-charts.css): the pure
// helpers, and the rules that keep them honest and accessible. Node only (no
// DOM); the DOM behaviour is covered in portfolio.test.js.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CHART_PARSERS, COUNT_MS, countAt, easeOutCubic, formatCount, normalizeTag, parseFigure, usageText } from '../web/home-charts.js';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const html = read('web/index.html');
const css = read('web/home-charts.css');
const js = read('web/home-charts.js');
const plain = markup => markup.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

test('parseFigure finds the one number in a proof figure, keeping prefix, suffix and grouping', () => {
  assert.deepEqual(parseFigure('350'), { prefix: '', value: 350, suffix: '', grouped: false });
  assert.deepEqual(parseFigure(' 250+ '), { prefix: '', value: 250, suffix: '+', grouped: false });
  assert.deepEqual(parseFigure('2,400+'), { prefix: '', value: 2400, suffix: '+', grouped: true });
  assert.equal(parseFigure('Minutes'), null);
  assert.equal(parseFigure('58/58'), null, 'two numbers: not a single figure');
  assert.equal(parseFigure(''), null);
  assert.equal(formatCount(2400, true), '2,400');
  assert.equal(formatCount(12.4), '12');
});

test('the count-up eases out and lands exactly on the final value', () => {
  assert.equal(countAt(350, 0), 0);
  assert.equal(countAt(350, COUNT_MS), 350);
  assert.equal(countAt(350, COUNT_MS * 5), 350, 'never overshoots');
  assert.equal(countAt(250, -10), 0);
  assert.ok(countAt(350, COUNT_MS / 2) > 350 / 2, 'ease-out: past halfway at half time');
  let last = -1;
  for (let t = 0; t <= COUNT_MS; t += 50) { const value = countAt(350, t); assert.ok(value >= last); last = value; }
  assert.equal(easeOutCubic(1), 1);
  assert.equal(countAt(7, 100, 0), 7, 'a zero duration shows the value');
});

test('each chart reads its numbers from the card sentence on the page, and nothing else', () => {
  const proof = title => {
    const card = html.match(new RegExp(`<h3>${title}</h3>\\s*<p class="capability-proof">([\\s\\S]*?)</p>`))?.[1];
    assert.ok(card, title);
    return plain(card);
  };
  assert.deepEqual(CHART_PARSERS.jobs(proof('Run multi-region releases')), { runs: [{ label: 'US', passed: 58, total: 58 }, { label: 'EU', passed: 21, total: 21 }] });
  assert.deepEqual(CHART_PARSERS.inventory(proof('Run MLOps and model deployment')), { count: 296 });
  assert.deepEqual(CHART_PARSERS.records(proof('Trace and evaluate LLM systems')), { records: '2,400+', metrics: ['precision', 'recall', 'F1'] });
  assert.deepEqual(CHART_PARSERS.videos(proof('Teach and unblock developers')), { count: 12 });
  // Without the number in the sentence there is no chart.
  assert.equal(CHART_PARSERS.jobs('Weekly releases with green jobs.'), null);
  assert.equal(CHART_PARSERS.inventory('a large model inventory'), null);
  assert.equal(CHART_PARSERS.records('Evaluated a model with precision and recall.'), null);
  assert.equal(CHART_PARSERS.videos('an onboarding guide and demo videos'), null);
  assert.equal(CHART_PARSERS.jobs('5/4 US'), null, 'more passed than run is refused');
  // Exactly the four cards that state a number ask for a chart.
  assert.deepEqual([...html.matchAll(/<li class="capability" data-chart="([a-z]+)">/g)].map(match => match[1]), ['records', 'inventory', 'jobs', 'videos']);
});

test('skill matching ignores case and spacing; the usage line names places or says there are none', () => {
  assert.equal(normalizeTag('  Amazon   SageMaker '), 'amazon sagemaker');
  assert.equal(normalizeTag('MLflow'), normalizeTag('mlflow'));
  assert.equal(usageText('MCP', ['A', 'B']), 'MCP — used in: A · B.');
  assert.equal(usageText('Python', ['Cloud infrastructure & release engineering (Machine Learning Engineer)']), 'Python — used in: Cloud infrastructure & release engineering (Machine Learning Engineer).');
  assert.equal(usageText('SQL', []), 'SQL — not tagged on a card or role above.');
});

test('the widgets build DOM only (no HTML strings), keep charts out of the accessibility tree and respect reduced motion and print', () => {
  assert.doesNotMatch(js, /innerHTML|insertAdjacentHTML|outerHTML|document\.write/);
  assert.match(js, /createElementNS\(SVG_NS/);
  assert.match(js, /box\.setAttribute\('aria-hidden', 'true'\)/);
  assert.match(js, /ink\.setAttribute\('aria-hidden', 'true'\)/, 'the counting copy is hidden; the final figure is read');
  assert.match(js, /prefers-reduced-motion: reduce/);
  assert.match(js, /typeof window\.IntersectionObserver === 'function'/, 'no observer: final state at once');
  assert.match(js, /\[data-build-state="pending"\], \[data-reveal="pending"\]/, 'waits for the build tour and scroll reveals');
  // Hidden start states exist only behind the armed class and only without reduced motion.
  const motion = css.match(/@layer motion \{([\s\S]*?)\n\}\n/)?.[1] ?? '';
  assert.match(motion, /@media \(prefers-reduced-motion: no-preference\)/);
  for (const rule of css.replace(motion, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (/opacity: 0|clip-path: inset\(0 100%/.test(rule[2])) assert.fail(`hidden state outside the motion layer: ${rule[1].trim()}`);
  }
  assert.match(css, /@media print \{[^@]*\.proof-count-ink \{ display: none !important; \}/);
  assert.match(css, /\.cap-chart \*, \.cap-chart \.cap-mark \{ clip-path: none !important; opacity: 1 !important; transform: none !important; \}/);
  // Labels stay readable: the label token, never a fixed size under 11px.
  for (const size of css.matchAll(/font-size: ([\d.]+)px/g)) assert.ok(Number(size[1]) >= 11, size[0]);
  assert.match(css, /\.cap-chart \.mono \{ font-size: var\(--text-label\);/);
});

test('skill tags keep a 44px-tall hit area without overlapping the next row', () => {
  const pill = Number(/\.skill-tag \{[^}]*min-height: (\d+)px/.exec(css)?.[1]);
  const gap = Number(/\.has-skill-links \.skill-list \.tag-list \{ row-gap: (\d+)px; \}/.exec(css)?.[1]);
  const reach = Number(/\.skill-tag::before \{[^}]*inset: -(\d+)px 0;/.exec(css)?.[1]);
  assert.ok(pill + 2 * reach >= 44, `${pill} + 2 x ${reach}`);
  assert.ok(reach * 2 <= gap, 'hit areas of stacked rows do not overlap');
  assert.match(css, /\.skill-tag\[aria-pressed="true"\] \{[^}]*background: var\(--green\);[^}]*color: var\(--night\);/);
});

test('the release chart is captioned as one release, one block per job', () => {
  assert.match(js, /'ONE RELEASE · ONE BLOCK PER JOB'/);
  assert.doesNotMatch(js, /ALL GREEN/);
});

test('forced colors: the pressed tag, matched cards and roles, and the charts stay visible in system colours', () => {
  const forced = css.match(/@media \(forced-colors: active\) \{([\s\S]*?)\n {2}\}/)?.[1] ?? '';
  assert.ok(forced, 'a forced-colors block');
  assert.match(forced, /\.skill-tag\[aria-pressed="true"\] \{ forced-color-adjust: none; background: Highlight;[^}]*outline: 2px solid Highlight;/);
  assert.match(forced, /\.capability\.is-skill-match, \.xp-group\.is-skill-match \{ outline: 2px solid Highlight;/);
  assert.match(forced, /\.tag-list li\.is-skill-hit \{ forced-color-adjust: none;[^}]*outline: 2px solid Highlight;/);
  assert.match(forced, /\.cap-chart svg, \.cap-band-fill, \.cap-tick::before \{ forced-color-adjust: none; \}/);
  assert.match(forced, /\.cap-on, \.cap-dot-play \{ fill: CanvasText; \}/);
  assert.match(forced, /\.cap-dot-ring \{ stroke: CanvasText; \}/);
});

test('only skill tags some card or role lists become buttons; the hint says which', () => {
  assert.match(js, /if \(!hits\.length\) return;/);
  assert.match(js, /'Tags with a dot are used on a card or role above\. Pick one to see where\.'/);
  // Only presses and clears reach the live region.
  assert.match(js, /live\.setAttribute\('aria-live', 'polite'\)/);
  assert.equal((js.match(/announce\(/g) || []).length, 3, 'defined once, called on press and on clear');
  assert.match(css, /\.skill-tag::after \{ content: ""; flex: none; width: 6px; height: 6px; border-radius: 50%; background: var\(--green\); \}/);
});

test('capability charts: labels at 11px or more, one scale for both job rows, every block drawn from zero', () => {
  const styles = read('web/styles.css');
  assert.match(styles, /--text-label: clamp\(11px,/, 'the mono label size never drops under 11px');
  assert.match(css, /\.cap-chart \.mono \{ font-size: var\(--text-label\);/);
  for (const [, size] of css.matchAll(/font-size: ([\d.]+)px/g)) assert.ok(Number(size) >= 11, `${size}px`);
  assert.match(js, /const widest = Math\.max\(\.\.\.runs\.map\(run => run\.total\)\);/, 'both regions share the widest total as the scale');
  assert.match(js, /for \(let i = 0; i < run\.total; i\+\+\) svgEl\(document, 'rect', \{ x: i \* \(cell \+ gap\)/, 'one block per job, from x = 0');
});

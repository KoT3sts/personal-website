// Experience chapters (SPECIFICATION V05): markup, styles, script and tour
// wiring, checked as text (no DOM needed).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DISTANCE_PER_CHAPTER, HOLD_SHARE, travelPlan, trackAt } from '../web/experience.js';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const html = read('web/index.html');
const css = read('web/experience.css');
const js = read('web/experience.js');
const styles = read('web/styles.css');
const entrance = read('web/entrance.js');

const start = html.indexOf('<section id="experience"');
const section = html.slice(start, html.indexOf('\n    </section>', start));
const text = fragment => fragment.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const all = (pattern, source = section) => [...source.matchAll(pattern)];

test('the section stays a labelled dark landmark with its heading and summary', () => {
  assert.ok(start > 0, 'experience section found');
  assert.match(section, /^<section id="experience" class="experience dark-section" aria-labelledby="experience-title">/);
  assert.match(section, /<h2 id="experience-title">BUILD\. TEACH\. ?<br><span>SHIP\. DEBUG\.<\/span><\/h2>/);
  assert.match(section, /Machine learning engineering at ADP since July 2024\. Before that, brain-computer interface research at Kennesaw State University\./);
  assert.match(section, /03 \/ EXPERIENCE/);
});

test('three chapters, each an article named by its own title', () => {
  const chapters = all(/<article class="xp-chapter" id="([^"]+)" aria-labelledby="([^"]+)">/g);
  assert.deepEqual(chapters.map(match => match[1]), ['xp-ml', 'xp-associate', 'xp-ksu']);
  for (const [, , label] of chapters) assert.match(section, new RegExp(`<h3 class="xp-title" id="${label}"`), label);
  // Background years are decoration; the layered title copy is CSS-only (no duplicate text).
  assert.deepEqual(all(/<span class="xp-year" aria-hidden="true">(\d{4})<\/span>/g).map(match => match[1]), ['2026', '2024', '2021']);
  assert.deepEqual(all(/data-ghost="([^"]+)"/g).map(match => match[1]), ['Machine Learning Engineer', 'Associate ML Engineer', 'Lead Researcher']);
});

test('every existing fact is kept: titles, dates, place, bullets and tags', () => {
  const plain = text(section);
  for (const fact of [
    'Machine Learning Engineer', 'AUG 2026 – PRESENT', 'Associate ML Engineer', 'JUL 2024 – JUL 2026', 'ROSELAND, NJ',
    'Lead Researcher, Thoughts-to-Text BCI', 'SEP 2021 – MAY 2023', 'KENNESAW STATE UNIVERSITY',
    'AI agent platform & applied AI', 'Cloud infrastructure & release engineering', 'MLOps & GenAI', 'Brain-computer interface',
  ]) assert.ok(plain.includes(fact), fact);
  for (const datetime of ['2026-08', '2024-07', '2026-07', '2021-09', '2023-05']) assert.match(section, new RegExp(`<time datetime="${datetime}">`), datetime);
  const bullets = all(/<ul class="xp-points">([\s\S]*?)<\/ul>/g).flatMap(match => all(/<li>([\s\S]*?)<\/li>/g, match[1]).map(item => text(item[1])));
  assert.equal(bullets.length, 13, 'four + three + three + three bullets');
  for (const start of ['Co-delivered 18+ hands-on workshops to ~350 developers', 'Debugged production agent integrations', 'Set up LLM tracing and evaluation',
    'Hardened a developer-portal API', 'Built a serverless cross-account network-testing API', 'Built a network-diagnostics app', 'Ran 6+ weekly multi-region releases',
    'Supported Databricks Unity Catalog and MLflow model migrations', 'Root-caused SageMaker endpoint deployment failures in Jenkins.', 'Built GenAI playground features with Streamlit and LangChain.',
    'Designed EEG preprocessing pipelines that raised classification accuracy by 15%.', 'Presented the work at NCUR and received a $2,000 Research Excellence stipend.', 'Mentored 50+ undergraduate researchers (2022–2023).']) {
    assert.ok(bullets.some(bullet => bullet.startsWith(start)), start);
  }
  const tags = all(/<ul class="tag-list" aria-label="(?:Tools|Topics)">([\s\S]*?)<\/ul>/g).flatMap(match => all(/<li>([^<]+)<\/li>/g, match[1]).map(item => item[1]));
  assert.equal(tags.length, 29);
  for (const tag of ['Strands Agents', 'AWS Bedrock AgentCore', 'OpenInference', 'SSM Run Command', 'Artifactory', 'Databricks Unity Catalog', 'LangChain', 'Signal preprocessing']) assert.ok(tags.includes(tag), tag);
});

test('controls ship hidden, are real buttons and keep 44px targets', () => {
  assert.match(section, /<div class="xp-controls" hidden>/);
  assert.match(section, /<nav class="xp-index" aria-label="Experience chapters">/);
  assert.equal(all(/<button class="xp-index-button" type="button" data-xp-go="\d" aria-controls="xp-[a-z]+">/g).length, 3);
  assert.match(section, /data-xp-step="-1" aria-label="Previous chapter"/);
  assert.match(section, /data-xp-step="1" aria-label="Next chapter"/);
  assert.match(css, /\.xp-index-button \{[^}]*min-height: 44px/);
  assert.match(css, /\.xp-step \{[^}]*width: 44px; height: 44px/);
});

test('the pinned travel is opt-in: script-gated, screen-only, and never wider than the page', () => {
  // Stacked is the default; travel rules only apply under data-xp="travel" inside @media screen.
  const travel = css.slice(css.indexOf('@media screen {'));
  assert.ok(css.indexOf('@media screen {') > css.indexOf('.xp-chapter {'), 'stacked rules come first');
  assert.match(travel, /\.experience\[data-xp="travel"\] \.xp-stage \{ position: sticky; top: 0; height: 100svh; overflow: clip;/);
  assert.match(css, /\.experience \{[^}]*overflow-x: clip/);
  assert.match(css, /animation-timeline: view\(block 0px 0px\); animation-range: contain 0% contain 100%/);
  assert.match(css, /@property --xp-p/);
  // The timeline drives the scroll progress (--xp-q); the track position (--xp-p) is mapped from it.
  assert.match(css, /@property --xp-q/);
  assert.match(css, /@keyframes xp-progress \{ from \{ --xp-q: 0; \} to \{ --xp-q: 1; \} \}/);
  assert.match(css, /\.xp-track \{[^}]*translate3d\(calc\(var\(--xp-p\) \* var\(--xp-shift, 0px\) \* -1\)/);
  assert.match(js, /travel\.style\.setProperty\('--xp-p', state\.plan\.css\)/);
  assert.match(js, /if \(!timeline\) travel\.style\.setProperty\('--xp-q'/);
  // Phones, short windows and reduced motion stay stacked (no pinning).
  assert.match(js, /min-width: 761px\) and \(min-height: 600px\) and \(prefers-reduced-motion: no-preference\)/);
  assert.match(js, /export function initExperience\(document, window\)/);
  assert.match(js, /addEventListener\('scroll', schedule, \{ passive: true \}\)/);
  assert.doesNotMatch(js, /preventDefault\(\)[^;]*wheel|addEventListener\('wheel'/, 'the wheel is never captured');
  // Keyboard: chapters become focusable in travel mode and focus brings them into view.
  assert.match(js, /setAttribute\('tabindex', '0'\)/);
  assert.match(js, /addEventListener\('focusin'/);
});

test('the build tour builds the chapters on stage and never waits on hidden ones', () => {
  const stop = entrance.slice(entrance.indexOf("{ sel: '#experience'"), entrance.indexOf("{ sel: '#work'"));
  assert.ok(stop.length > 0);
  const weight = Number(/weight: ([\d.]+)/.exec(stop)[1]);
  assert.ok(weight <= 1.5, `weight ${weight}`);
  assert.doesNotMatch(stop, /role-/);
  for (const selector of ['.xp-year', '.xp-title', '.xp-org', '.xp-when', '.xp-group-head', '.xp-points', '.xp-controls', '.xp-stage']) {
    assert.ok(stop.includes(selector), selector);
    assert.ok(section.includes(`class="${selector.slice(1)}`) || section.includes(` ${selector.slice(1)}"`) || section.includes(`"${selector.slice(1)} `), `${selector} in the markup`);
  }
  // Chapters off-stage are skipped (`shown`) and wait unseen only while touring.
  assert.equal((stop.match(/shown: true/g) || []).length, 7);
  assert.match(css, /html\.agentic-touring \.experience\[data-xp="travel"\] \.xp-chapter:not\(\[data-reached\]\) \{ visibility: hidden; \}/);
});

test('the old light-section role rules are gone from styles.css', () => {
  assert.doesNotMatch(styles, /\.role[\s,{.-]/);
  assert.doesNotMatch(styles, /\.experience \{/);
});

test('each chapter rests aligned for part of its scroll before the next slides in', () => {
  // Measured 1280 x 800 layout: chapter offsets 0, 1608 and 2736 px; the moves take
  // DISTANCE_PER_CHAPTER stage heights each (as experience.js measures them).
  const stops = [0, 1608, 2736];
  const moves = Math.min(2736, 3 * DISTANCE_PER_CHAPTER * 800);
  const plan = travelPlan(stops, 2736, moves);
  assert.ok(HOLD_SHARE >= 0.2 && HOLD_SHARE <= 0.25, `hold share ${HOLD_SHARE}`);
  assert.equal(plan.holds.length, 3);
  const hold = (moves / 3) * HOLD_SHARE / (1 - HOLD_SHARE);
  assert.equal(plan.distance, Math.round(moves + 3 * hold));
  // Short enough to read three chapters without a long sideways haul: about
  // 1.7 stage heights of pinned scroll (it was 3.1), the section about 2,570 px
  // tall at 1280 x 800 (heading 383 + stage 800 + travel) instead of 3,671.
  assert.ok(plan.distance >= 1.6 * 800 && plan.distance <= 1.8 * 800, `distance ${plan.distance}`);
  assert.ok(383 + 800 + plan.distance <= 3671 * 0.72, `section ${383 + 800 + plan.distance}`);
  // Each rest is still a real stop (about one wheel notch or more).
  assert.ok(hold >= 90, `rest ${hold}`);
  plan.holds.forEach(([from, to], index) => {
    // Flat: anywhere inside the rest, the track shows that chapter at the gutter.
    for (const q of [from, (from + to) / 2, to]) assert.ok(Math.abs(trackAt(plan, q) * 2736 - stops[index]) < 0.5, `chapter ${index} at ${q}`);
    // The rest is HOLD_SHARE of the chapter's span (its share of the moves plus the rest).
    const span = (to - from) * plan.distance;
    assert.ok(Math.abs(span - hold) < 1, `rest ${span}`);
  });
  assert.equal(plan.holds[0][0], 0, 'the first rest starts the pin');
  assert.ok(Math.abs(plan.holds[2][1] - 1) < 1e-9, 'the last rest ends it');
  // Between rests the track moves monotonically and continuously.
  let last = -1;
  for (let q = 0; q <= 1.0001; q += 0.01) { const p = trackAt(plan, q); assert.ok(p >= last - 1e-9); last = p; }
  // The build tour rebuilds the plan from --xp-distance alone (moves = distance x
  // (1 - HOLD_SHARE)); it must land on the same rests and the same map.
  const tour = travelPlan(stops, 2736, plan.distance * (1 - HOLD_SHARE));
  tour.holds.forEach(([from, to], index) => assert.ok(Math.abs(from - plan.holds[index][0]) < 1e-3 && Math.abs(to - plan.holds[index][1]) < 1e-3, `tour rest ${index}`));
  for (let q = 0; q <= 1.0001; q += 0.05) assert.ok(Math.abs(trackAt(tour, q) - trackAt(plan, q)) < 1e-3, `tour track at ${q}`);
  // The CSS map is the same function: evaluate it for a few q.
  const evaluate = q => Function(`return ${plan.css.replace(/^calc/, '').replace(/clamp\(0, /g, 'Math.min(1, Math.max(0, ').replace(/, 1\)/g, '))').replaceAll('var(--xp-q)', String(q))}`)();
  for (const q of [0, 0.03, 0.2, 0.5, plan.holds[1][0] + 0.01, 0.8, 0.99, 1]) assert.ok(Math.abs(evaluate(q) - trackAt(plan, q)) < 1e-4, `css at ${q}`);
});

test('build-tour contract: --xp-at is where each chapter rest begins, buttons land mid-rest and announce the target', () => {
  assert.match(js, /chapter\.style\.setProperty\('--xp-at', \(state\.plan\.holds\[index\]\?\.\[0\] \?\? 0\)\.toFixed\(4\)\)/);
  assert.match(js, /section\.style\.setProperty\('--xp-shift'/);
  assert.match(js, /section\.style\.setProperty\('--xp-distance'/);
  assert.match(js, /const share = hold \? \(hold\[0\] \+ hold\[1\]\) \/ 2 : 0;/);
  assert.match(js, /if \(announceFor === current\)/);
  // The year still drifts while its chapter rests (it follows the scroll, not the track).
  assert.match(css, /\.xp-year \{[^}]*translate3d\(calc\(\(var\(--xp-q\) - var\(--xp-at, 0\)\)/);
});

test('degenerate plans fall back to a straight map', () => {
  const flat = travelPlan([0], 0, 0);
  assert.equal(flat.distance, 0);
  assert.equal(trackAt(flat, 0.4), 0.4);
});

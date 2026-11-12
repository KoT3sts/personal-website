// Experience chapters (SPECIFICATION V05): markup, styles, script and tour
// wiring, checked as text (no DOM needed).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DISTANCE_PER_CHAPTER, HOLD_SHARE, travelPlan, trackAt, hitBoxes, MIN_HIT, monthIndex, monthLabel, nowMonth, roleRange, rangeText, yearsIn, timelinePlan } from '../web/experience.js';

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
  assert.match(section, /<h2 id="experience-title">WORK <br><span>EXPERIENCE\.<\/span><\/h2>/);
  assert.match(section, /<span>BUILD · TEACH · SHIP · DEBUG<\/span>/, 'the old slogan stays as the small header line');
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
    'AI agent platform & applied AI', 'Cloud infrastructure & release engineering', 'MLOps & GenAI', 'Brain-computer interface', 'Research Peer Mentor',
  ]) assert.ok(plain.includes(fact), fact);
  for (const datetime of ['2026-08', '2024-07', '2026-07', '2021-09', '2023-05']) assert.match(section, new RegExp(`<time datetime="${datetime}">`), datetime);
  const bullets = all(/<ul class="xp-points">([\s\S]*?)<\/ul>/g).flatMap(match => all(/<li>([\s\S]*?)<\/li>/g, match[1]).map(item => text(item[1])));
  assert.equal(bullets.length, 13, 'four + three + three + two + one bullets');
  for (const start of ['Co-delivered 18+ hands-on workshops to ~350 developers', 'Debugged production agent integrations', 'Set up LLM tracing and evaluation',
    'Hardened a developer-portal API', 'Built a serverless cross-account network-testing API', 'Built a network-diagnostics app', 'Ran 6+ weekly multi-region releases',
    'Supported Databricks Unity Catalog and MLflow model migrations', 'Root-caused SageMaker endpoint deployment failures in Jenkins.', 'Built GenAI playground features with Streamlit and LangChain.',
    'Researched decoding attempted handwriting from EEG, one character at a time, and mapped how characters separate with an autoencoder and t-SNE.', 'Presented the work at NCUR and received a $2,000 Research Excellence stipend.', 'Mentored 50+ undergraduate researchers (2022–2023).']) {
    assert.ok(bullets.some(bullet => bullet.startsWith(start)), start);
  }
  const tags = all(/<ul class="tag-list" aria-label="(?:Tools|Topics)">([\s\S]*?)<\/ul>/g).flatMap(match => all(/<li>([^<]+)<\/li>/g, match[1]).map(item => item[1]));
  assert.equal(tags.length, 29);
  for (const tag of ['Strands Agents', 'AWS Bedrock AgentCore', 'OpenInference', 'SSM Run Command', 'Artifactory', 'Databricks Unity Catalog', 'LangChain', 'Autoencoder', 't-SNE']) assert.ok(tags.includes(tag), tag);
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
  // Stacked is the default; travel rules only apply with scripts (html[data-tour], set by the inline
  // <head> script, so from the first paint), on screens matching TRAVEL_MEDIA, unless
  // experience.js found the chapters do not fit (data-xp="stack").
  const media = js.match(/const TRAVEL_MEDIA = '([^']+)';/)[1];
  const travelAt = css.indexOf(`@media screen and ${media} {`);
  assert.ok(travelAt > css.indexOf('.xp-chapter {'), 'stacked rules come first; the travel query mirrors TRAVEL_MEDIA');
  const travel = css.slice(travelAt, css.indexOf('\n  }\n', travelAt));
  assert.match(travel, /:root\[data-tour\] \.experience:not\(\[data-xp="stack"\]\) \.xp-stage \{ position: sticky; top: 0; height: 100svh; overflow: clip;/);
  assert.doesNotMatch(css.replace(/html\.agentic-touring \.experience\[data-xp="travel"\][^\n]*/g, ''), /\.experience\[data-xp="travel"\]/, 'only the tour rules wait for experience.js');
  // Every use of the first-paint selector sits inside the travel query (the tablet sizes nest one).
  for (const match of css.matchAll(/:root\[data-tour\] \.experience:not\(\[data-xp="stack"\]\)/g)) {
    const before = css.slice(0, match.index);
    assert.ok(before.lastIndexOf(`@media screen and ${media} {`) > before.lastIndexOf('\n  }\n'), `inside the travel query at ${match.index}`);
  }
  assert.match(js, /section\.dataset\.xp = 'stack';/, 'stacking is explicit, so the first-paint travel layout lets go');
  assert.doesNotMatch(js, /delete section\.dataset\.xp;/);
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
  assert.match(js, /const TRAVEL_MEDIA = '\(min-width: 761px\) and \(prefers-reduced-motion: no-preference\) and \(\(\(min-width: 1500px\) and \(min-height: 600px\)\) or /);
  assert.match(js, /export function initExperience\(document, window(?:, options = \{\})?\)/);
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

// ---- Career timeline (round 10) ----
// The same inputs experience.js reads from the DOM, taken from the markup as text.
const chapterWhens = all(/<p class="xp-when mono">([\s\S]*?)<\/p>/g).map(match => ({ times: all(/<time datetime="([^"]+)">/g, match[1]).map(time => time[1]), text: text(match[1]) }));
const groupYears = all(/<div class="xp-group-head"><span class="mono">([^<]+)<\/span>/g).flatMap(match => yearsIn(match[1]));
const education = [...html.matchAll(/<li><span class="school">[^<]*<\/span><span class="degree">([^<]+)<\/span><span class="mono school-meta">([^<]+)<\/span><\/li>/g)]
  .map(match => ({ degree: match[1], from: yearsIn(match[2])[0], to: yearsIn(match[2]).at(-1) }));
const NOV_2026 = nowMonth(new Date(2026, 10, 12));
const roles = chapterWhens.map(when => roleRange(when.times, when.text));

test('timeline roles, gap and year markers come from the markup', () => {
  assert.equal(monthIndex('2024-07'), 2024 * 12 + 6);
  assert.equal(monthLabel(monthIndex('2021-09')), 'Sep 2021');
  assert.deepEqual(yearsIn('2024 – 2025'), [2024, 2025]);
  assert.deepEqual(yearsIn('RESEARCH'), []);
  assert.deepEqual(roles.map(rangeText), ['Aug 2026 – present', 'Jul 2024 – Jul 2026', 'Sep 2021 – May 2023']);
  assert.ok(education.some(item => /^B\.S\./.test(item.degree)), 'the KSU degree row is read');

  const plan = timelinePlan(roles, { now: NOV_2026, years: groupYears, education });
  // Sep 2021 to the end of Nov 2026: 63 months.
  assert.equal(monthLabel(plan.from), 'Sep 2021');
  assert.equal(plan.total, 63);
  const months = span => Math.round((span.to - span.from) * plan.total);
  assert.deepEqual(plan.spans.map(months), [4, 25, 21], 'ML (to now), Associate, KSU');
  assert.equal(plan.spans[0].to, 1, 'the current role runs to now');
  assert.ok(Math.abs(plan.spans[1].to - plan.spans[0].from) < 1e-9, 'Associate ends where ML starts');
  assert.deepEqual(plan.order, [2, 1, 0], 'chronological: KSU, Associate, ML');
  // The gap after KSU is labelled only because the B.S. years (2021 – 2024) cover it.
  assert.equal(plan.gaps.length, 1);
  // Only the months strictly between the roles: KSU owns May 2023, Associate owns Jul 2024.
  assert.equal(rangeText({ start: plan.gaps[0].start, end: plan.gaps[0].end }), 'Jun 2023 – Jun 2024');
  assert.equal(Math.round((plan.gaps[0].to - plan.gaps[0].from) * plan.total), 13, 'the dashed span covers those 13 months');
  assert.equal(plan.gaps[0].label, 'Finishing B.S.');
  assert.equal(timelinePlan(roles, { now: NOV_2026, years: groupYears, education: [] }).gaps[0].label, undefined, 'no source, no label');
  assert.equal(timelinePlan(roles, { now: NOV_2026, education: [{ degree: 'B.S. Computer Science', from: 2019, to: 2023 }] }).gaps[0].label, undefined, 'a degree that ended before the gap does not explain it');
  // Group years (2022 – 2023, 2024 – 2025, 2026) as markers at each January, then Now.
  assert.deepEqual(plan.markers.map(marker => marker.year), ['2022', '2023', '2024', '2025', '2026', 'Now']);
  assert.ok(Math.abs(plan.markers[0].at - 4 / 63) < 1e-9);
  // A clock behind the markup never cuts a role short; a later "now" stretches the axis.
  assert.equal(timelinePlan(roles, { now: monthIndex('2020-01') }).total, 60);
  assert.equal(timelinePlan(roles, { now: monthIndex('2027-11') }).total, 75);
});

test('timeline is built with DOM APIs only and reuses the chapter index buttons', () => {
  const build = js.slice(js.indexOf('function buildTimeline()'), js.indexOf('function setCurrentButton'));
  assert.ok(build.length > 500);
  assert.doesNotMatch(js, /innerHTML|insertAdjacentHTML|outerHTML|setAttribute\('style'|\.style\.(?!setProperty|removeProperty|getPropertyValue)\w+\s*=/, 'no HTML strings or style attributes');
  for (const match of js.matchAll(/style\.setProperty\('([^']+)'/g)) assert.ok(match[1].startsWith('--'), `custom properties only: ${match[1]}`);
  assert.match(build, /document\.createElement\(tag\)/);
  assert.match(build, /node\.textContent = text/);
  // Names like "Associate ML Engineer, Jul 2024 – Jul 2026"; aria-current stays on the button for the current chapter.
  assert.match(build, /button\.setAttribute\('aria-label', `\$\{name\}, \$\{dates\}`\)/);
  assert.match(js, /button\.setAttribute\('aria-current', 'true'\)/);
  // No new live region: the chapter announcement stays the only one.
  assert.equal((js.match(/aria-live/g) || []).length, 1);
  // The decorative parts are hidden from assistive tech.
  for (const part of ['text', 'lane', 'node', 'axis', 'marks']) assert.match(build, new RegExp(`${part}\\.setAttribute\\('aria-hidden', 'true'\\)`), part);
  // The real "now" by default; tests and the tour can pin it.
  assert.match(build, /nowMonth\(options\.now instanceof Date \? options\.now : new Date\(\)\)/);
  // Stacked, a span scrolls to its chapter; on the stage it uses the chapter buttons' goTo.
  assert.match(js, /if \(state\.mode === 'travel'\) goTo\(Number\(button\.dataset\.xpGo\), \{ announce: true \}\);\s*else chart\?\.jump/);
});

test('timeline fits the controls band, draws in once with motion, and stays readable', () => {
  // The axis lives in the controls band (72-96px), so the pinned stretch keeps its length.
  const band = Number(/--xp-bar: clamp\((\d+)px/.exec(css)[1]);
  const axis = Number(/\.xp-tl\[data-xp-layout="axis"\] \{[^}]*height: (\d+)px/.exec(css)[1]);
  assert.ok(axis <= band - 8, `axis ${axis}px in a ${band}px band`);
  assert.match(css, /\.xp-tl\[data-xp-layout="axis"\] \{[^}]*width: min\(760px, 100cqw - 2 \* var\(--gutter\) - 240px\)/);
  // Phones and stacked chapters: rows that never exceed the column.
  assert.match(css, /\.xp-tl\[data-xp-layout="rows"\] \{[^}]*width: min\(100%, 760px\)/);
  // The draw-in only exists with motion; pending is set by the script only then.
  const motion = css.slice(css.indexOf('@media screen and (prefers-reduced-motion: no-preference) {'));
  assert.ok(motion.length > 0);
  assert.match(motion.slice(0, motion.indexOf('\n  }')), /\.xp-tl\[data-xp-draw="pending"\] :is\(\.xp-tl-axis, \.xp-tl-bar\) \{ transform: scaleX\(0\); \}/);
  assert.equal((css.match(/\[data-xp-draw="pending"\]/g) || []).length, 2, 'only inside the motion block');
  assert.match(js, /if \(window\.IntersectionObserver && !reduce\?\.matches\) \{\s*nav\.dataset\.xpDraw = 'pending';/);
  // Text at least 11px and 4.5:1 on the night ground; bars at least 3:1.
  const lum = hex => {
    const [r, g, b] = [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const ratio = (a, b) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);
  const rules = [...css.matchAll(/([^{}]*\.xp-tl[^{}]*)\{([^{}]*)\}/g)];
  assert.ok(rules.length > 20);
  for (const [, selector, body] of rules) {
    for (const size of body.matchAll(/font-size: ([\d.]+)px/g)) assert.ok(Number(size[1]) >= 11, `${selector.trim()} ${size[0]}`);
    for (const color of body.matchAll(/(?:^|[ ;])color: #([0-9a-f]{6})/g)) assert.ok(ratio(color[1], '101114') >= 4.5, `${selector.trim()} #${color[1]}`);
  }
  assert.ok(ratio(/--xp-tl-bar: #([0-9a-f]{6})/.exec(css)[1], '101114') >= 3, 'inactive bars');
  assert.match(css, /@media print \{ \.xp-tl \{ display: none; \} \}/);
});

test('every role span is at least 44px to hit, its bar still to scale and no hit areas overlap', () => {
  const plan = timelinePlan(roles, { now: NOV_2026 });
  const spans = plan.spans;
  assert.equal(MIN_HIT, 44);
  // Axis widths at 900, 1280/1496 (760 cap) and a narrow 451 (761 px window).
  for (const width of [451, 577, 760]) {
    const boxes = hitBoxes(spans, width);
    boxes.forEach((box, k) => {
      assert.ok(box.w >= 44 - 1e-9, `${width}: span ${k} ${box.w}`);
      assert.ok(box.x >= -1e-9 && box.x + box.w <= width + 1e-9, `${width}: span ${k} inside the axis`);
      // The bar stays at its months and inside its box.
      assert.ok(Math.abs(box.x + box.barX - spans[k].from * width) < 1e-9 && Math.abs(box.barW - (spans[k].to - spans[k].from) * width) < 1e-9, `${width}: bar ${k} to scale`);
      // A bar starts inside its own box; where a short neighbour took a few px, the bar runs on
      // under that neighbour's (later, so topmost) box rather than stopping short of its months.
      assert.ok(box.barX >= -1e-9 && box.barX < box.w, `${width}: bar ${k} starts in its box`);
    });
    const sorted = [...boxes].sort((a, b) => a.x - b.x);
    sorted.slice(1).forEach((box, k) => assert.ok(box.x >= sorted[k].x + sorted[k].w - 1e-9, `${width}: no overlap`));
  }
  // At 900 (577px axis) ML is ~37px of months: it widens leftwards, Associate gives up the difference.
  const [ml, associate] = hitBoxes(spans, 577);
  assert.equal(ml.x + ml.w, 577);
  assert.equal(ml.w, 44);
  assert.equal(associate.x + associate.w, ml.x);
  // Two tiny neighbours push apart instead of sharing pixels.
  const tiny = hitBoxes([{ from: 0.5, to: 0.52 }, { from: 0.52, to: 0.54 }], 400);
  assert.ok(tiny[1].x >= tiny[0].x + tiny[0].w - 1e-9 && tiny.every(box => box.w >= 44 - 1e-9));
  assert.match(css, /\.xp-tl\[data-xp-layout="axis"\] > \.xp-tl-span \{ left: var\(--xp-hit-x, [^;]+\); width: var\(--xp-hit-w, [^;]+\); min-width: 44px; \}/);
  assert.match(css, /\.xp-tl\[data-xp-layout="axis"\] \.xp-tl-lane \{[^}]*left: var\(--xp-bar-x, 0px\); width: var\(--xp-bar-w, 100%\)/);
});

test('in forced colors the bars keep system colours: CanvasText, the current role in Highlight, the gap dashed', () => {
  const forced = css.slice(css.indexOf('@media (forced-colors: active) {'));
  const block = forced.slice(0, forced.indexOf('\n  }'));
  assert.match(block, /\.xp-tl :is\(\.xp-tl-bar, \.xp-tl-axis\), \.xp-tl-year::before \{ forced-color-adjust: none; background: CanvasText; \}/);
  assert.match(block, /\.xp-tl \.xp-tl-span\[aria-current="true"\] \.xp-tl-bar \{ background: Highlight; \}/);
  assert.match(block, /\.xp-tl \.xp-tl-gap \.xp-tl-bar \{ background: none; outline: 1px dashed CanvasText;/);
});

test('before experience.js measures, the pinned stretch and the stacked timeline already take their room', () => {
  // Travel: 100svh + the distance travelPlan gives whenever the track moves further than the moves
  // need (true at every travel size measured): chapters x DISTANCE_PER_CHAPTER stage heights of
  // moves, which are 1 - HOLD_SHARE of the distance.
  const chapters = all(/<article class="xp-chapter"/g).length;
  const fallback = css.match(/height: calc\(100svh \+ var\(--xp-distance, 100svh \* ([\d.]+) \/ ([\d.]+)\)\)/);
  assert.ok(fallback, 'the travel height has a first-paint fallback');
  assert.equal(Number(fallback[1]), Number((chapters * DISTANCE_PER_CHAPTER).toFixed(4)));
  assert.equal(Number(fallback[2]), Number((1 - HOLD_SHARE).toFixed(4)));
  const vh = 800;
  const moves = chapters * DISTANCE_PER_CHAPTER * vh;
  assert.equal(travelPlan([0, 1600, 2700], 2740, moves).distance, Math.round(vh * Number(fallback[1]) / Number(fallback[2])));
  // Stacked: the rows chart experience.js prepends (24px above, 44px rows 4px apart), one row per
  // span timelinePlan draws from the markup: the three roles and the gap between them.
  const reserve = css.match(/:root\[data-tour\] \.experience:not\(\[data-xp\]\) \.xp-travel::before \{ content: ""; display: block; height: calc\(24px \+ (\d+) \* 44px \+ (\d+) \* 4px\); margin-bottom: clamp\(30px, 4vw, 48px\); \}/);
  assert.ok(reserve, 'the stacked timeline reserve');
  assert.match(css, /\.xp-tl\[data-xp-layout="rows"\] \{ display: grid; gap: 4px; width: min\(100%, 760px\); margin: 0 0 clamp\(30px, 4vw, 48px\); padding-top: 24px; \}/);
  assert.match(css, /\.xp-tl\[data-xp-layout="rows"\] > \.xp-tl-span, \.xp-tl\[data-xp-layout="rows"\] > \.xp-tl-gap \{[^}]*min-height: 44px;/);
  const roles = all(/<p class="xp-when mono">([\s\S]*?)<\/p>/g).map(([, when]) => roleRange([...when.matchAll(/datetime="([^"]+)"/g)].map(match => match[1]), text(when)));
  const plan = timelinePlan(roles, { now: nowMonth(new Date(2026, 10, 12)) });
  assert.ok(plan, 'the timeline plan builds from the markup');
  const rows = plan.spans.filter(Boolean).length + plan.gaps.length;
  assert.equal(Number(reserve[1]), rows, 'one reserved row per span');
  assert.equal(Number(reserve[2]), rows - 1);
  assert.match(css, /@media screen \{\n    :root\[data-tour\] \.experience:not\(\[data-xp\]\) \.xp-travel::before/);
  // The travel layout (later in the file, same specificity) drops it: the timeline sits in the controls band there.
  assert.ok(css.indexOf(':root[data-tour] .experience:not([data-xp="stack"]) .xp-travel::before { content: none; }') > css.indexOf('.xp-travel::before { content: ""'));
  // If experience.js fails, app.js stacks the chapters (the no-script form).
  assert.match(read('web/app.js'), /document\.querySelector\('#experience'\)\?\.setAttribute\('data-xp', 'stack'\)/);
});

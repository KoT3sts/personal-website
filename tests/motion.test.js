import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { ENTRANCE_TRACED, HEADLINES, HEADLINE_TONES, REVEAL_GROUPS, approach, depthTarget, headlineKeyframes, headlineTiming, initMotion, isEntranceTracing, magnetPull, mailtoAddress, planHeadline, sectionAtLine, shouldHold, springStep, staggerDelay } from '../web/motion.js';
import { SECTION_TARGETS } from '../web/entrance.js';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');

// A minimal DOM stand-in: motion.js only needs bounds, dataset and styles.
function fakeElement(top, { traced = false } = {}) {
  const props = new Map();
  return {
    dataset: {},
    style: { setProperty: (key, value) => props.set(key, value), removeProperty: key => props.delete(key), props },
    getBoundingClientRect: () => ({ top }),
    matches: () => traced,
    querySelector: () => null,
    querySelectorAll: () => [],
    removeAttribute(name) {
      if (name === 'data-reveal') delete this.dataset.reveal;
      if (name === 'data-reveal-variant') delete this.dataset.revealVariant;
    },
    closest(selector) { return selector === '[data-reveal="pending"]' && this.dataset.reveal === 'pending' ? this : null; },
  };
}

function setup({ groups, reduced = false, entrance, rootClasses = [] }) {
  const listeners = {};
  const timers = [];
  const observers = [];
  class FakeObserver {
    constructor(callback) { this.callback = callback; this.observed = new Set(); observers.push(this); }
    observe(element) { this.observed.add(element); }
    unobserve(element) { this.observed.delete(element); }
    disconnect() { this.observed.clear(); }
  }
  const document = {
    readyState: 'complete',
    hidden: false,
    documentElement: { classList: { contains: name => rootClasses.includes(name) }, clientHeight: 800 },
    querySelectorAll: selector => groups[selector] || [],
    querySelector: selector => (groups[selector] || [])[0] || null,
    addEventListener: (type, listener) => { listeners[type] = listener; },
    removeEventListener() {},
  };
  const window = {
    innerHeight: 800,
    matchMedia: () => ({ matches: reduced, addEventListener() {}, removeEventListener() {} }),
    IntersectionObserver: FakeObserver,
    requestAnimationFrame: callback => callback(),
    setTimeout: callback => { timers.push(callback); return timers.length; },
    clearTimeout() {},
    addEventListener() {},
    removeEventListener() {},
    CSS: { supports: () => true },
  };
  const controller = initMotion(document, window, { entrance });
  const reveals = observers.find(observer => observer.observed.size) || observers.at(-1);
  return { controller, listeners, timers, reveals };
}

test('only content wholly below the fold may wait for a reveal', () => {
  assert.equal(shouldHold({ top: 900 }, 800), true);
  assert.equal(shouldHold({ top: 700 }, 800), false, 'partly visible content stays visible');
  assert.equal(shouldHold({ top: 760 }, 800), false, 'content near the bottom of the viewport stays visible');
  assert.equal(shouldHold({ top: -400 }, 800), false, 'content already passed stays visible');
});

test('stagger is short and capped', () => {
  assert.deepEqual([0, 1, 2, 3, 4, 9].map(staggerDelay), [0, 85, 170, 255, 340, 340]);
  assert.ok(staggerDelay(99) + 800 <= 1200, 'a whole batch settles quickly');
});

test('entrance tracing is detected from the controller or the running class', () => {
  assert.equal(isEntranceTracing({ sectionsEligible: true, phase: 'ready' }, null), true);
  assert.equal(isEntranceTracing({ sectionsEligible: false, phase: 'hero' }, null), true);
  assert.equal(isEntranceTracing({ sectionsEligible: false, phase: 'ready' }, null), false);
  assert.equal(isEntranceTracing(undefined, { classList: { contains: name => name === 'agentic-running' } }), true);
});

test('reveals hold only below-the-fold content, then stagger it in and clean up', () => {
  const below = fakeElement(1200);
  const belowToo = fakeElement(1300);
  const visible = fakeElement(300);
  const { reveals, timers } = setup({ groups: { '.capability': [visible, below, belowToo] } });
  assert.equal(visible.dataset.reveal, undefined, 'visible content is never hidden');
  assert.equal(below.dataset.reveal, 'pending');
  assert.equal(below.dataset.revealVariant, 'rise');
  reveals.callback([{ target: below, isIntersecting: true }, { target: belowToo, isIntersecting: true }]);
  assert.equal(below.dataset.reveal, 'in');
  assert.equal(below.style.props.get('--reveal-delay'), '0ms');
  assert.equal(belowToo.style.props.get('--reveal-delay'), '85ms');
  timers.forEach(callback => callback());
  assert.equal(below.dataset.reveal, undefined, 'attributes are removed once settled');
  assert.equal(below.style.props.size, 0);
});

test('while the entrance may trace sections, its targets keep a stable position', () => {
  const traced = fakeElement(1200, { traced: true });
  const plain = fakeElement(1200);
  setup({ groups: { '.approach-list details': [traced], '.capability': [plain] }, entrance: { sectionsEligible: true, phase: 'ready' } });
  assert.equal(traced.dataset.reveal, undefined);
  assert.equal(plain.dataset.reveal, 'pending');
  const returning = fakeElement(1200, { traced: true });
  setup({ groups: { '.approach-list details': [returning] }, entrance: { sectionsEligible: false, phase: 'ready' } });
  assert.equal(returning.dataset.reveal, 'pending', 'returning visits reveal traced content too');
});

test('reduced motion holds nothing, and focus reveals held content immediately', () => {
  const below = fakeElement(1200);
  setup({ groups: { '.capability': [below] }, reduced: true });
  assert.equal(below.dataset.reveal, undefined);
  const focused = fakeElement(1200);
  const { listeners } = setup({ groups: { '.contact-links li': [focused] } });
  assert.equal(focused.dataset.reveal, 'pending');
  listeners.focusin({ target: focused });
  assert.equal(focused.dataset.reveal, undefined);
});

test('the traced selectors come from entrance.js, so they cannot drift', () => {
  assert.equal(ENTRANCE_TRACED, SECTION_TARGETS);
  for (const selector of ['.section-top', '.cinematic-art', '.cinematic-copy', '.scene-actions', '.contact-button']) {
    assert.ok(ENTRANCE_TRACED.includes(selector), `ENTRANCE_TRACED is missing ${selector}`);
  }
});

test('while the guided tour runs, motion marks nothing and settles once the tour ends', () => {
  const below = fakeElement(1200);
  const callbacks = [];
  const entrance = { touring: true, phase: 'hero', sectionsEligible: false, whenTourEnds: callback => callbacks.push(callback) };
  setup({ groups: { '.capability': [below] }, entrance });
  assert.equal(below.dataset.reveal, undefined, 'the tour owns section assembly');
  assert.equal(callbacks.length, 1);
  assert.equal(isEntranceTracing(entrance, null), true);
  // The visitor took over: the tour ended and content below the fold may now reveal.
  Object.assign(entrance, { touring: false, phase: 'ready' });
  callbacks[0]();
  assert.equal(below.dataset.reveal, 'pending');
  assert.equal(isEntranceTracing(undefined, { classList: { contains: name => name === 'agentic-touring' } }), true);
});

test('markup ships without hidden reveal states, and CSS only hides what JS marked', async () => {
  const html = await read('../web/index.html');
  const css = await read('../web/motion.css');
  assert.doesNotMatch(html, /data-reveal/);
  assert.match(html, /motion\.css/);
  const hiding = [...css.matchAll(/([^{}]+)\{[^{}]*opacity:\s*0[;\s]/g)].map(rule => rule[1].trim());
  for (const selector of hiding) {
    if (/@keyframes|^(from|to|\d)/.test(selector)) continue;
    // The toast is an empty live region until it has something to say.
    if (selector === '.contact-toast') continue;
    assert.match(selector, /data-reveal="pending"|data-scene="pending"|data-headline="pending"|data-build-state="pending"/, `unexpected hidden state: ${selector}`);
  }
  assert.match(css, /prefers-reduced-motion: reduce\)\s*\{\s*\[data-reveal\][^}]*opacity: 1 !important/);
  assert.match(css, /prefers-reduced-motion: reduce\)\s*\{[^@]*\[data-headline\] \[data-headline-unit\] \{ opacity: 1 !important; transform: none !important; clip-path: none !important/);
  for (const [selector] of REVEAL_GROUPS) assert.ok(selector.length > 0);
});

// Regression: header tone used to come from a reading band 12–30% down the
// viewport, below the header itself. At the bottom of the page the dark footer
// reached that band while the light closing note was still behind the header.
test('header tone samples the section that contains the header line, including at the page bottom', () => {
  const headerLine = 50;
  // Bottom of a 1280x800 page: closing note behind the header, footer starts at 125px.
  const bottom = [{ top: -2000, bottom: -400 }, { top: -400, bottom: 125 }, { top: 125, bottom: 800 }];
  assert.equal(sectionAtLine(bottom, headerLine), 1, 'the light closing note, not the footer below it');
  // Once the footer slides under the header line it takes over.
  assert.equal(sectionAtLine([{ top: -900, bottom: 40 }, { top: 40, bottom: 715 }], headerLine), 1);
  assert.equal(sectionAtLine([{ top: -900, bottom: 50 }, { top: 50, bottom: 715 }], headerLine), 1, 'at a shared edge the lower section wins');
  assert.equal(sectionAtLine([{ top: 100, bottom: 400 }], headerLine), -1, 'nothing behind the header');
  assert.equal(sectionAtLine([], headerLine), -1);
});

// ---- Headlines -------------------------------------------------------------

const text = value => ({ nodeType: 3, nodeName: '#text', textContent: value });
const el = (name, value = '') => ({ nodeType: 1, nodeName: name, textContent: value });

test('headlines split on their authored <br> lines, or into words when they have one line', () => {
  // WHAT I<br><span>CAN DO.</span>
  assert.deepEqual(planHeadline([text('WHAT I'), el('BR'), el('SPAN', 'CAN DO.')]), { mode: 'lines', lines: [[0], [2]], breaks: [1] });
  // LESS TALK.<br>MORE <span>MAKING.</span>: mixed content stays on its line.
  assert.deepEqual(planHeadline([text('LESS TALK.'), el('BR'), text('MORE '), el('SPAN', 'MAKING.')]).lines, [[0], [2, 3]]);
  // LET'S <span>CONNECT.</span> (nowrap): the trailing space stays outside the word.
  const words = planHeadline([text("LET'S "), el('SPAN', 'CONNECT.')]);
  assert.equal(words.mode, 'words');
  assert.deepEqual(words.units, [{ index: 0, kind: 'text', lead: '', core: "LET'S", trail: ' ' }, { index: 1, kind: 'element' }]);
  // Round 7: the authored space before a <br> (so screen readers do not join the words)
  // stays with its line; the split is unchanged.
  assert.deepEqual(planHeadline([text('WHAT I '), el('BR'), el('SPAN', 'CAN DO.')]), { mode: 'lines', lines: [[0], [2]], breaks: [1] });
  assert.deepEqual(planHeadline([text('ABOUT '), el('BR'), text('ME')]).lines, [[0], [2]]);
  // Nothing to stagger: a single word, or empty lines only.
  assert.equal(planHeadline([text('CONNECT.')]), null);
  assert.equal(planHeadline([text('ONE'), el('BR'), text('  ')]), null);
});

test('every giant headline is covered, and the tour-built ones are excluded by id', () => {
  for (const id of ['#about-title', '#capabilities-title', '#experience-title', '#work-title', '#approach-title', '#contact-title']) assert.ok(HEADLINES.includes(id), id);
  assert.ok(!REVEAL_GROUPS.some(([selector]) => /h2|#contact-title/.test(selector)), 'headlines are not also faded whole');
});

test('a line masks itself: its clip edge stays on the line box while it rises', () => {
  for (const tone of ['light', 'dark']) {
    const frames = headlineKeyframes(tone);
    const first = frames[0];
    const last = frames[frames.length - 1];
    const travel = HEADLINE_TONES[tone].travel;
    assert.equal(first.transform, `translate3d(0, ${travel}%, 0)`);
    assert.match(first.clipPath, new RegExp(`calc\\(${travel}% - \\.18em\\)`), 'bottom inset tracks the travel');
    assert.equal(last.transform, 'translate3d(0, 0%, 0)');
    assert.match(last.clipPath, /calc\(0% - \.18em\)/);
  }
  assert.ok(HEADLINE_TONES.light.travel >= 125, 'light lines start wholly below their edge');
  const dark = headlineKeyframes('dark');
  assert.equal(dark[0].opacity, 0);
  assert.equal(dark.at(-1).filter, 'brightness(1)');
  assert.equal(headlineKeyframes('light')[0].opacity, undefined, 'light scenes rise crisp, without a fade');
});

test('headline timing staggers a few lines and settles within ~1.6s', () => {
  assert.deepEqual([0, 1, 2].map(index => headlineTiming('light', index).delay), [0, 95, 190]);
  const late = headlineTiming('dark', 9);
  assert.ok(late.delay + late.duration <= 1600);
  assert.equal(late.fill, 'backwards');
  assert.match(late.easing, /cubic-bezier\(\.19, 1, \.22, 1\)/);
});

// ---- Pointer helpers -------------------------------------------------------

test('approach eases exponentially and never overshoots', () => {
  assert.equal(approach(0, 10, 0, 100), 0);
  const step = approach(0, 10, 100, 100);
  assert.ok(Math.abs(step - 10 * (1 - Math.exp(-1))) < 1e-9);
  assert.equal(approach(3, 10, 16, 0), 10);
  let value = 0;
  for (let i = 0; i < 200; i += 1) { value = approach(value, 1, 16, 240); assert.ok(value <= 1); }
  assert.ok(value > 0.999);
});

test('the spring returns springily: it overshoots a little, then settles', () => {
  let [x, v] = [8, 0];
  let min = Infinity;
  for (let i = 0; i < 120; i += 1) { [x, v] = springStep(x, v, 0, 16); min = Math.min(min, x); }
  assert.ok(min < 0 && min > -2.5, `small overshoot (${min.toFixed(2)})`);
  assert.ok(Math.abs(x) < 0.05 && Math.abs(v) < 0.5, 'settled within two seconds');
  // Long frames are sub-stepped rather than exploding.
  const [far] = springStep(8, 0, 0, 1000);
  assert.ok(Math.abs(far) < 8);
});

test('the magnet pulls toward the pointer, capped, and lets go beyond its reach', () => {
  const over = magnetPull(30, 10, 150, 26);
  assert.ok(over.x > 0 && over.y > 0);
  const far = magnetPull(400, 0, 150, 26);
  assert.deepEqual(far, { x: 0, y: 0 });
  const edge = magnetPull(215, 0, 150, 26);
  assert.ok(Math.hypot(edge.x, edge.y) <= 9 + 1e-9, 'never more than 9px');
  const strong = magnetPull(0, 60, 20, 20, { max: 9, ratio: 1 });
  assert.ok(Math.abs(Math.hypot(strong.x, strong.y) - 9) < 1e-9);
});

test('hero depth leans with the pointer and is nearest over the sculpture', () => {
  assert.deepEqual(depthTarget(0.5, 0.625), { x: 0, y: 0.25, near: 1 });
  const corner = depthTarget(0, 0);
  assert.equal(corner.x, -1);
  assert.equal(corner.y, -1);
  assert.equal(corner.near, 0);
  assert.equal(depthTarget(2, -1).x, 1, 'clamped');
});

test('the copy button reads the address from the mailto link', () => {
  assert.equal(mailtoAddress('mailto:someone@example.com'), 'someone@example.com');
  assert.equal(mailtoAddress('mailto:a%2Bb@example.com?subject=Hi'), 'a+b@example.com');
  assert.equal(mailtoAddress('https://example.com'), '');
  assert.equal(mailtoAddress(null), '');
});

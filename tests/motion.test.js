import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { ENTRANCE_TRACED, REVEAL_GROUPS, initMotion, isEntranceTracing, shouldHold, staggerDelay } from '../web/motion.js';
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
  setup({ groups: { '.capabilities-heading > h2': [traced], '.capability': [plain] }, entrance: { sectionsEligible: true, phase: 'ready' } });
  assert.equal(traced.dataset.reveal, undefined);
  assert.equal(plain.dataset.reveal, 'pending');
  const returning = fakeElement(1200, { traced: true });
  setup({ groups: { '.capabilities-heading > h2': [returning] }, entrance: { sectionsEligible: false, phase: 'ready' } });
  assert.equal(returning.dataset.reveal, 'pending', 'returning visits reveal headings too');
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
    assert.match(selector, /data-reveal="pending"|data-scene="pending"/, `unexpected hidden state: ${selector}`);
  }
  assert.match(css, /prefers-reduced-motion: reduce\)\s*\{\s*\[data-reveal\][^}]*opacity: 1 !important/);
  for (const [selector] of REVEAL_GROUPS) assert.ok(selector.length > 0);
});

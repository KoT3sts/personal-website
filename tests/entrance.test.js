import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import { initAgenticEntrance, shouldPlayEntrance, crewSize, crewTier } from '../web/entrance.js';

const html = await readFile(new URL('../web/index.html', import.meta.url), 'utf8');
const entranceCSS = await readFile(new URL('../web/entrance.css', import.meta.url), 'utf8');
const storageKey = 'cesar:portfolio:agentic-intro:v1';

// A manual animation-frame queue: lets tests count pending loops and step time.
function manualFrames(window) {
  const pending = new Map();
  let nextId = 1;
  let time = 0;
  window.requestAnimationFrame = callback => { const id = nextId++; pending.set(id, callback); return id; };
  window.cancelAnimationFrame = id => { pending.delete(id); };
  return {
    pending,
    now: () => time,
    step(ms) {
      time += ms;
      const due = [...pending.values()];
      pending.clear();
      due.forEach(callback => callback(time));
    },
    run(until, step = 16) { while (time < until && pending.size) this.step(step); },
  };
}

function setup(t, { seen = false, reduced = false, hash = '', storageBlocked = false, observeSections = false, width, frames = false, media } = {}) {
  const { window } = new JSDOM(html, { url: `https://portfolio.test/${hash}` });
  window.matchMedia = media || (() => ({ matches: reduced }));
  if (width) Object.defineProperty(window, 'innerWidth', { value: width, configurable: true });
  const style = window.document.createElement('style');
  style.textContent = entranceCSS;
  window.document.head.append(style);
  let observerCallback;
  if (observeSections) window.IntersectionObserver = class {
    constructor(callback) { observerCallback = callback; }
    observe() {}
    disconnect() {}
  };
  if (seen) window.localStorage.setItem(storageKey, 'seen');
  if (storageBlocked) Object.defineProperty(window, 'localStorage', { get() { throw new Error('Storage denied'); } });
  const clock = frames ? manualFrames(window) : null;
  const config = { heroDuration: 60, sectionDuration: 30 };
  if (clock) Object.assign(config, { heroDuration: 4600, sectionDuration: 1000, now: clock.now });
  const controller = initAgenticEntrance(window.document, window, config);
  t.after(() => window.close());
  // Like a real observer entry: an intersecting section is on screen (layout
  // engines then trace only what is in view; jsdom has no layout to filter).
  const intersect = (target, isIntersecting) => {
    if (isIntersecting) target.scrollIntoView?.({ block: 'start', behavior: 'instant' });
    observerCallback([{ target, isIntersecting }]);
  };
  return { window, document: window.document, controller, clock, intersect };
}

function assertNoResidue(document) {
  assert.equal(document.querySelector('.agentic-stage'), null);
  assert.equal(document.querySelectorAll('.agentic-cursor, .agentic-frame, .agentic-caret, .agentic-dispatch, .agentic-status').length, 0);
  assert.equal(document.querySelector('[data-build-state], [data-agentic-job], .agentic-target'), null);
  assert.equal(document.querySelector('[style*="clip-path"]'), null);
  assert.equal(document.documentElement.classList.contains('agentic-running'), false);
}

test('automatic entrance is first-home-visit only and respects accessibility, history, and storage', () => {
  const home = { seen: false, reducedMotion: false, storageAvailable: true, hash: '', navigationType: 'navigate' };
  assert.equal(shouldPlayEntrance(home), true);
  for (const changed of [{ seen: true }, { reducedMotion: true }, { storageAvailable: false }, { hash: '#work' }, { navigationType: 'back_forward' }]) {
    assert.equal(shouldPlayEntrance({ ...home, ...changed }), false);
  }
  assert.equal(shouldPlayEntrance({ ...home, hash: '#home' }), true);
});

test('first visit completes, persists the visit, and removes all temporary target states', async t => {
  const { document, window, controller } = setup(t);
  assert.equal(controller.phase, 'hero');
  assert.ok(document.querySelector('[data-agentic-skip]'));
  assert.ok(document.querySelector('[data-build-state="pending"]'));
  await new Promise(resolve => window.setTimeout(resolve, 100));
  assert.equal(controller.phase, 'ready');
  assert.equal(window.localStorage.getItem(storageKey), 'seen');
  assertNoResidue(document);
  assert.ok(document.querySelector('[data-agentic-replay]'));
});

test('skip and Escape immediately settle all content and disable later automatic sections', t => {
  for (const action of ['skip', 'escape']) {
    const { document, window, controller } = setup(t);
    if (action === 'skip') document.querySelector('[data-agentic-skip]').click();
    else document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    assert.equal(controller.phase, 'ready');
    assert.equal(controller.sectionsEligible, false);
    assertNoResidue(document);
    assert.equal(window.localStorage.getItem(storageKey), 'seen');
  }
});

test('deliberate navigation and Tab cancel assembly without cancelling the visitor action', t => {
  const { document, window, controller } = setup(t);
  const event = new window.MouseEvent('click', { bubbles: true, cancelable: true });
  document.querySelector('a[href="#work"]').dispatchEvent(event);
  assert.equal(event.defaultPrevented, false);
  assert.equal(controller.sectionsEligible, false);
  assert.equal(document.querySelector('[data-build-state]'), null);
  controller.replay();
  const tab = new window.KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
  document.dispatchEvent(tab);
  assert.equal(tab.defaultPrevented, false);
  assert.equal(controller.phase, 'ready');
});

test('returning visits, deep links, reduced motion, and blocked storage leave content visible', t => {
  for (const options of [{ seen: true }, { hash: '#work' }, { reduced: true }, { storageBlocked: true }]) {
    const { document, controller } = setup(t, options);
    assert.equal(controller.phase, 'ready');
    assert.equal(document.querySelector('.agentic-stage'), null);
    assert.equal(document.querySelector('[data-build-state]'), null);
    assert.equal(document.querySelectorAll('.agentic-cursor').length, 0);
  }
});

test('explicit replay is hero-only and does not erase the stored returning-visit preference', t => {
  const { controller, document, window } = setup(t, { seen: true });
  document.querySelector('[data-agentic-replay]').click();
  assert.equal(controller.phase, 'hero');
  assert.equal(controller.sectionsEligible, false);
  assert.equal(window.localStorage.getItem(storageKey), 'seen');
  controller.skip();
  assert.equal(document.querySelector('.agentic-stage'), null);
});

test('returning from the history cache keeps replay usable without restarting automatic assembly', t => {
  const { window, document, controller } = setup(t);
  window.dispatchEvent(new window.PageTransitionEvent('pagehide', { persisted: true }));
  assert.equal(controller.phase, 'ready');
  assert.equal(controller.sectionsEligible, false);
  document.querySelector('[data-agentic-replay]').click();
  assert.equal(controller.phase, 'hero');
  controller.skip();
});

test('section passes preserve already visible content and stop after an explicit skip', async t => {
  const { window, document, controller, intersect } = setup(t, { observeSections: true });
  await new Promise(resolve => window.setTimeout(resolve, 100));
  const section = document.querySelector('#about');
  const title = section.querySelector('h2');
  const originalText = section.textContent;
  intersect(section, true);
  assert.equal(controller.phase, 'section');
  assert.notEqual(window.getComputedStyle(title).opacity, '0');
  assert.equal(section.textContent, originalText);
  assert.equal(section.querySelector('[data-build-state="pending"]'), null);
  intersect(section, false);
  assert.equal(document.querySelector('[data-build-state]'), null);
  intersect(document.querySelector('#work'), true);
  assert.equal(controller.phase, 'section');
  controller.skip();
  intersect(document.querySelector('#approach'), true);
  assert.equal(controller.phase, 'ready');
  assert.equal(document.querySelector('.agentic-stage'), null);
});

test('skip and replay controls reserve at least 44px of hit-area height', t => {
  const { window, document, controller } = setup(t);
  const skip = document.querySelector('[data-agentic-skip]');
  assert.ok(parseFloat(window.getComputedStyle(skip).minHeight) >= 44);
  controller.skip();
  const replay = document.querySelector('[data-agentic-replay]');
  assert.ok(parseFloat(window.getComputedStyle(replay).minHeight) >= 44);
});

test('cinematic section traces the artwork and copy without hiding them, then settles on scroll-away', async t => {
  const { document, window, controller, intersect } = setup(t, { observeSections: true });
  await new Promise(resolve => window.setTimeout(resolve, 100));
  const section = document.querySelector('#introduction');
  intersect(section, true);
  assert.equal(controller.phase, 'section');
  const art = section.querySelector('.cinematic-art');
  const copy = section.querySelector('.cinematic-copy');
  assert.equal(art.dataset.buildState, 'tracing');
  assert.equal(copy.dataset.buildState, 'tracing');
  assert.notEqual(window.getComputedStyle(copy).opacity, '0');
  assert.equal(section.querySelector('[data-build-state="pending"]'), null);
  intersect(section, false);
  assert.equal(controller.phase, 'ready');
  assert.equal(section.querySelector('[data-build-state]'), null);
  assert.equal(document.querySelector('.agentic-stage'), null);
});

test('crew size scales with the viewport: one orchestrator plus 18, 9 or 5 subagents', t => {
  assert.deepEqual([1440, 1280, 1100, 1024, 768, 640, 390, 375, 360].map(crewTier),
    ['desktop', 'desktop', 'desktop', 'tablet', 'tablet', 'tablet', 'phone', 'phone', 'phone']);
  for (const [width, subagents] of [[1280, 18], [768, 9], [375, 5]]) {
    assert.equal(crewSize(width), subagents);
    const { document, controller } = setup(t, { width });
    const cursors = document.querySelectorAll('.agentic-cursor');
    assert.equal(cursors.length, subagents + 1);
    assert.equal(document.querySelectorAll('.agentic-cursor.is-orchestrator').length, 1);
    assert.equal(document.querySelectorAll('.agentic-dot').length, subagents + 1);
    assert.equal(controller.stats.agents, subagents);
    assert.equal(controller.stats.cursors, subagents + 1);
    assert.match(document.querySelector('.agentic-log-agents').textContent, new RegExp(`^${subagents} subagents$`));
    // Every cursor carries one role badge and colour; roles repeat only as numbered instances.
    const labels = [...document.querySelectorAll('.agentic-role')].map(label => label.textContent);
    assert.equal(new Set(labels).size, labels.length);
    controller.skip();
    assertNoResidue(document);
  }
});

test('status counts are the real number of animated targets and reach the total before release', t => {
  for (const width of [1280, 375]) {
    const { document, controller, clock } = setup(t, { width, frames: true });
    const total = controller.stats.targets;
    assert.ok(total > 0);
    assert.equal(document.querySelectorAll('[data-agentic-job]').length, total);
    assert.equal(document.querySelector('.agentic-log-total').textContent, String(total));
    assert.equal(document.querySelector('.agentic-log-done').textContent, '0');
    let sawDone = false;
    while (clock.pending.size) {
      clock.step(16);
      const done = document.querySelector('.agentic-log-done');
      if (!done) break;
      assert.ok(Number(done.textContent) <= total);
      if (done.textContent === String(total)) sawDone = true;
    }
    assert.ok(sawDone, `status reached ${total}/${total} at ${width}px`);
    assert.equal(controller.phase, 'ready');
    assert.equal(controller.stats.done, total);
    assert.ok(clock.now() <= 4600 + 32, 'hero stays within its 4.6s budget');
    assertNoResidue(document);
  }
});

test('one controller drives one animation-frame loop, including across replay and skip', t => {
  const { document, controller, clock } = setup(t, { width: 1280, frames: true });
  assert.equal(clock.pending.size, 1);
  for (let i = 0; i < 40; i++) { clock.step(16); assert.ok(clock.pending.size <= 1); }
  controller.replay();
  controller.replay();
  assert.equal(document.querySelectorAll('.agentic-stage').length, 1);
  assert.equal(document.querySelectorAll('.agentic-cursor').length, 19);
  assert.equal(clock.pending.size, 1);
  controller.skip();
  assert.equal(clock.pending.size, 0);
  assertNoResidue(document);
});

test('a hidden tab pauses the timeline and resumes where it left off', t => {
  const { document, window, controller, clock } = setup(t, { width: 1280, frames: true });
  let hidden = false;
  Object.defineProperty(document, 'hidden', { get: () => hidden, configurable: true });
  clock.run(800);
  hidden = true;
  document.dispatchEvent(new window.Event('visibilitychange'));
  assert.equal(controller.paused, true);
  assert.equal(clock.pending.size, 0);
  clock.step(60000);
  assert.equal(controller.phase, 'hero');
  assert.ok(document.querySelector('.agentic-stage'));
  hidden = false;
  document.dispatchEvent(new window.Event('visibilitychange'));
  assert.equal(controller.paused, false);
  assert.equal(clock.pending.size, 1);
  clock.run(clock.now() + 6000);
  assert.equal(controller.phase, 'ready');
  assertNoResidue(document);
});

test('switching to reduced motion while running settles everything and disables replay', t => {
  let listener;
  const query = { matches: false, addEventListener: (_, callback) => { listener = callback; }, removeEventListener() {} };
  const { document, controller } = setup(t, { media: () => query });
  assert.equal(controller.phase, 'hero');
  query.matches = true;
  listener();
  assert.equal(controller.phase, 'ready');
  assertNoResidue(document);
  assert.equal(document.querySelector('[data-agentic-replay]').disabled, true);
});

test('replay is placed inside the footer row without displacing its final item', t => {
  const { document } = setup(t, { seen: true });
  const row = document.querySelector('.footer-bottom');
  const replay = row.querySelector('[data-agentic-replay]');
  assert.ok(replay);
  assert.notEqual(row.lastElementChild, replay);
  assert.equal(row.lastElementChild.textContent, 'MADE TO BE EXPLORED.');
});

test('decorative layers stay out of the accessibility tree and never take pointer input', t => {
  const { document, window } = setup(t);
  const decoration = document.querySelector('.agentic-decoration');
  assert.equal(decoration.getAttribute('aria-hidden'), 'true');
  assert.equal(window.getComputedStyle(document.querySelector('.agentic-stage')).pointerEvents, 'none');
  assert.ok(decoration.contains(document.querySelector('.agentic-cursor')));
  assert.ok(decoration.contains(document.querySelector('.agentic-status')));
  assert.equal(document.querySelector('[data-agentic-skip]').closest('[aria-hidden]'), null);
  // The real headline stays in the DOM once; nothing duplicates it.
  assert.equal(document.querySelectorAll('h1').length, 1);
  assert.equal(document.querySelector('.agentic-stage').querySelectorAll('h1, h2, p').length, 0);
});

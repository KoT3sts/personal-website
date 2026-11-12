import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import { initAgenticEntrance, shouldPlayEntrance, crewSize, crewTier, typoFor, TOUR_STOPS, SCROLL, RESCUE, HOLE_CAP, GATE_CAP_MS } from '../web/entrance.js';
import { initExperience } from '../web/experience.js';
import { initExplorer } from '../web/explorer.js';

const html = await readFile(new URL('../web/index.html', import.meta.url), 'utf8');
const entranceCSS = await readFile(new URL('../web/entrance.css', import.meta.url), 'utf8');
// The recorded run the tour replays (passed in, so no test needs the network).
const traceData = JSON.parse(await readFile(new URL('../web/trace/build-trace.json', import.meta.url), 'utf8'));
const REAL_ROLES = ['orchestrator', 'implementation-worker', 'quality-reviewer', 'ui-design-director'];
const storageKey = 'cesar:portfolio:agentic-intro:v1';
const speedKey = 'cesar:portfolio:agentic-tour-speed:v1';
const fast = { heroDuration: 60, buildDuration: 30, sectionDuration: 30, scrollDuration: 20, handoffDuration: 20 };

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

function setup(t, { seen = false, reduced = false, hash = '', storageBlocked = false, observeSections = false, width, height, frames = false, media, navigationType, layout = false, fetch, config: extra = {} } = {}) {
  const { window } = new JSDOM(html, { url: `https://portfolio.test/${hash}` });
  // `fetch`: a stand-in for window.fetch (the trace request). Without one the
  // tests run with no trace (choreography labels) unless `config.trace` is given.
  if (fetch) window.fetch = fetch;
  // In a real layout engine (the browser harness), lay the page out at `width`.
  if (layout && width && window.frameElement) window.frameElement.style.width = `${width}px`;
  if (layout && height && window.frameElement) window.frameElement.style.height = `${height}px`;
  window.matchMedia = media || (() => ({ matches: reduced }));
  if (width) Object.defineProperty(window, 'innerWidth', { value: width, configurable: true });
  if (navigationType) window.performance.getEntriesByType = () => [{ type: navigationType }];
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
  // Tours start at 1x unless a test opts in; the speed setting is shared storage.
  if (!storageBlocked) window.localStorage.removeItem(speedKey);
  t.after(() => { try { window.localStorage.removeItem(speedKey); } catch { /* closed */ } });
  if (storageBlocked) Object.defineProperty(window, 'localStorage', { get() { throw new Error('Storage denied'); } });
  const clock = frames ? manualFrames(window) : null;
  // Manual frames use the real production timing; real frames use tiny durations.
  const config = { ...(fetch ? {} : { trace: false }), ...(clock ? { now: clock.now, pillDuration: 600000 } : { ...fast }), ...extra };
  const controller = initAgenticEntrance(window.document, window, config);
  t.after(() => window.close());
  // Like a real observer entry: an intersecting section is on screen.
  const intersect = (target, isIntersecting) => {
    if (isIntersecting) target.scrollIntoView?.({ block: 'start', behavior: 'instant' });
    observerCallback([{ target, isIntersecting }]);
  };
  return { window, document: window.document, controller, clock, intersect };
}

const until = async (condition, ms = 4000) => {
  const start = Date.now();
  while (!condition() && Date.now() - start < ms) await new Promise(resolve => setTimeout(resolve, 10));
  return condition();
};
const dockOf = document => document.querySelector('.agentic-dock');
const visibleCursors = document => [...document.querySelectorAll('.agentic-cursor.is-in:not(.is-docked)')];
const cursorPoint = cursor => { const m = /translate3d\(([-\d.]+)px,\s*([-\d.]+)px/.exec(cursor.style.transform || ''); return m ? { x: +m[1], y: +m[2] } : null; };
const traceRows = document => [...dockOf(document).querySelectorAll('.agentic-trace-list > li')];
const currentActions = document => traceRows(document).filter(row => row.classList.contains('is-current')).map(row => row.querySelector('.agentic-span-action').textContent);
// Experience's `sub` stops (wide screens, travelling stage) keep its name: one entry.
const stopNames = document => TOUR_STOPS.filter(stop => document.querySelector(stop.sel)).map(stop => stop.name).filter((name, index, all) => name !== all[index - 1]);
const measurable = document => document.querySelector('#about').getBoundingClientRect().height > 0;

// Steps the tour frame by frame until it reaches `index` (and optionally `extra` ms more).
function stepTo(controller, clock, index, extra = 0, step = 16) {
  const limit = clock.now() + 90000;
  while (controller.touring && controller.tour.index < index && clock.now() < limit) clock.step(step);
  const end = clock.now() + extra;
  while (controller.touring && clock.now() < end) clock.step(step);
}

function assertNoResidue(document, { dock = 'pill' } = {}) {
  assert.equal(document.querySelector('.agentic-stage'), null);
  assert.equal(document.querySelectorAll('.agentic-cursor, .agentic-frame, .agentic-caret, .agentic-dispatch').length, 0);
  assert.equal(document.querySelectorAll('.agentic-tag, .agentic-pin, .agentic-hole, .agentic-typo, .agentic-skeleton').length, 0, 'no key tags, pins, placeholders, typos or skeletons');
  assert.equal(document.querySelector('[data-build-state], [data-agentic-job], .agentic-target'), null);
  assert.equal(document.querySelector('[style*="clip-path"]'), null);
  assert.equal(document.documentElement.classList.contains('agentic-running'), false);
  assert.equal(document.documentElement.classList.contains('agentic-touring'), false);
  const element = dockOf(document);
  if (dock === 'none') assert.equal(element, null, 'no dock');
  else if (element) assert.equal(element.dataset.state, 'pill', 'only the collapsed pill may remain');
}

test('automatic entrance is first-home-visit only and respects accessibility, history, and storage', () => {
  const home = { seen: false, reducedMotion: false, storageAvailable: true, hash: '', navigationType: 'navigate' };
  assert.equal(shouldPlayEntrance(home), true);
  for (const changed of [{ seen: true }, { reducedMotion: true }, { storageAvailable: false }, { hash: '#work' }, { navigationType: 'back_forward' }]) {
    assert.equal(shouldPlayEntrance({ ...home, ...changed }), false);
  }
  assert.equal(shouldPlayEntrance({ ...home, hash: '#home' }), true);
});

test('the first visit tours every section in order, then hands off and collapses the dock', t => {
  const { document, window, controller, clock } = setup(t, { width: 1280, frames: true });
  assert.equal(controller.touring, true);
  assert.equal(controller.phase, 'hero');
  assert.deepEqual(controller.tour && [controller.tour.index, controller.tour.name], [0, 'Hero']);
  const seenNames = ['Hero'];
  let heroEnded = 0;
  while (controller.touring && clock.now() < 90000) {
    clock.step(16);
    const name = controller.tour?.name;
    if (name && seenNames.at(-1) !== name) { seenNames.push(name); if (!heroEnded) heroEnded = clock.now(); }
  }
  assert.deepEqual(seenNames, stopNames(document));
  assert.equal(controller.phase, 'ready');
  assert.equal(controller.sectionsEligible, false, 'every section was built; nothing left to trace');
  assert.equal(window.localStorage.getItem(storageKey), 'seen');
  assertNoResidue(document);
  const dock = dockOf(document);
  assert.equal(dock.dataset.state, 'pill');
  // The pill reports the distinct agents that worked and the measured time.
  const summary = dock.querySelector('.agentic-dock-summary').textContent;
  const [, agents, seconds] = /^Built by (\d+) agents in (\d+) s$/.exec(summary) || [];
  assert.ok(agents && +agents >= 10 && +agents <= crewSize(1280), summary);
  assert.equal(+seconds, Math.round(clock.now() / 1000), 'measured tour time');
  assert.ok(dock.querySelector('[data-agentic-dock-replay]'));
  assert.equal(document.querySelector('[data-agentic-replay]').hidden, false);
  // The intro is short (the build follows the paint wipe): ~5.5 s.
  assert.ok(heroEnded >= 5000 && heroEnded <= 7500, `hero took ${heroEnded}ms`);
  // Nine sections since the one-gallery change (Nov 10: the explorer is built on
  // the Projects stop, no Index stop). Real runs measure ~55 s at 1280 (the
  // travelling Experience stage adds two holds); without layout (jsdom) the
  // stops run on their budgets alone, ~28 s.
  assert.ok(clock.now() >= 24000 && clock.now() <= 60000, `tour took ${clock.now()}ms`);
  if (measurable(document) && document.documentElement.scrollHeight > window.innerHeight + 10) {
    assert.ok(window.scrollY > 0, 'the tour ends at the contact section, not back at the top');
  }
  // Nothing restarts on its own.
  clock.step(5000);
  assert.equal(controller.touring, false);
});

test('the dock count is the number of agents at work and changes between sections', t => {
  const { document, controller, clock } = setup(t, { width: 1280, frames: true });
  const maxByStop = new Map();
  while (controller.touring && clock.now() < 90000) {
    clock.step(16);
    if (!controller.touring) break;
    const working = controller.stats.working;
    assert.equal(dockOf(document).querySelector('.agentic-dock-count').textContent, String(working));
    assert.equal(dockOf(document).querySelectorAll('.agentic-dot').length, controller.stats.cursors, 'one dot per agent in the current crew');
    assert.ok(working <= controller.stats.agents);
    const name = controller.tour.name;
    maxByStop.set(name, Math.max(maxByStop.get(name) || 0, working));
  }
  const hero = maxByStop.get('Hero');
  const lower = [...maxByStop].filter(([name]) => name !== 'Hero').map(([, max]) => max);
  assert.ok(hero >= 10, `hero crew peaked at ${hero}`);
  assert.ok(lower.every(max => max >= 1), `lower crews ${lower}`);
  assert.ok(lower.some(max => max >= 10), `some sections are busy: ${[...maxByStop]}`);
  assert.ok(new Set(lower).size >= 2, `crew sizes differ between sections: ${[...maxByStop]}`);
  assert.ok(lower.every(max => max <= 16), `lower crews stay in their band: ${[...maxByStop]}`);
  // Phones keep a small crew.
  const phone = setup(t, { width: 375, frames: true });
  let phoneMax = 0;
  while (phone.controller.touring && phone.clock.now() < 90000) { phone.clock.step(32); phoneMax = Math.max(phoneMax, phone.controller.stats.working); }
  assert.ok(phoneMax >= 1 && phoneMax <= crewSize(375), `phone peak ${phoneMax}`);
});

test('each kind of visitor input cancels the tour where the visitor is and reveals everything', t => {
  const inputs = {
    wheel: window => new window.WheelEvent('wheel', { bubbles: true, deltaY: 120 }),
    touchstart: window => new window.Event('touchstart', { bubbles: true }),
    touchmove: window => new window.Event('touchmove', { bubbles: true }),
    pointerdown: window => new window.Event('pointerdown', { bubbles: true }),
    keydown: window => new window.KeyboardEvent('keydown', { key: 'PageDown', bubbles: true, cancelable: true }),
    scrollbar: null,
  };
  for (const [name, make] of Object.entries(inputs)) {
    const { document, window, controller, clock } = setup(t, { width: 1280, frames: true });
    let tourEnded = false;
    controller.whenTourEnds(() => { tourEnded = true; });
    stepTo(controller, clock, 2, 300);
    assert.equal(controller.touring, true, `${name}: still touring before input`);
    const before = window.scrollY;
    if (make) {
      const event = make(window);
      (name === 'keydown' ? document : document.querySelector('#main')).dispatchEvent(event);
      assert.equal(event.defaultPrevented, false, `${name}: the visitor's own action is never blocked`);
    } else {
      // A scroll the tour did not cause (scrollbar drag, find-in-page, ...).
      Object.defineProperty(window, 'scrollY', { value: before + 240, configurable: true });
      window.dispatchEvent(new window.Event('scroll'));
    }
    assert.equal(controller.touring, false, `${name} cancels the tour`);
    assert.equal(controller.phase, 'ready');
    assert.equal(tourEnded, true, `${name}: motion.js is told the tour ended`);
    assertNoResidue(document);
    assert.equal(window.localStorage.getItem(storageKey), 'seen');
    assert.equal(controller.sectionsEligible, true, `${name}: unvisited sections may still be traced`);
    if (make) assert.equal(window.scrollY, before, `${name}: no snapping back or forward`);
    const after = window.scrollY;
    clock.step(2000);
    assert.equal(window.scrollY, after, `${name}: nothing scrolls afterwards`);
    assert.equal(controller.touring, false);
  }
});

test('Skip tour, Escape, Tab and deliberate navigation end the tour in place and disable later passes', t => {
  for (const action of ['skip', 'escape', 'tab', 'navigate']) {
    const { document, window, controller, clock } = setup(t, { width: 1280, frames: true });
    stepTo(controller, clock, 1, 400);
    const before = window.scrollY;
    if (action === 'skip') document.querySelector('[data-agentic-skip]').click();
    else if (action === 'escape') document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    else if (action === 'tab') {
      const tab = new window.KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
      document.dispatchEvent(tab);
      assert.equal(tab.defaultPrevented, false);
    } else {
      const click = new window.MouseEvent('click', { bubbles: true, cancelable: true });
      document.querySelector('a[href="#work"]').dispatchEvent(click);
      assert.equal(click.defaultPrevented, false);
    }
    assert.equal(controller.touring, false, action);
    assert.equal(controller.phase, 'ready');
    assert.equal(controller.sectionsEligible, false, `${action}: no automatic passes afterwards`);
    assert.equal(window.scrollY, before, `${action}: the visitor stays where they are`);
    assertNoResidue(document);
    assert.equal(window.localStorage.getItem(storageKey), 'seen');
  }
});

test('Skip tour is a real control in a labelled region from the first frame, with 44px hit areas', t => {
  const { window, document, controller } = setup(t);
  const dock = dockOf(document);
  assert.equal(dock.getAttribute('role'), 'region');
  assert.equal(dock.getAttribute('aria-label'), 'Page build tour');
  const skip = dock.querySelector('[data-agentic-skip]');
  assert.equal(skip.tagName, 'BUTTON');
  assert.equal(skip.textContent, 'Skip tour');
  assert.equal(skip.closest('[aria-hidden]'), null);
  assert.ok(parseFloat(window.getComputedStyle(skip).minHeight) >= 44);
  assert.equal(dock.querySelector('.agentic-dock-face').getAttribute('aria-hidden'), 'true');
  assert.equal(dock.querySelector('.agentic-dock-live').getAttribute('aria-live'), 'polite');
  for (const selector of ['[data-agentic-trace]', '[data-agentic-speed]']) {
    const control = dock.querySelector(selector);
    assert.equal(control.tagName, 'BUTTON', selector);
    assert.equal(control.closest('[aria-hidden]'), null, selector);
    assert.ok(parseFloat(window.getComputedStyle(control).minHeight) >= 44, selector);
    assert.ok(control.getAttribute('aria-label'), selector);
  }
  controller.skip();
  for (const selector of ['[data-agentic-dock-replay]', '.agentic-dock-close', '[data-agentic-replay]']) {
    const control = document.querySelector(selector);
    assert.ok(parseFloat(window.getComputedStyle(control).minHeight) >= 44, selector);
    assert.equal(control.tagName, 'BUTTON');
  }
  assert.ok(document.querySelector('.agentic-dock-close').getAttribute('aria-label'));
  document.querySelector('.agentic-dock-close').click();
  assert.equal(dockOf(document), null, 'the pill can be dismissed');
});

test('Replay restarts the whole tour from the top, only on an explicit click', t => {
  const { document, window, controller, clock } = setup(t, { width: 1280, frames: true });
  stepTo(controller, clock, 3, 200);
  controller.skip();
  const replay = dockOf(document).querySelector('[data-agentic-dock-replay]');
  replay.focus();
  replay.click();
  assert.equal(controller.touring, true);
  assert.equal(document.activeElement, document.querySelector('[data-agentic-skip]'), 'keyboard focus stays in the dock');
  assert.equal(controller.phase, 'hero');
  assert.equal(controller.tour.index, 0);
  assert.equal(window.scrollY, 0, 'from the top');
  assert.equal(window.localStorage.getItem(storageKey), 'seen', 'replay does not erase the preference');
  stepTo(controller, clock, 1, 100);
  assert.equal(controller.tour.name, stopNames(document)[1]);
  // A cancelled replay does not renew automatic section passes.
  document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
  assert.equal(controller.touring, false);
  assert.equal(controller.sectionsEligible, false);
  // Returning visit: no dock until the footer Replay is clicked.
  const back = setup(t, { seen: true });
  assert.equal(dockOf(back.document), null);
  back.document.querySelector('[data-agentic-replay]').click();
  assert.equal(back.controller.touring, true);
  assert.ok(dockOf(back.document));
  back.controller.skip();
});

test('returning visits, deep links, back/forward, reduced motion and blocked storage get no tour and no dock', t => {
  for (const options of [{ seen: true }, { hash: '#work' }, { navigationType: 'back_forward' }, { reduced: true }, { storageBlocked: true }]) {
    const { document, controller } = setup(t, options);
    const label = JSON.stringify(options);
    assert.equal(controller.touring, false, label);
    assert.equal(controller.phase, 'ready', label);
    assertNoResidue(document, { dock: 'none' });
    assert.equal(document.querySelector('[data-agentic-replay]').hidden, false, label);
  }
});

test('lower sections are prepared hidden only below the fold, and only while the tour runs', t => {
  const { document, window, controller, clock } = setup(t, { width: 1280, frames: true });
  let index = 0;
  let checked = 0;
  let before = new Set();
  while (controller.touring && clock.now() < 90000) {
    clock.step(16);
    const pending = new Set(document.querySelectorAll('[data-build-state="pending"]'));
    const carried = before;
    before = pending;
    if (!controller.touring || controller.tour.index === index) continue;
    index = controller.tour.index;
    // The stop has just launched; nothing has scrolled yet. (Items still
    // waiting for a rescuer carry over hidden; the rescue-cap test times them.)
    for (const element of pending) {
      if (element.closest('#home') || carried.has(element)) continue;
      const rect = element.getBoundingClientRect();
      if (rect.height > 0) { assert.ok(rect.top >= window.innerHeight - 1, `${element.tagName}.${element.className || element.id} "${element.textContent.trim().slice(0, 24)}" was visible (${controller.tour.name})`); checked++; }
    }
  }
  if (measurable(document)) assert.ok(checked > 0, 'some lower content was assembled');
  assertNoResidue(document);
});

test('after a cancelled first-visit tour, manual passes trace with small crews and update the dock', async t => {
  const { window, document, controller, intersect } = setup(t, { observeSections: true, width: 1280 });
  document.querySelector('#main').dispatchEvent(new window.WheelEvent('wheel', { bubbles: true, deltaY: 80 }));
  assert.equal(controller.touring, false);
  assert.equal(controller.sectionsEligible, true);
  const section = document.querySelector('#work');
  const originalText = section.textContent;
  intersect(section, true);
  assert.equal(controller.phase, 'section');
  assert.equal(section.querySelector('[data-build-state="pending"]'), null, 'nothing already readable is hidden');
  assert.equal(section.textContent, originalText);
  assert.ok(controller.stats.agents <= 5);
  const dock = dockOf(document);
  assert.ok(dock.classList.contains('is-busy'));
  assert.ok(await until(() => controller.stats.working > 0 || controller.phase === 'ready', 2000));
  if (controller.phase === 'section') assert.equal(dock.querySelector('.agentic-dock-count').textContent, String(controller.stats.working));
  assert.ok(await until(() => controller.phase === 'ready', 3000));
  assert.equal(dock.classList.contains('is-busy'), false);
  assert.equal(document.querySelector('[data-build-state]'), null);
  // The section the tour already built is not traced again.
  intersect(document.querySelector('#home'), true);
  assert.equal(controller.phase, 'ready');
  // Skip ends passes for the visit.
  controller.skip();
  intersect(document.querySelector('#approach'), true);
  assert.equal(controller.phase, 'ready');
  assert.equal(document.querySelector('.agentic-stage'), null);
});

test('crew size scales with the viewport: one orchestrator plus 20, 9 or 8 subagents', t => {
  assert.deepEqual([1440, 1280, 1100, 1024, 768, 640, 390, 375, 360].map(crewTier),
    ['desktop', 'desktop', 'desktop', 'tablet', 'tablet', 'tablet', 'phone', 'phone', 'phone']);
  // Phones: five builders plus three spare hands for rescues.
  for (const [width, subagents] of [[1280, 20], [768, 9], [375, 8]]) {
    assert.equal(crewSize(width), subagents);
    const { document, controller } = setup(t, { width });
    assert.equal(controller.crewSize, subagents);
    assert.equal(controller.crewTier, crewTier(width));
    assert.equal(document.querySelectorAll('.agentic-cursor').length, subagents + 1);
    assert.equal(document.querySelectorAll('.agentic-cursor.is-orchestrator').length, 1);
    assert.equal(dockOf(document).querySelectorAll('.agentic-dot').length, subagents + 1);
    assert.equal(controller.stats.agents, subagents);
    // Every cursor carries one role badge and colour; roles repeat only as numbered instances.
    const labels = [...document.querySelectorAll('.agentic-role')].map(label => label.textContent);
    assert.equal(new Set(labels).size, labels.length);
    controller.skip();
    assertNoResidue(document);
  }
});

test('working cursors say what they are doing, and the hero completes every counted target', t => {
  const { document, controller, clock } = setup(t, { width: 1280, frames: true });
  const total = controller.stats.targets;
  assert.ok(total > 0);
  assert.equal(document.querySelectorAll('[data-agentic-job]').length, total);
  const actions = new Set();
  let done = 0;
  while (controller.touring && controller.tour.index === 0) {
    clock.step(16);
    document.querySelectorAll('.agentic-cursor.is-working .agentic-role').forEach(label => actions.add(label.textContent));
    if (controller.tour.index === 0) done = controller.stats.done;
  }
  assert.equal(done, total, 'every hero target was worked');
  // An action, and for the headline's words the word being set.
  assert.ok([...actions].every(text => /^[a-z0-9]+ · [a-zé ]+( '[A-Za-z]+')?$/.test(text)), [...actions].join(' | '));
  for (const expected of ['layout · framing header', 'qa · checking contrast', 'orchestrator · dispatching']) {
    assert.ok(actions.has(expected), `missing "${expected}"`);
  }
  assert.ok([...actions].some(text => /^copy · writing /.test(text)), 'copy agents say what they write');
  assert.ok([...actions].every(text => !/token|model|api|latency|ms\b|pass(ed)?\b|fail/i.test(text)), 'presentation work only');
  controller.skip();
});

test('one controller drives one animation-frame loop across stops, replay and skip', t => {
  const { document, controller, clock } = setup(t, { width: 1280, frames: true });
  assert.equal(clock.pending.size, 1);
  while (controller.touring && controller.tour.index < 2) { clock.step(16); assert.ok(clock.pending.size <= 1); }
  controller.replay();
  controller.replay();
  assert.equal(document.querySelectorAll('.agentic-stage').length, 1);
  assert.equal(document.querySelectorAll('.agentic-dock').length, 1);
  assert.equal(document.querySelectorAll('.agentic-cursor').length, crewSize(1280) + 1);
  assert.equal(clock.pending.size, 1);
  controller.skip();
  assert.equal(clock.pending.size, 0);
  assertNoResidue(document);
});

test('a hidden tab pauses the tour, including its scrolling, and resumes where it left off', t => {
  const { document, window, controller, clock } = setup(t, { width: 1280, frames: true });
  let hidden = false;
  Object.defineProperty(document, 'hidden', { get: () => hidden, configurable: true });
  stepTo(controller, clock, 1, 300);
  const y = window.scrollY;
  hidden = true;
  document.dispatchEvent(new window.Event('visibilitychange'));
  assert.equal(controller.paused, true);
  assert.equal(clock.pending.size, 0);
  clock.step(60000);
  assert.equal(controller.touring, true);
  assert.equal(controller.tour.index, 1);
  assert.equal(window.scrollY, y);
  hidden = false;
  document.dispatchEvent(new window.Event('visibilitychange'));
  assert.equal(controller.paused, false);
  assert.equal(clock.pending.size, 1);
  stepTo(controller, clock, 99);
  assert.equal(controller.touring, false);
  assertNoResidue(document);
});

test('switching to reduced motion mid-tour settles everything, removes the dock and disables replay', t => {
  let listener;
  const query = { matches: false, addEventListener: (_, callback) => { listener = callback; }, removeEventListener() {} };
  const { document, controller } = setup(t, { media: () => query });
  assert.equal(controller.touring, true);
  query.matches = true;
  listener();
  assert.equal(controller.touring, false);
  assertNoResidue(document, { dock: 'none' });
  assert.equal(document.querySelector('[data-agentic-replay]').disabled, true);
});

test('the dock announces each section once, politely, and keeps decoration out of the accessibility tree', t => {
  const { document, controller, clock } = setup(t, { width: 1280, frames: true });
  const live = dockOf(document).querySelector('.agentic-dock-live');
  const messages = [live.textContent];
  while (controller.touring && clock.now() < 90000) {
    clock.step(32);
    if (live.textContent !== messages.at(-1)) messages.push(live.textContent);
  }
  if (live.textContent !== messages.at(-1)) messages.push(live.textContent);
  const stops = stopNames(document).length;
  assert.ok(messages.length <= stops + 2, `${messages.length} announcements for ${stops} sections`);
  assert.equal(new Set(messages).size, messages.length, 'no repeats');
  assert.match(messages[0], /Skip tour/);
  assert.match(messages.at(-1), /finished/);
  // Without the recorded trace nothing claims a replay, nor that agents built the page.
  assert.match(messages[0], /^Build tour: agents assemble the page, starting with the hero\./);
  assert.ok(messages.slice(1, -1).every(text => /^Building .+, section \d+ of \d+\.$|^Handoff: the tour is ending\.$/.test(text)), messages.join(' | '));
  assert.ok(messages.every(text => !/replay|recorded|agents built/i.test(text)), messages.join(' | '));
  // With it, the replay wording, scoped to the rounds it covers.
  const replayed = setup(t, { width: 1280, frames: true, config: { trace: traceData } });
  const replayLive = dockOf(replayed.document).querySelector('.agentic-dock-live');
  const replayMessages = [replayLive.textContent];
  while (replayed.controller.touring && replayed.clock.now() < 90000) {
    replayed.clock.step(32);
    if (replayLive.textContent !== replayMessages.at(-1)) replayMessages.push(replayLive.textContent);
  }
  assert.match(replayMessages[0], /^Build tour: a visual replay of the recorded agent run behind rounds 4–5 of this page, starting with the hero\./);
  assert.ok(replayMessages.slice(1, -1).every(text => /^Replaying recorded steps for .+, section \d+ of \d+\.$|^Replay ending/.test(text)), replayMessages.join(' | '));
  assert.ok(replayMessages.every(text => !/assembl|agents built|Building /.test(text)), replayMessages.join(' | '));
  // Decoration is hidden; real headings exist once.
  controller.replay();
  const decoration = document.querySelector('.agentic-decoration');
  assert.equal(decoration.getAttribute('aria-hidden'), 'true');
  assert.ok(decoration.contains(document.querySelector('.agentic-cursor')));
  assert.equal(document.querySelectorAll('h1').length, 1);
  assert.equal(document.querySelector('.agentic-stage').querySelectorAll('h1, h2, p').length, 0);
  controller.skip();
});

test('decorative layers never take pointer input', t => {
  const { document, window } = setup(t);
  assert.equal(window.getComputedStyle(document.querySelector('.agentic-stage')).pointerEvents, 'none');
});

test('returning from the history cache keeps replay usable without restarting automatically', t => {
  const { window, document, controller } = setup(t);
  window.dispatchEvent(new window.PageTransitionEvent('pagehide', { persisted: true }));
  assert.equal(controller.touring, false);
  assert.equal(controller.sectionsEligible, false);
  assertNoResidue(document, { dock: 'none' });
  document.querySelector('[data-agentic-replay]').click();
  assert.equal(controller.touring, true);
  controller.skip();
});

test('replay is placed inside the footer row without displacing its final item', t => {
  const { document } = setup(t, { seen: true });
  const row = document.querySelector('.footer-bottom');
  const replay = row.querySelector('[data-agentic-replay]');
  assert.ok(replay);
  assert.notEqual(row.lastElementChild, replay);
  // Three spans; the last one carries both lab links, each with an arrow icon (no glyph).
  assert.equal(row.querySelectorAll(':scope > span').length, 3);
  assert.equal(row.lastElementChild.textContent.replace(/\s+/g, ' ').trim(), 'BUILT IN PLAIN HTML, CSS AND JS. SEE THE AGENT RUN BEHIND IT HOW I EVALUATE AGENTS');
  assert.deepEqual([...row.lastElementChild.querySelectorAll('a')].map(link => link.getAttribute('href')), ['./lab/build-trace.html', './lab/evaluating-agents.html']);
  assert.deepEqual([...row.lastElementChild.querySelectorAll('a')].map(link => link.querySelectorAll('.icon-arrow-e[aria-hidden="true"]').length), [1, 1]);
  assert.equal(replay.querySelectorAll('.icon-arrow-ne[aria-hidden="true"]').length, 1, 'the replay arrow is an icon');
  assert.equal(replay.textContent.trim(), 'Replay build tour');
});

test('with fast timing the whole first visit completes without residue', async t => {
  const { document, window, controller } = setup(t, { width: 1280 });
  assert.ok(await until(() => !controller.touring, 6000), 'tour finished');
  assert.equal(controller.phase, 'ready');
  assert.equal(window.localStorage.getItem(storageKey), 'seen');
  assertNoResidue(document);
});

test('a ride-along crew carries over between stops, so cursors never all vanish', t => {
  const { document, controller, clock } = setup(t, { width: 1280, frames: true });
  assert.ok(visibleCursors(document).length >= 1, 'the orchestrator is on screen from the first frame');
  let index = 0;
  let previous = [];
  let carried = 0;
  let transitions = 0;
  while (controller.touring && clock.now() < 90000) {
    clock.step(16);
    if (!controller.touring) break;
    const shown = visibleCursors(document);
    assert.ok(shown.length >= 1, `no cursor on screen at ${clock.now()}ms (${controller.tour.name})`);
    if (controller.tour.index !== index) {
      index = controller.tour.index;
      transitions++;
      // Carried cursors appear where they were a frame ago.
      const near = shown.filter(cursor => {
        const p = cursorPoint(cursor);
        return p && previous.some(q => Math.hypot(p.x - q.x, p.y - q.y) < 40);
      });
      assert.ok(near.length >= 2, `${controller.tour.name}: ${near.length} carried cursors`);
      assert.ok(document.querySelector('.agentic-cursor.is-orchestrator.is-in:not(.is-docked)'), 'the orchestrator leads the crew');
      carried += near.length;
    }
    previous = shown.map(cursorPoint).filter(Boolean);
  }
  assert.equal(transitions, stopNames(document).length - 1);
  assert.ok(carried >= transitions * 2);
  assertNoResidue(document);
});

test('sections are placed item by item by a big crew on desktop and a small one on phones', t => {
  const { document, controller, clock } = setup(t, { width: 1280, frames: true });
  let peak = 0;
  let capabilityJobs = 0;
  let tagKids = 0;
  let bulletJobs = 0;
  const labels = new Set();
  while (controller.touring && clock.now() < 90000) {
    clock.step(16);
    peak = Math.max(peak, visibleCursors(document).length);
    capabilityJobs = Math.max(capabilityJobs, document.querySelectorAll('#capabilities .capability[data-agentic-job="place"]').length);
    tagKids = Math.max(tagKids, document.querySelectorAll('#capabilities .tag-list li[data-build-kind="kid"]').length);
    bulletJobs = Math.max(bulletJobs, document.querySelectorAll('#experience .xp-points > li[data-agentic-job]').length);
    if (controller.touring && controller.tour.index > 0) document.querySelectorAll('.agentic-cursor.is-working .agentic-role').forEach(label => labels.add(label.textContent));
  }
  if (measurable(document)) {
    assert.ok(capabilityJobs >= 3, `${capabilityJobs} capability cards got their own job`);
    assert.ok(tagKids >= 3, `${tagKids} tags cascade after their card`);
    assert.ok(bulletJobs >= 3, `${bulletJobs} experience bullets placed one at a time`);
    assert.ok([...labels].some(text => /^(copy|type|links|qa)·?\d? · placing '.+'$/.test(text)), 'item labels name the item');
  }
  assert.ok(peak >= 15, `desktop peak of ${peak} visible cursors`);
  // Short labels: role, action and at most a 30-character item name.
  // (Quoted item names are real page content; the actions are presentation only.)
  const actions = [...labels].map(text => text.replace(/'.*'/, ''));
  assert.ok(actions.every(text => !/token|model|api\b|latency|\bms\b|passed|failed/i.test(text)), actions.filter(text => /token|model|api\b|latency|\bms\b|passed|failed/i.test(text)).join(' | '));
  assert.ok([...labels].every(text => (/'(.*)'/.exec(text)?.[1] || '').length <= 30), 'names are truncated');
  assertNoResidue(document);
  // Phones: a handful of cursors at most (five builders, up to three spare
  // hands called out for rescues, and the orchestrator).
  const phone = setup(t, { width: 375, frames: true });
  let phonePeak = 0;
  while (phone.controller.touring && phone.clock.now() < 90000) { phone.clock.step(16); phonePeak = Math.max(phonePeak, visibleCursors(phone.document).length); }
  assert.ok(phonePeak >= 3 && phonePeak <= 9, `phone peak of ${phonePeak} visible cursors`);
});

test('the dock Trace panel lists the recorded steps, follows the tour, and Escape only closes it', t => {
  const { document, window, controller, clock } = setup(t, { width: 1280, frames: true, config: { trace: traceData } });
  assert.equal(controller.traceState, 'ready');
  const dock = dockOf(document);
  const toggle = dock.querySelector('[data-agentic-trace]');
  const panel = document.getElementById(toggle.getAttribute('aria-controls'));
  assert.ok(panel && dock.contains(panel));
  assert.equal(toggle.tagName, 'BUTTON');
  assert.equal(toggle.textContent, 'Trace');
  assert.equal(toggle.getAttribute('aria-expanded'), 'false');
  assert.equal(panel.hidden, true);
  assert.equal(panel.getAttribute('role'), 'region');
  assert.equal(document.getElementById(panel.getAttribute('aria-labelledby')).textContent, 'Recorded replay · rounds 4–5 · 16 commits · Nov 10–11, 2026');
  // The panel follows its toggle in the DOM, so Tab from the open toggle enters it.
  assert.ok(toggle.compareDocumentPosition(panel) & window.Node.DOCUMENT_POSITION_FOLLOWING);
  assert.match(panel.querySelector('.agentic-trace-honesty').textContent, /The number of cursors is a visualization too; the trace counts role types, not separate agents\.$/);
  toggle.dispatchEvent(new window.Event('pointerdown', { bubbles: true }));
  toggle.focus();
  toggle.click();
  assert.equal(controller.touring, true, 'opening the trace does not cancel the tour');
  assert.equal(toggle.getAttribute('aria-expanded'), 'true');
  assert.equal(panel.hidden, false);
  assert.equal(document.activeElement, toggle, 'focus stays on the toggle');
  assert.ok(panel.textContent.includes('Steps, results and commits are real. Cursor positions and typing are a visualization. Commit times are exact; other times are estimated.'));
  assert.match(panel.querySelector('.agentic-visually-hidden').textContent, /compressed time axis/);
  const full = panel.querySelector('a.agentic-trace-full');
  assert.deepEqual([full.getAttribute('href'), full.textContent], ['./lab/build-trace.html', 'Open the full trace']);
  // One list item per recorded span: role chip, action, result, status, timing, commit and a bar.
  const list = panel.querySelector('ol');
  assert.ok(list.getAttribute('aria-label'));
  assert.equal(list.tabIndex, 0, 'the list scrolls by keyboard');
  const rows = traceRows(document);
  assert.equal(rows.length, traceData.spans.length);
  assert.ok(rows.every(row => row.tagName === 'LI' && row.querySelector('.agentic-span-chip[aria-hidden="true"]') && row.querySelector('.agentic-span-track[aria-hidden="true"] .agentic-span-bar')));
  const row = rows.find(item => item.querySelector('.agentic-span-action').textContent === 'Move the project explorer into the Work section');
  assert.equal(row.querySelector('.agentic-span-role').textContent, 'implementation-worker');
  assert.equal(row.querySelector('.agentic-span-status').textContent, 'ok');
  assert.equal(row.querySelector('.agentic-span-timing').textContent, 'estimated');
  assert.equal(row.querySelector('.agentic-span-commit').textContent, '5bf7267');
  assert.match(row.querySelector('.agentic-span-result').textContent, /One gallery replaces/);
  assert.ok(row.querySelector('.agentic-span-bar').style.width.endsWith('%'));
  assert.deepEqual(new Set(rows.map(item => item.querySelector('.agentic-span-status').textContent)), new Set(['ok', 'error', 'retried', 'fixed']));
  assert.deepEqual(new Set(rows.map(item => item.querySelector('.agentic-span-timing').textContent)), new Set(['exact', 'estimated']));
  assert.equal(panel.querySelector('.agentic-trace-list a'), null, 'commits are plain text, no links');
  // The hero's steps are highlighted, then About's as the tour moves on.
  const hero = currentActions(document);
  assert.ok(hero.includes('Save the readability and scroll improvements') && hero.length === 6, hero.join(' | '));
  stepTo(controller, clock, 1, 300);
  const about = currentActions(document);
  assert.ok(about.includes('Open About into the light scene as the visitor scrolls'), about.join(' | '));
  assert.ok(!about.includes('Save calmer labels and a cleaner tour finish'), 'a hero-only step is no longer highlighted');
  assert.match(panel.querySelector('.agentic-trace-where').textContent, /About/);
  // Escape closes the panel; the tour goes on and focus returns to the toggle.
  document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  assert.equal(controller.touring, true);
  assert.equal(toggle.getAttribute('aria-expanded'), 'false');
  assert.equal(panel.hidden, true);
  assert.equal(document.activeElement, toggle);
  // Tabbing between the dock's own controls does not end the tour either.
  toggle.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
  assert.equal(controller.touring, true);
  toggle.click();
  stepTo(controller, clock, 99);
  assert.equal(controller.touring, false);
  // The trace stays available from the pill, with nothing highlighted.
  assert.equal(dock.dataset.state, 'pill');
  assert.ok(dock.contains(toggle) && window.getComputedStyle(toggle).display !== 'none');
  assert.equal(panel.hidden, false);
  assert.equal(currentActions(document).length, 0);
  assert.match(dock.querySelector('.agentic-dock-summary').textContent, /^Replayed in \d+ s$/, 'the pill claims only the replay time');
  const pillLink = dock.querySelector('a.agentic-dock-full');
  assert.equal(pillLink.getAttribute('href'), './lab/build-trace.html');
  assert.equal(pillLink.getAttribute('aria-label'), 'Open the full trace');
  assert.equal(pillLink.textContent, 'Open the full trace');
  assert.notEqual(window.getComputedStyle(pillLink).display, 'none', 'the pill shows the link');
  document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  assert.equal(panel.hidden, true);
  // After Skip as well.
  const skipped = setup(t, { width: 1280, frames: true, config: { trace: traceData } });
  stepTo(skipped.controller, skipped.clock, 2, 200);
  skipped.controller.skip();
  dockOf(skipped.document).querySelector('[data-agentic-trace]').click();
  assert.equal(traceRows(skipped.document).length, traceData.spans.length);
});

test('with the recorded trace, working cursors name real steps of their stop, and an error turns into its retry or fix', t => {
  const { document, controller, clock } = setup(t, { width: 1280, frames: true, layout: true, config: { trace: traceData } });
  const spread = ['All', 'Tour'];
  const lower = text => text[0].toLowerCase() + text.slice(1);
  const last = new Map();
  const labels = new Set();
  let recovered = 0;
  let errors = 0;
  let mostErrors = 0;
  const pins = new Map();
  while (controller.touring && clock.now() < 90000) {
    clock.step(16);
    if (!controller.touring) break;
    const stop = controller.tour.name;
    document.querySelectorAll('.agentic-pin-note').forEach(note => pins.set(note.textContent, stop));
    // At most one error label on screen, and none in the hero's first 2.5 s.
    const errorLabels = document.querySelectorAll('.agentic-cursor.is-working:not(.is-docked) .agentic-role[data-status="error"]').length;
    mostErrors = Math.max(mostErrors, errorLabels);
    if (stop === 'Hero' && clock.now() < 2500) assert.equal(errorLabels, 0, `error label at ${clock.now()} ms into the hero`);
    const shown = [...document.querySelectorAll('.agentic-cursor.is-working:not(.is-docked) .agentic-role:not([data-quiet])')]
      .filter(label => label.textContent.includes(' · '));
    const actions = [];
    for (const label of shown) {
      const text = label.textContent;
      const [, role, action] = /^([a-z-]+)(?:·\d+)? · (.+)$/.exec(text) || [];
      assert.ok(REAL_ROLES.includes(role), text);
      const stem = action.replace(/…$/, '');
      const match = traceData.spans.find(span => span.role === role && lower(span.action).startsWith(stem)
        && (span.sections.includes(stop) || span.sections.some(name => spread.includes(name)) || traceData.spans.some(head => head.id === span.parent && head.role === role)));
      assert.ok(match, `${stop}: ${text} is a recorded step of ${role}`);
      if (action.endsWith('…')) assert.ok(action.length <= 38, text);
      const status = label.dataset.status || '';
      assert.equal(status, ['error', 'retried', 'fixed'].includes(match.status) ? match.status : '', text);
      if (status === 'error') errors++;
      if (last.get(label) === 'error' && (status === 'retried' || status === 'fixed')) recovered++;
      last.set(label, status);
      actions.push(action);
      labels.add(text);
    }
    assert.equal(new Set(actions).size, actions.length, `no step on two cursors at once: ${actions.join(' | ')}`);
  }
  assert.ok(labels.size >= 20, `${labels.size} distinct labels`);
  assert.ok(errors > 0, 'recorded errors are shown');
  assert.equal(mostErrors, 1, 'one error label at a time');
  if (measurable(document)) assert.ok(pins.size >= 1, 'at least one pin with a recorded finding');
  // QA pins carry real review findings of their stop (none invented).
  const findings = { 'found frozen review notes': 'Capabilities', 'found tiny text': 'Projects' };
  for (const [note, stop] of pins) assert.equal(findings[note], stop, `pin "${note}" on ${stop}`);
  assert.ok(recovered > 0, 'an error label turns into its retry or fix');
  assert.ok([...labels].every(text => !/dispatching|writing intro|checking/.test(text)), 'no choreography labels once the trace is in');
  assertNoResidue(document);
});

test('the trace loads in parallel; a failed, missing or late trace leaves the tour and its labels as they were', async t => {
  const calls = [];
  const ok = setup(t, { width: 1280, fetch: url => { calls.push(String(url)); return Promise.resolve({ ok: true, json: () => Promise.resolve(traceData) }); } });
  assert.equal(ok.controller.touring, true, 'the tour starts without waiting');
  assert.equal(ok.controller.traceState, 'loading');
  assert.deepEqual(calls, ['./trace/build-trace.json']);
  assert.ok(await until(() => ok.controller.traceState === 'ready'));
  for (const [name, fetch] of [
    ['rejected', () => Promise.reject(new Error('offline'))],
    ['404', () => Promise.resolve({ ok: false, json: () => Promise.resolve({}) })],
    ['invalid', () => Promise.resolve({ ok: true, json: () => Promise.resolve({ spans: 'nope' }) })],
    ['throws', () => { throw new Error('blocked'); }],
  ]) {
    const { controller } = setup(t, { width: 1280, fetch });
    assert.ok(await until(() => controller.traceState === 'failed'), `${name}: ${controller.traceState}`);
    assert.equal(controller.touring || controller.phase === 'ready', true, name);
  }
  // Lazy: nothing is fetched on returning visits, deep links or reduced motion;
  // a Replay fetches it (once).
  for (const options of [{ seen: true }, { hash: '#work' }, { reduced: true }]) {
    const asked = [];
    const quiet = setup(t, { width: 1280, ...options, fetch: url => { asked.push(url); return new Promise(() => {}); } });
    assert.equal(quiet.controller.touring, false, JSON.stringify(options));
    assert.deepEqual(asked, [], `${JSON.stringify(options)}: no trace request`);
    assert.equal(quiet.controller.traceState, 'off');
    if (options.reduced) continue;
    quiet.document.querySelector('[data-agentic-replay]').click();
    assert.deepEqual(asked, ['./trace/build-trace.json'], `${JSON.stringify(options)}: Replay loads it`);
    quiet.controller.skip();
    const toggle = dockOf(quiet.document).querySelector('[data-agentic-trace]');
    toggle.click();
    assert.equal(asked.length, 1, 'opening the panel does not ask again');
  }
  // Never arrives: the whole tour plays on choreography labels.
  const late = setup(t, { width: 1280, frames: true, fetch: () => new Promise(() => {}) });
  const labels = new Set();
  while (late.controller.touring && late.clock.now() < 90000) {
    late.clock.step(16);
    late.document.querySelectorAll('.agentic-cursor.is-working .agentic-role').forEach(label => labels.add(label.textContent));
  }
  assert.equal(late.controller.traceState, 'loading');
  assert.ok([...labels].some(text => /^copy(·\d)? · writing /.test(text)), 'choreography labels');
  assert.match(dockOf(late.document).querySelector('.agentic-dock-summary').textContent, /^Built by \d+ agents in \d+ s$/);
  const toggle = dockOf(late.document).querySelector('[data-agentic-trace]');
  toggle.click();
  const panel = late.document.getElementById(toggle.getAttribute('aria-controls'));
  assert.match(panel.textContent, /Loading the recorded trace/);
  assert.equal(traceRows(late.document).length, 0);
  assertNoResidue(late.document);
});

test('on phones the hero stop keeps a compact dock beside the résumé button, then the full dock returns', t => {
  const { document, window, controller, clock } = setup(t, { width: 390, height: 844, frames: true, layout: true });
  const dock = dockOf(document);
  assert.ok(dock.classList.contains('is-compact'), 'compact during the hero');
  assert.ok(dock.querySelector('[data-agentic-skip]') && dock.querySelector('[data-agentic-trace]'), 'Skip and Trace stay');
  if (measurable(document)) {
    clock.step(400);
    const cta = document.querySelector('.hero-actions .pill-button').getBoundingClientRect();
    const box = dock.getBoundingClientRect();
    const overlap = !(box.right <= cta.left || box.left >= cta.right || box.bottom <= cta.top || box.top >= cta.bottom);
    assert.ok(cta.height > 0 && !overlap, `dock ${JSON.stringify(box)} clear of the résumé button ${JSON.stringify(cta)}`);
    assert.ok(cta.bottom <= window.innerHeight, 'the résumé button is on screen');
  }
  stepTo(controller, clock, 1, 100);
  assert.equal(dock.classList.contains('is-compact'), false, 'the full dock after the hero');
  controller.skip();
  assert.equal(dock.classList.contains('is-compact'), false);
});

test('2x speed finishes the tour faster without cancelling it, and is remembered separately', t => {
  const normal = setup(t, { width: 1280, frames: true });
  stepTo(normal.controller, normal.clock, 99);
  const slow = normal.clock.now();
  const fast2 = setup(t, { width: 1280, frames: true });
  const { document, window, controller, clock } = fast2;
  stepTo(controller, clock, 0, 1000);
  const button = dockOf(document).querySelector('[data-agentic-speed]');
  assert.equal(button.textContent, '1×');
  button.dispatchEvent(new window.Event('pointerdown', { bubbles: true }));
  button.click();
  assert.equal(controller.touring, true, 'pressing it does not cancel');
  assert.equal(controller.speed, 2);
  assert.equal(button.textContent, '2×');
  assert.equal(button.getAttribute('aria-pressed'), 'true');
  assert.equal(window.localStorage.getItem(speedKey), '2');
  assert.equal(window.localStorage.getItem(storageKey), null, 'separate from the visit flag');
  let y = window.scrollY;
  let jump = 0;
  while (controller.touring && clock.now() < 90000) {
    clock.step(16);
    jump = Math.max(jump, Math.abs(window.scrollY - y));
    y = window.scrollY;
  }
  const quick = clock.now();
  assert.ok(quick < slow * 0.62, `2x took ${quick}ms vs ${slow}ms`);
  assert.match(dockOf(document).querySelector('.agentic-dock-summary').textContent, /^Built by \d+ agents in \d+ s$/, 'finished, not cancelled');
  assert.ok(jump < 200, `scroll moved at most ${jump}px per frame`);
  assertNoResidue(document);
});

test('the summary pill reports measured time without hidden-tab pauses, and a cancel says the tour was skipped', t => {
  const { document, window, controller, clock } = setup(t, { width: 1280, frames: true });
  let hidden = false;
  Object.defineProperty(document, 'hidden', { get: () => hidden, configurable: true });
  stepTo(controller, clock, 2, 500);
  hidden = true;
  document.dispatchEvent(new window.Event('visibilitychange'));
  clock.step(120000);
  hidden = false;
  document.dispatchEvent(new window.Event('visibilitychange'));
  stepTo(controller, clock, 99);
  const seconds = Math.round((clock.now() - 120000) / 1000);
  assert.match(dockOf(document).querySelector('.agentic-dock-summary').textContent, new RegExp(`^Built by \\d+ agents in ${seconds} s$`));
  const cancelled = setup(t, { width: 1280, frames: true });
  stepTo(cancelled.controller, cancelled.clock, 1, 200);
  cancelled.document.querySelector('#main').dispatchEvent(new cancelled.window.WheelEvent('wheel', { bubbles: true, deltaY: 100 }));
  assert.equal(dockOf(cancelled.document).querySelector('.agentic-dock-summary').textContent, 'Tour skipped ·');
});

test('handoff notes appear one at a time, beside the dock, hidden from assistive technology', t => {
  const { document, controller, clock } = setup(t, { width: 1280, frames: true });
  const texts = new Set();
  while (controller.touring && clock.now() < 90000) {
    clock.step(16);
    const on = document.querySelectorAll('.agentic-note.is-on');
    assert.ok(on.length <= 1, 'at most one note');
    on.forEach(note => {
      assert.equal(note.getAttribute('aria-hidden'), 'true');
      assert.equal(note.closest('[aria-live]'), null);
      assert.equal(note.querySelectorAll('.icon-arrow-e').length, 1, 'the handoff arrow is an icon');
      texts.add(note.textContent);
    });
  }
  assert.equal(document.querySelectorAll('.agentic-note').length <= 1, true);
  assert.ok(texts.size >= 5, `${texts.size} notes`);
  assert.ok([...texts].every(text => /^[a-z0-9]+ {2}[a-z0-9]+ · [a-z ]+$/.test(text)), [...texts].join(' | '));
  assert.ok([...texts].every(text => !/token|model|api|latency|test|pass|fail/i.test(text)));
  assert.equal(document.querySelectorAll('.agentic-note.is-on').length, 0, 'none left on the pill');
});

test('after the hero the page keeps moving until Contact, within the acceleration limit, with most of the crew out', t => {
  const { document, window, controller, clock } = setup(t, { width: 1280, frames: true });
  const limit = SCROLL.desktop.accel;
  let previous = null;
  let minV = Infinity;
  let maxAccel = 0;
  let minCursors = Infinity;
  let minWorking = Infinity;
  let maxWorking = 0;
  let maxStep = 0;
  let lastWorking = null;
  let sampled = 0;
  let settledAtContact = false;
  let heroEnd = 0;
  while (controller.touring && clock.now() < 90000) {
    clock.step(16);
    if (!controller.touring) break;
    const { index, name } = controller.tour;
    const { v } = controller.scroll;
    if (previous !== null) maxAccel = Math.max(maxAccel, Math.abs(v - previous) / 0.016);
    previous = v;
    if (index === 0) continue;
    // The hero is built at rest; About starts the scroll from zero.
    if (!heroEnd) heroEnd = clock.now();
    if (clock.now() - heroEnd < 250) continue;
    if (name === 'Contact') { if (Math.abs(v) < 1) settledAtContact = true; continue; }
    sampled++;
    minV = Math.min(minV, v);
    minCursors = Math.min(minCursors, visibleCursors(document).length);
    const working = controller.stats.working;
    minWorking = Math.min(minWorking, working);
    maxWorking = Math.max(maxWorking, working);
    if (lastWorking !== null) maxStep = Math.max(maxStep, Math.abs(working - lastWorking));
    lastWorking = working;
  }
  assert.ok(sampled > 100);
  assertNoResidue(document);
  if (!measurable(document) || document.documentElement.scrollHeight <= window.innerHeight + 10) return;
  // Velocity carries over between stops: it never reaches zero before Contact,
  // where the scroll settles fully before the handoff.
  assert.ok(minV > 10, `slowest scroll between the hero and Contact: ${minV.toFixed(1)} px/s`);
  assert.ok(settledAtContact, 'the scroll settles at Contact');
  assert.ok(maxAccel <= limit * 1.02, `peak acceleration ${maxAccel.toFixed(0)} px/s² (limit ${limit})`);
  // Most of the crew stays out between sections; the count moves in small steps.
  assert.ok(minCursors >= 8, `as few as ${minCursors} cursors on screen between the hero and Contact`);
  assert.ok(minWorking >= 8 && maxWorking <= 16, `crew band ${minWorking}-${maxWorking}`);
  assert.ok(maxStep <= 3, `crew count jumped by ${maxStep}`);
});

// Wholly inside a section's black fill, right of the paint wipe's edge.
function coveredByFill(document, rect) {
  const fill = document.querySelector('.agentic-wire-fill');
  if (!fill) return false;
  const r = fill.getBoundingClientRect();
  const clip = +(/inset\(0px 0px 0px ([\d.]+)px\)/.exec(fill.style.clipPath || '')?.[1] || 0);
  return rect.left >= r.left + clip - 0.5 && rect.top >= r.top - 0.5 && rect.bottom <= r.bottom + 0.5;
}

test('content the visitor can see is never left hidden for longer than the rescue cap', t => {
  for (const width of [1280, 375]) {
    const { document, window, controller, clock } = setup(t, { width, frames: true, layout: true });
    const since = new Map();
    const held = new Map();
    let worst = 0;
    let worstName = '';
    let worstHeld = 0;
    while (controller.touring && clock.now() < 120000) {
      clock.step(16);
      const now = clock.now();
      const seen = new Set();
      // Placeholder bars a pasted copy left, and a ghost on its way in: the
      // visitor sees that content coming, so it may wait longer (HOLE_CAP).
      const marks = [...document.querySelectorAll('.agentic-hole:not(.is-out), .agentic-frame.is-ghost:not(.is-out)')].map(mark => mark.getBoundingClientRect());
      const marked = rect => marks.some(m => m.left < rect.right && m.right > rect.left && m.top < rect.bottom && m.bottom > rect.top);
      for (const element of document.querySelectorAll('[data-build-state="pending"]')) {
        if (element.closest('#home, .site-header')) continue;
        // Tags waiting their turn in a cascade whose item is already placed
        // are progress (an item placed only in part has no state of its own).
        const owner = element.closest('[data-agentic-job]');
        if (owner && owner !== element && owner.dataset.buildState && owner.dataset.buildState !== 'pending') continue;
        const rect = element.getBoundingClientRect();
        if (!(rect.height > 0 && rect.top < window.innerHeight && rect.bottom > 0)) continue;
        // Still under a section's unpainted black fill: the visitor sees the wireframe, not a blank.
        if (coveredByFill(document, rect)) continue;
        seen.add(element);
        if (!held.has(element)) held.set(element, now);
        worstHeld = Math.max(worstHeld, now - held.get(element));
        // Inside a card or chapter a copy agent is pasting: it is on its way.
        if (marked(rect) || element.closest('[data-agentic-job="paste"]')) { since.delete(element); continue; }
        if (!since.has(element)) since.set(element, now);
        const blank = now - since.get(element);
        if (blank > worst) { worst = blank; worstName = `${element.tagName}.${element.className} "${element.textContent.trim().slice(0, 20)}" (${controller.tour?.name})`; }
      }
      for (const element of [...since.keys()]) if (!seen.has(element)) since.delete(element);
      for (const element of [...held.keys()]) if (!seen.has(element)) held.delete(element);
    }
    // Hidden only while an agent is on its way, never past the cap (one frame of slack).
    assert.ok(worst <= RESCUE.cap + 16, `${width}px: ${worstName} stayed hidden on screen for ${worst}ms`);
    assert.ok(worstHeld <= HOLE_CAP + RESCUE.cap + 16, `${width}px: something waited ${worstHeld}ms under a placeholder`);
    assertNoResidue(document);
  }
});

test('the hero hands over to About as soon as its content is built, with no pause before the scroll', t => {
  const { document, window, controller, clock } = setup(t, { width: 1280, frames: true });
  let built = 0;
  let handover = 0;
  let moving = 0;
  while (controller.touring && clock.now() < 20000) {
    clock.step(16);
    const index = controller.tour?.index;
    if (index === 0 && !built && !document.querySelector('[data-build-state]')) built = clock.now();
    if (index === 1 && !handover) {
      handover = clock.now();
      // Nothing in the hero is left hidden, and the crew carries on without docking.
      assert.equal(document.querySelector('#home [data-build-state], .site-header [data-build-state]'), null);
      assert.ok(document.querySelector('.agentic-cursor.is-orchestrator.is-in:not(.is-docked)'), 'the orchestrator leads the crew on');
      assert.ok(document.querySelectorAll('.agentic-cursor.is-carried:not(.is-orchestrator)').length >= 2, 'agents ride along');
    }
    if (handover && controller.scroll.v > 0) { moving = clock.now(); break; }
    if (handover && clock.now() - handover > 400) break;
  }
  assert.ok(built > 0, 'the hero builder jobs finished during the hero');
  assert.ok(handover > 0 && handover - built < 150, `the hero handed over ${handover - built}ms after its last build job`);
  controller.skip();
  if (!measurable(document) || document.documentElement.scrollHeight <= window.innerHeight + 10) return;
  assert.ok(moving > 0, 'About scrolls');
  assert.ok(moving - built < 150, `${moving - built}ms from the hero's last build job to the scroll`);
});

// The content column as entrance.js measures it: the header's bounds, or 6%
// margins when nothing can be measured.
const contentColumn = (document, width) => {
  const r = document.querySelector('.site-header').getBoundingClientRect();
  return r.width > 0 ? [r.left, r.right] : [width * 0.06, width * 0.94];
};

test('idle cursors wait in the side margins, clear of the content column', t => {
  const { document, controller, clock } = setup(t, { width: 1280, frames: true, layout: true });
  let checked = 0;
  const over = [];
  while (controller.touring && clock.now() < 90000) {
    clock.step(16);
    if (!controller.touring) break;
    const [left, right] = contentColumn(document, 1280);
    for (const cursor of document.querySelectorAll('.agentic-cursor.is-idle.is-in:not(.is-docked)')) {
      const p = cursorPoint(cursor);
      if (!p) continue;
      checked++;
      const x = p.x + 2;
      if (x > left - 8 + 0.2 && x < right + 8 - 0.2) over.push(`${cursor.textContent} at x=${x.toFixed(0)} (${controller.tour.name}, ${clock.now()}ms)`);
    }
  }
  assert.ok(checked > 200, `${checked} idle cursor samples`);
  assert.deepEqual(over.slice(0, 5), [], `${over.length} idle samples over the content column [${contentColumn(document, 1280).map(Math.round)}]`);
  assertNoResidue(document);
});

test('on phones at most three idle cursors stay out between stops; the others wait in the dock', t => {
  const { document, controller, clock } = setup(t, { width: 375, frames: true, layout: true });
  let index = 0;
  let transitions = 0;
  let peak = 0;
  let carriedPeak = 0;
  while (controller.touring && clock.now() < 90000) {
    clock.step(16);
    if (!controller.touring) break;
    peak = Math.max(peak, document.querySelectorAll('.agentic-cursor.is-idle.is-in:not(.is-docked)').length);
    if (controller.tour.index !== index) {
      index = controller.tour.index;
      transitions++;
      carriedPeak = Math.max(carriedPeak, document.querySelectorAll('.agentic-cursor.is-carried.is-in:not(.is-orchestrator):not(.is-docked)').length);
      assert.ok(document.querySelector('.agentic-cursor.is-orchestrator.is-in:not(.is-docked)'), 'the orchestrator stays out');
    }
  }
  assert.equal(transitions, stopNames(document).length - 1);
  assert.ok(carriedPeak <= 3, `${carriedPeak} agents carried between stops`);
  assert.ok(peak <= 3, `${peak} idle cursors on screen at once`);
  assertNoResidue(document);
});

// ---- hero intro: black screen, measured guides, paint wipe ----------------
// `translate: 412px 0px` reads back as "412px".
const translateOf = element => { const m = /([-\d.]+)px(?:\s+([-\d.]+)px)?/.exec(element.style.translate || ''); return m ? { x: +m[1], y: +(m[2] || 0) } : null; };
const numbersIn = text => (text.match(/\d+/g) || []).map(Number);
// Hero content that has started to appear (frames mark the first build job).
const heroStarted = document => document.querySelector('#home [data-build-state="typing"], #home [data-build-state="placing"], .site-header [data-build-state="placing"], .agentic-frame');

test('the hero opens on a black screen: the veil is opaque and no hero content shows', t => {
  const { document, window, controller, clock } = setup(t, { width: 1280, frames: true, layout: true });
  clock.run(300);
  const veil = document.querySelector('.agentic-veil');
  assert.ok(veil, 'the veil is up');
  const style = window.getComputedStyle(veil);
  assert.equal(style.opacity, '1');
  assert.equal(style.backgroundColor, 'rgb(16, 17, 20)');
  assert.ok(!veil.style.clipPath || veil.style.clipPath === 'none', `veil clip ${veil.style.clipPath}`);
  if (measurable(document)) {
    const r = veil.getBoundingClientRect();
    const view = document.documentElement;
    assert.ok(r.left <= 0 && r.top <= 0 && r.right >= view.clientWidth - 1 && r.bottom >= view.clientHeight - 1, 'covers the viewport');
  }
  assert.equal(heroStarted(document), null, 'no hero content has started');
  assert.ok(document.querySelectorAll('#home [data-build-state="pending"]').length > 0, 'hero content waits hidden');
  assert.ok(document.querySelector('.agentic-cursor.is-orchestrator.is-in'), 'the orchestrator is out');
  assert.equal(document.querySelector('.agentic-cursor.is-orchestrator .agentic-role').textContent, 'orchestrator · planning layout');
  assert.equal(document.querySelectorAll('.agentic-guide-label.is-on').length, 0, 'no guides drawn yet');
  controller.skip();
  assertNoResidue(document);
});

test('the hero stop builds the proof strip: hidden at first, placed before the tour leaves the hero', t => {
  // Laid out at 1280 x 800 in a real engine, so the strip is in view (the visible-target rule).
  const { document, controller, clock } = setup(t, { width: 1280, height: 800, frames: true, layout: true });
  const items = [...document.querySelectorAll('.hero-proof > li')];
  assert.equal(items.length, 3);
  const waiting = () => items.filter(item => item.closest('[data-build-state="pending"]')).length;
  clock.step(16);
  assert.equal(waiting(), 3, 'the facts wait hidden while the hero is planned');
  let placedAt = 0;
  while (controller.touring && controller.tour?.index === 0 && clock.now() < 20000) {
    clock.step(16);
    if (!placedAt && waiting() === 0) placedAt = clock.now();
  }
  assert.ok(placedAt > 0, 'placed during the hero stop');
  controller.skip();
  assertNoResidue(document);
  assert.equal(waiting(), 0);
});

test('guides are drawn before the first content job, labelled briefly with measured numbers, and the build follows the paint wipe', t => {
  const { document, window, controller, clock } = setup(t, { width: 1280, frames: true, layout: true });
  let firstJob = 0;
  let veilGone = 0;
  let guidesDone = 0;
  let painted = 0;
  let wipeOff = 0;
  // Each label's text when first shown, and how long it stayed up.
  const text = {};
  const onFor = {};
  const onAt = {};
  const early = [];
  const started = new Set();
  let labelsAfterVeil = 0;
  while (controller.touring && controller.tour.index === 0 && clock.now() < 4000) {
    clock.step(16);
    const now = clock.now();
    const labels = [...document.querySelectorAll('.agentic-guide-label')];
    for (const label of labels) {
      const id = label.dataset.guide;
      const on = label.classList.contains('is-on');
      if (on && onAt[id] === undefined) { onAt[id] = now; text[id] = label.textContent; }
      if (!on && onAt[id] !== undefined && onFor[id] === undefined) onFor[id] = now - onAt[id];
    }
    if (!guidesDone && labels.length && labels.every(label => onAt[label.dataset.guide] !== undefined)) guidesDone = now;
    const veil = document.querySelector('.agentic-veil');
    const painter = [...document.querySelectorAll('.agentic-cursor.is-working')].find(cursor => /painting canvas$/.test(cursor.textContent));
    const clip = veil && /inset\(0px 0px 0px ([\d.]+)px\)/.exec(veil.style.clipPath || '');
    if (painter && clip) {
      const x = cursorPoint(painter).x + 2;
      const edge = +clip[1];
      if (edge > 0 && edge < window.innerWidth) { painted++; wipeOff = Math.max(wipeOff, Math.abs(edge - x)); }
    }
    if (!veil && !veilGone) veilGone = now;
    if (!veil) labelsAfterVeil += document.querySelectorAll('.agentic-guide-label.is-on').length;
    if (!firstJob && heroStarted(document)) firstJob = now;
    // Nothing is built under the black: an item starts once the wipe has passed its left edge.
    if (measurable(document)) {
      for (const element of document.querySelectorAll('#home [data-build-state="typing"], #home [data-build-state="placing"], .site-header [data-build-state="placing"]')) {
        if (started.has(element)) continue;
        started.add(element);
        const left = element.getBoundingClientRect().left;
        if (veil && !(clip && +clip[1] >= left - 1)) early.push(`${element.className || element.tagName} at ${now}ms`);
      }
    }
  }
  assert.ok(firstJob > 0, 'the build started');
  assert.ok(guidesDone > 0 && guidesDone < firstJob, `guides drawn by ${guidesDone}ms, first job at ${firstJob}ms`);
  assert.ok(veilGone > guidesDone && veilGone <= 1800, `veil gone at ${veilGone}ms (guides ${guidesDone}ms)`);
  assert.ok(firstJob >= 1000, `the build waits for the wipe (${firstJob}ms)`);
  assert.equal(labelsAfterVeil, 0, 'no guide label is left over the page once the black is gone');
  if (!measurable(document)) return;
  assert.deepEqual(early, [], 'nothing is built under the black');
  assert.ok(painted > 10, `${painted} frames of paint wipe`);
  assert.ok(wipeOff <= 30, `the wipe follows the paint agent (off by ${wipeOff.toFixed(1)}px)`);
  // Labels are brief (a moment each, at most ~0.55 s).
  assert.ok(Object.values(onFor).every(ms => ms <= 560), `labels up for ${JSON.stringify(onFor)}`);
  // Every label is a measurement of the live layout (±1 px).
  const ids = Object.keys(text);
  for (const id of ['margin-left', 'margin-right', 'baseline', 'col-3', 'col-9', 'box-title', 'box-art']) assert.ok(ids.includes(id), `${id} guide in ${ids}`);
  const header = document.querySelector('.site-header').getBoundingClientRect();
  const [left, right] = [header.left, header.right];
  const near = (actual, expected, what) => assert.ok(Math.abs(actual - expected) <= 1, `${what}: label ${actual} vs measured ${expected.toFixed(1)}`);
  near(numbersIn(text['margin-left'])[0], left, 'left margin');
  near(numbersIn(text['margin-right'])[0], document.documentElement.clientWidth - right, 'right margin');
  near(numbersIn(text.baseline)[0], header.bottom, 'header baseline');
  const gutter = /gutter (\d+)/.exec(text['col-3']);
  const gap = gutter ? +gutter[1] : 0;
  if (gutter) near(gap, parseFloat(window.getComputedStyle(document.querySelector('.hero-bottom')).columnGap), 'gutter');
  const colW = (right - left - 11 * gap) / 12;
  for (const k of [3, 9]) {
    const [n, of, x] = numbersIn(text[`col-${k}`]);
    assert.deepEqual([n, of], [k, 12]);
    near(x, left + k * colW + (k - 0.5) * gap, `column ${k}`);
    const line = document.querySelector(`.agentic-guide[data-guide="col-${k}"]`);
    near(translateOf(line).x, x, `column ${k} line`);
  }
  for (const [id, sel] of [['box-title', '#hero-title'], ['box-art', '.hero-art']]) {
    if (!text[id]) continue;
    const r = document.querySelector(sel).getBoundingClientRect();
    assert.match(text[id], /^\d+ × \d+$/);
    const [w, h] = numbersIn(text[id]);
    near(w, r.width, `${sel} width`);
    near(h, r.height, `${sel} height`);
  }
  // Guides are decoration only.
  const guides = document.querySelector('.agentic-guides');
  assert.equal(guides.closest('[aria-hidden="true"]')?.classList.contains('agentic-decoration'), true);
  assert.equal(window.getComputedStyle(guides).pointerEvents, 'none');
  controller.skip();
  assertNoResidue(document);
});

test('the guides fade as the hero hands over and are gone when the hero run ends', t => {
  const { document, controller, clock } = setup(t, { width: 1280, frames: true });
  let fading = 0;
  let handover = 0;
  while (controller.touring && clock.now() < 20000) {
    clock.step(16);
    if (!fading && document.querySelector('.agentic-guides.is-fading')) fading = clock.now();
    if (controller.tour?.index === 1) { handover = clock.now(); break; }
  }
  assert.ok(handover >= 5000 && handover <= 7500, `the hero took ${handover}ms`);
  assert.ok(fading > 0 && handover - fading >= 400 && handover - fading <= 800, `guides faded from ${fading}ms, handover ${handover}ms`);
  assert.equal(document.querySelector('.agentic-guides, .agentic-guide, .agentic-veil'), null, 'no guides or veil after the hero');
  controller.skip();
});

test('cancelling during the guide phase removes the veil and guides and reveals everything', t => {
  for (const action of ['wheel', 'skip']) {
    const { document, window, controller, clock } = setup(t, { width: 1280, frames: true });
    clock.run(900);
    assert.ok(document.querySelector('.agentic-veil'), `${action}: veil still up`);
    assert.ok(document.querySelector('.agentic-guide-label.is-on'), `${action}: guides being drawn`);
    if (action === 'wheel') document.querySelector('#main').dispatchEvent(new window.WheelEvent('wheel', { bubbles: true, deltaY: 120 }));
    else document.querySelector('[data-agentic-skip]').click();
    assert.equal(controller.touring, false, action);
    assert.equal(document.querySelector('.agentic-veil, .agentic-guides, .agentic-guide, .agentic-guide-label'), null, `${action}: no veil or guides`);
    assertNoResidue(document);
    clock.step(2000);
    assert.equal(document.querySelector('.agentic-veil, .agentic-guide'), null, `${action}: nothing comes back`);
  }
});

test('the intro runs on the tour clock, so 2x halves it', t => {
  const { document, window, controller, clock } = setup(t, { width: 1280, frames: true });
  const button = dockOf(document).querySelector('[data-agentic-speed]');
  button.dispatchEvent(new window.Event('pointerdown', { bubbles: true }));
  button.click();
  assert.equal(controller.speed, 2);
  let veilGone = 0;
  while (controller.touring && clock.now() < 6000 && !veilGone) { clock.step(16); if (!document.querySelector('.agentic-veil')) veilGone = clock.now(); }
  // The wipe ends at 1.65 s at 1x.
  assert.ok(veilGone >= 780 && veilGone <= 880, `veil gone at ${veilGone}ms at 2x`);
  controller.skip();
  assertNoResidue(document);
});

// ---- lower sections: wireframe, paint sweep, skeletons ---------------------
// The paint sweep at the slowest stop pace (800 ms x 1.15), the no-blank
// grace after a section's top enters, and one frame of slack.
const PAINT_MAX = 920;
const GRACE = 250;
const FRAME = 16;
const sectionOf = (document, name) => document.querySelector(TOUR_STOPS.find(stop => stop.name === name).sel);
const fillClip = fill => { const m = /inset\(0px 0px 0px ([\d.]+)px\)/.exec(fill.style.clipPath || ''); return m ? +m[1] : null; };
// Any unpainted part of the fill inside the viewport.
const fillOnScreen = (document, window) => {
  const fill = document.querySelector('.agentic-wire-fill');
  if (!fill) return false;
  const r = fill.getBoundingClientRect();
  const left = r.left + (fillClip(fill) || 0);
  return Math.min(r.bottom, window.innerHeight) > Math.max(r.top, 0) && Math.min(r.right, window.innerWidth) > Math.max(left, 0);
};
// Steps a whole tour and calls `frame` after every frame with the current stop.
function eachFrame(controller, clock, document, frame, step = FRAME) {
  let index = -1;
  while (controller.touring && clock.now() < 120000) {
    clock.step(step);
    if (!controller.touring) break;
    const fresh = controller.tour.index !== index;
    index = controller.tour.index;
    const { name } = controller.tour;
    frame({ name, index, fresh, now: clock.now(), section: sectionOf(document, name) });
  }
}

test('a lower section still below the fold starts as a wireframe: black fill, measured guides and skeletons', t => {
  const { document, window, controller, clock } = setup(t, { width: 1280, frames: true, layout: true });
  const wired = [];
  const skipped = [];
  eachFrame(controller, clock, document, ({ name, index, fresh, section }) => {
    if (!fresh || index === 0) return;
    // The stop has just been planned; nothing has scrolled yet. A section
    // whose top has only just come in (a thin edge at the bottom) still
    // starts as a wireframe.
    const rect = section.getBoundingClientRect();
    const wire = document.querySelector('.agentic-wire');
    const fill = document.querySelector('.agentic-wire-fill');
    const edge = Math.min(120, window.innerHeight * 0.15);
    if (rect.top < window.innerHeight - edge) {
      // Already partly visible: no fill and no skeletons over it.
      assert.equal(fill, null, `${name}: no fill over a visible section`);
      assert.equal(document.querySelector('.agentic-skeleton'), null, `${name}: no skeletons`);
      skipped.push(name);
      return;
    }
    assert.ok(wire && fill, `${name}: wireframe before it enters`);
    const f = fill.getBoundingClientRect();
    for (const side of ['left', 'top', 'width', 'height']) assert.ok(Math.abs(f[side] - rect[side]) <= 1, `${name}: fill ${side} ${f[side]} vs section ${rect[side]}`);
    assert.ok(f.top >= window.innerHeight - edge - 1, `${name}: at most a thin edge of the fill is on screen yet`);
    assert.equal(window.getComputedStyle(fill).backgroundColor, 'rgb(16, 17, 20)');
    assert.equal(fillClip(fill), null, `${name}: not painted yet`);
    const blocks = wire.querySelectorAll('.agentic-skeleton');
    assert.ok(blocks.length >= 1, `${name}: skeletons`);
    // The blocks show over the black: a copy rides inside the fill (and is wiped with it).
    const onBlack = fill.querySelector('.agentic-skeleton');
    assert.ok(onBlack, `${name}: skeletons drawn over the black fill`);
    const block = window.getComputedStyle(onBlack);
    assert.equal(block.backgroundColor, 'rgba(255, 255, 255, 0.07)');
    assert.ok(parseFloat(block.borderRadius) > 0, 'rounded');
    // Each block sits on an item this stop will build, still hidden.
    const bases = [...wire.querySelectorAll(':scope > .agentic-wire-base > .agentic-skeleton')];
    assert.ok(bases.every(node => node.agenticTarget && section.contains(node.agenticTarget) && node.agenticTarget.dataset.buildState === 'pending'), `${name}: blocks map to pending items`);
    // Guides: margins at the content column's edges, the outline and its size, measured live.
    const header = document.querySelector('.site-header').getBoundingClientRect();
    const lines = [...wire.querySelectorAll('.agentic-wire-line')];
    assert.equal(lines.length, 2);
    assert.ok(Math.abs(translateOf(lines[0]).x + rect.left - header.left) <= 1, `${name}: left margin line`);
    assert.ok(Math.abs(translateOf(lines[1]).x + rect.left - header.right) <= 1, `${name}: right margin line`);
    assert.ok(wire.querySelector('.agentic-wire-outline'), `${name}: outline`);
    const label = id => wire.querySelector(`.agentic-wire-label[data-guide="${id}"]`).textContent;
    assert.match(label('margin-left'), /^margin \d+$/);
    assert.ok(Math.abs(numbersIn(label('margin-left'))[0] - header.left) <= 1, `${name}: ${label('margin-left')}`);
    assert.ok(Math.abs(numbersIn(label('margin-right'))[0] - (document.documentElement.clientWidth - header.right)) <= 1, `${name}: ${label('margin-right')}`);
    assert.match(label('size'), /^\d+ × \d+$/);
    const [w, h] = numbersIn(label('size'));
    assert.ok(Math.abs(w - rect.width) <= 1 && Math.abs(h - rect.height) <= 1, `${name}: ${label('size')} vs ${rect.width} × ${rect.height}`);
    // Decoration above the section, below frames and cursors.
    assert.equal(wire.closest('[aria-hidden="true"]')?.classList.contains('agentic-decoration'), true);
    assert.equal(window.getComputedStyle(wire).pointerEvents, 'none');
    assert.ok(wire.compareDocumentPosition(document.querySelector('.agentic-layer')) & 4, 'frames draw above the wireframe');
    assert.ok(wire.compareDocumentPosition(document.querySelector('.agentic-cursors')) & 4, 'cursors draw above the wireframe');
    wired.push(name);
  });
  assertNoResidue(document);
  if (!measurable(document)) return;
  assert.ok(wired.length >= 2, `wired ${wired} / skipped ${skipped}`);
});

test('the paint agent wipes the fill as the section enters, and the fill is gone within the grace plus the paint time', t => {
  const { document, window, controller, clock } = setup(t, { width: 1280, frames: true, layout: true });
  const stops = new Map();
  eachFrame(controller, clock, document, ({ name, fresh, now, section }) => {
    if (fresh && document.querySelector('.agentic-wire-fill')) stops.set(name, { painted: 0, off: 0 });
    const stop = stops.get(name);
    if (!stop || stop.gone) return;
    if (stop.entered === undefined && section.getBoundingClientRect().top < window.innerHeight) stop.entered = now;
    const fill = document.querySelector('.agentic-wire-fill');
    if (!fill) { stop.gone = now; return; }
    const clip = fillClip(fill);
    const painter = [...document.querySelectorAll('.agentic-cursor.is-working')].find(cursor => / · painting [a-z]+$/.test(cursor.textContent));
    if (clip !== null && painter) {
      const r = fill.getBoundingClientRect();
      const x = cursorPoint(painter).x + 2;
      if (clip > 0 && clip < r.width && x > 4 && x < window.innerWidth - 16) { stop.painted++; stop.off = Math.max(stop.off, Math.abs(r.left + clip - x)); }
    }
  });
  assertNoResidue(document);
  if (!measurable(document)) return;
  assert.ok(stops.size >= 2, `${stops.size} wired sections`);
  for (const [name, stop] of stops) {
    assert.ok(stop.entered !== undefined && stop.gone !== undefined, `${name}: entered and painted`);
    assert.ok(stop.gone - stop.entered <= GRACE + PAINT_MAX + FRAME, `${name}: fill gone ${stop.gone - stop.entered}ms after entering`);
    assert.ok(stop.painted >= 5, `${name}: ${stop.painted} frames of paint sweep`);
    assert.ok(stop.off <= 30, `${name}: the wipe follows the paint agent (off by ${stop.off.toFixed(1)}px)`);
  }
});

test('each skeleton block fades as its item is placed, never before', t => {
  const { document, controller, clock } = setup(t, { width: 1280, frames: true, layout: true });
  let blocks = 0;
  let faded = 0;
  const early = [];
  const late = [];
  const seen = new Set();
  eachFrame(controller, clock, document, ({ name }) => {
    for (const node of document.querySelectorAll('.agentic-wire > .agentic-wire-base > .agentic-skeleton')) {
      const target = node.agenticTarget;
      if (!seen.has(node)) { seen.add(node); blocks++; }
      const placed = target.dataset.buildState !== 'pending';
      const out = node.classList.contains('is-out');
      if (out && !node.counted) { node.counted = true; faded++; }
      if (out && !placed) early.push(`${name}: ${target.className}`);
      if (placed && !out) late.push(`${name}: ${target.className}`);
    }
  });
  assertNoResidue(document);
  if (!measurable(document)) return;
  assert.ok(blocks >= 5, `${blocks} skeleton blocks`);
  assert.ok(faded >= 5, `${faded} faded as items were placed`);
  assert.deepEqual(early.slice(0, 3), [], 'a block never fades before its item is placed');
  assert.deepEqual(late.slice(0, 3), [], 'a placed item never keeps its block');
});

test('the section guides fade once the builders are done or the section is in focus, and are gone before the stop ends', t => {
  const { document, controller, clock } = setup(t, { width: 1280, frames: true, layout: true });
  const stops = new Map();
  let previous = null;
  eachFrame(controller, clock, document, ({ name, fresh, now }) => {
    if (fresh) {
      if (previous) assert.ok(previous.gone !== undefined, `${previous.name}: guides still up at the end of the stop`);
      previous = document.querySelector('.agentic-wire-guides') ? { name } : null;
      if (previous) stops.set(name, previous);
    }
    if (!previous || previous.gone !== undefined) return;
    if (!previous.fillGone && !document.querySelector('.agentic-wire-fill')) previous.fillGone = now;
    const guides = document.querySelector('.agentic-wire-guides');
    if (guides?.classList.contains('is-fading') && previous.fading === undefined) previous.fading = now;
    if (!guides) previous.gone = now;
  });
  if (previous) assert.ok(previous.gone !== undefined, `${previous.name}: guides gone at the end`);
  assertNoResidue(document);
  if (!measurable(document)) return;
  assert.ok(stops.size >= 2, `${stops.size} wired sections`);
  for (const [name, stop] of stops) {
    assert.ok(stop.fading !== undefined && stop.gone - stop.fading >= 400 && stop.gone - stop.fading <= 700, `${name}: faded from ${stop.fading}ms, gone ${stop.gone}ms`);
    assert.ok(stop.fading >= stop.fillGone - FRAME, `${name}: guides stay up while the section is painted`);
  }
});

test('cancelling, skipping or reduced motion mid-section removes every overlay and reveals the content', t => {
  for (const action of ['wheel', 'skip', 'reduced', 'wheel-wireframe']) {
    let listener;
    const query = { matches: false, addEventListener: (_, callback) => { listener = callback; }, removeEventListener() {} };
    const { document, window, controller, clock } = setup(t, { width: 1280, frames: true, layout: true, media: () => query });
    // Mid-paint, or (wireframe) while the black fill is still untouched.
    const ready = () => {
      const fill = document.querySelector('.agentic-wire-fill');
      if (!fill || !document.querySelector('.agentic-skeleton')) return false;
      return action === 'wheel-wireframe' ? fillClip(fill) === null && controller.tour.index > 0 : fillClip(fill) > 20;
    };
    while (controller.touring && clock.now() < 90000 && !ready()) clock.step(FRAME);
    if (!measurable(document)) { controller.skip(); continue; }
    assert.ok(ready(), `${action}: reached a section wireframe`);
    const section = sectionOf(document, controller.tour.name);
    assert.ok(section.querySelector('[data-build-state="pending"]'), `${action}: content still waiting`);
    if (action.startsWith('wheel')) document.querySelector('#main').dispatchEvent(new window.WheelEvent('wheel', { bubbles: true, deltaY: 120 }));
    else if (action === 'skip') document.querySelector('[data-agentic-skip]').click();
    else { query.matches = true; listener(); }
    assert.equal(controller.touring, false, action);
    assert.equal(document.querySelector('.agentic-wire, .agentic-wire-fill, .agentic-skeleton, .agentic-wire-guides, .agentic-wire-edge'), null, `${action}: no overlay left`);
    assertNoResidue(document, { dock: action === 'reduced' ? 'none' : 'pill' });
    clock.step(2000);
    assert.equal(document.querySelector('.agentic-wire, .agentic-skeleton'), null, `${action}: nothing comes back`);
  }
});

test('an unpainted fill never stays on screen past the grace plus the paint time, even when the paint agent is late', t => {
  for (const late of [false, true]) {
    const { document, window, controller, clock } = setup(t, { width: 1280, frames: true, layout: true });
    let entered = null;
    let worst = 0;
    let worstName = '';
    let name = '';
    let forced = null;
    eachFrame(controller, clock, document, frame => {
      if (frame.fresh) {
        entered = null;
        name = frame.name;
        // A layout shift pulls the next wired section into view at once,
        // while its paint agent is still on the way.
        if (late && !forced && frame.index > 1 && document.querySelector('.agentic-wire-fill') && frame.section.getBoundingClientRect().top > window.innerHeight + 200) {
          const top = frame.section.getBoundingClientRect().top;
          frame.section.style.marginTop = `${-Math.ceil(top - window.innerHeight + 240)}px`;
          window.dispatchEvent(new window.Event('resize'));
          forced = { name };
        }
      }
      if (entered === null && frame.section.getBoundingClientRect().top < window.innerHeight) entered = frame.now;
      if (entered === null) return;
      const fill = document.querySelector('.agentic-wire-fill');
      if (forced?.name === name && forced.gone === undefined) {
        if (fill && fillClip(fill) !== null && forced.painted === undefined) forced.painted = frame.now - entered;
        if (!fill) forced.gone = frame.now - entered;
      }
      if (fillOnScreen(document, window) && frame.now - entered > worst) { worst = frame.now - entered; worstName = name; }
    });
    assertNoResidue(document);
    if (!measurable(document)) return;
    assert.ok(worst <= GRACE + PAINT_MAX + FRAME, `${late ? 'late painter: ' : ''}${worstName} fill on screen ${worst}ms after it entered`);
    if (!late) continue;
    assert.ok(forced && forced.gone !== undefined, 'a wired section was brought into view early');
    // Unless the sweep had already begun within the grace, the fill goes at once.
    assert.ok(!(forced.painted <= GRACE + FRAME), `${forced.name}: the paint agent was not there in time`);
    assert.ok(forced.gone <= GRACE + 2 * FRAME, `${forced.name}: fill wiped ${forced.gone}ms after it came into view`);
  }
});

// ---- rescues: nothing with words in it just appears ------------------------
// A text element (one with its own text) and the build under way on it, if any.
const SKIP_TEXT = '[hidden], [aria-hidden="true"], .project-stories, dialog, .agentic-stage, .agentic-dock, [data-agentic-replay], #home, .site-header';
const ownText = element => [...element.childNodes].some(node => node.nodeType === 3 && node.nodeValue.trim());
function textBlocks(document) {
  const all = [];
  document.querySelectorAll('main > section[id]:not(#home), footer[id]').forEach(root => root.querySelectorAll('*').forEach(element => {
    if (ownText(element) && !element.closest(SKIP_TEXT)) all.push(element);
  }));
  const set = new Set(all);
  // Top-level blocks only: a link inside a line counts with its line.
  return all.filter(element => { for (let node = element.parentElement; node; node = node.parentElement) if (set.has(node)) return false; return true; });
}
// Under a running build: typed or wiped, or placed by an agent (not the
// safety's quick 360 ms fade, which carries no stagger).
function underBuild(element) {
  const active = element.closest('[data-build-state="typing"], [data-build-state="placing"]');
  if (!active) return false;
  if (active.dataset.buildState === 'typing') return true;
  const fade = active.style.getPropertyValue('--agentic-d').trim();
  return Boolean(active.style.transitionDelay) || (fade !== '360ms' && fade !== '180ms');
}
// Steps a whole tour and reports every text block the visitor first saw
// without an agent building it: [selector, stop, ms].
function unbuiltReveals(t, width) {
  const { document, window, controller, clock } = setup(t, { width, frames: true, layout: true });
  const blocks = textBlocks(document);
  const state = new Map(blocks.map(element => [element, { done: false }]));
  const unbuilt = [];
  let rendered = 0;
  while (controller.touring && clock.now() < 120000) {
    clock.step(16);
    if (!controller.touring) break;
    if (document.querySelector('.agentic-veil')) continue;
    for (const element of blocks) {
      const entry = state.get(element);
      if (entry.done) continue;
      const rect = element.getBoundingClientRect();
      if (!(rect.width > 0 && rect.height > 0 && rect.top < window.innerHeight && rect.bottom > 0)) continue;
      if (element.closest('[data-build-state="pending"]') || coveredByFill(document, rect)) continue;
      let transparent = false;
      for (let node = element; node && node !== document.body; node = node.parentElement) {
        if (node.classList.contains('agentic-target')) continue;
        const style = window.getComputedStyle(node);
        if (style.opacity === '0' || style.visibility === 'hidden') { transparent = true; break; }
      }
      if (transparent) continue;
      entry.done = true;
      rendered++;
      if (!underBuild(element)) unbuilt.push(`${element.closest('section[id], footer[id]').id} ${element.tagName.toLowerCase()}.${[...element.classList].filter(name => !name.startsWith('agentic')).join('.')} "${element.textContent.trim().slice(0, 24)}" (${controller.tour.name}, ${clock.now()}ms)`);
    }
  }
  assertNoResidue(document);
  return { document, unbuilt, rendered };
}

test('Education entries and Experience role lines are typed by agents, never shown instantly', t => {
  const { document, window, controller, clock } = setup(t, { width: 1280, frames: true, layout: true });
  const selectors = ['.education-list .school', '.education-list .degree', '.education-list .school-meta', '.xp-title', '.xp-org', '.xp-when'];
  const lines = selectors.flatMap(selector => [...document.querySelectorAll(selector)]);
  assert.equal(lines.length, 15, 'two schools (name, degree, dates) and three chapters (title, organisation, dates)');
  const built = new Set();
  const early = [];
  const labels = new Set();
  eachFrame(controller, clock, document, ({ name, now }) => {
    document.querySelectorAll('.agentic-cursor.is-working .agentic-role').forEach(label => labels.add(label.textContent));
    for (const element of lines) {
      if (built.has(element)) continue;
      if (element.dataset.buildState === 'typing') { built.add(element); continue; }
      const rect = element.getBoundingClientRect();
      const inView = rect.height > 0 && rect.top < window.innerHeight && rect.bottom > 0;
      if (inView && !element.closest('[data-build-state="pending"]') && !coveredByFill(document, rect)) early.push(`${element.className || element.tagName} "${element.textContent.trim().slice(0, 20)}" (${name}, ${now}ms)`);
    }
  });
  assertNoResidue(document);
  if (!measurable(document)) return;
  assert.deepEqual(early.slice(0, 4), [], `${early.length} lines were visible before an agent wrote them`);
  assert.deepEqual(lines.filter(element => !built.has(element)).map(element => element.textContent.trim().slice(0, 20)), [], 'every line was typed or written');
  // Labels name what is being written (presentation only).
  assert.ok([...labels].some(text => /^[a-z]+(·\d)? · writing 'Georgia Institute/.test(text)), [...labels].filter(text => /Georgia|Kennesaw/.test(text)).join(' | ') || 'no school label');
  assert.ok([...labels].some(text => /^[a-z]+(·\d)? · (typing|setting) 'Machine Learning Engineer'$/.test(text)), 'role titles are typed');
});

test('on desktop at most two text blocks per tour appear without an agent building them', t => {
  const { document, unbuilt, rendered } = unbuiltReveals(t, 1280);
  if (!measurable(document)) return;
  assert.ok(rendered > 150, `${rendered} text blocks came into view`);
  assert.ok(unbuilt.length <= 2, `${unbuilt.length} unbuilt: ${unbuilt.join(' | ')}`);
});

test('an item whose agent is late is rescued by an idle margin agent, which flies to it within the cap', t => {
  const { document, window, controller, clock } = setup(t, { width: 1280, frames: true, layout: true });
  // A line is pulled into view early at up to four stops. Whether an idle
  // agent can take it depends on its next planned move, so at least one
  // must be rescued; any other is shown at once (and counted as such).
  const trials = [];
  let forced = null;
  let stopAt = 0;
  eachFrame(controller, clock, document, ({ index, now, fresh }) => {
    if (fresh) stopAt = now;
    if (!forced) {
      // Well into a stop (not while its agents are still setting off), with
      // agents idling in the margins, no section fill up and no copy-paste
      // under way (its editors idle only until the paste lands): a layout
      // shift pulls a far-off line into view, long before its agent.
      if (trials.length >= 4 || trials.some(trial => trial.index === index)) return;
      if (index < 2 || now - stopAt < 1600 || document.querySelector('.agentic-wire-fill, .agentic-frame.is-ghost:not(.is-out), .agentic-frame.is-copy:not(.is-out), .agentic-hole:not(.is-out)')) return;
      const idle = [...document.querySelectorAll('.agentic-cursor.is-idle.is-in:not(.is-docked)')];
      if (idle.length < 3) return;
      const vh = window.innerHeight;
      // Not inside a clipping box: moved out of it, the line would still be unseen.
      const clipped = element => { for (let node = element.parentElement; node && node !== document.body; node = node.parentElement) { const style = window.getComputedStyle(node); if (style.overflowX !== 'visible' || style.overflowY !== 'visible') return true; } return false; };
      const target = [...document.querySelectorAll('[data-agentic-job="type"][data-build-state="pending"], [data-agentic-job="wipe"][data-build-state="pending"]')]
        // A short line, so a margin agent between jobs has time to write it.
        .find(element => { const r = element.getBoundingClientRect(); return r.top > vh + 300 && r.height > 0 && r.height < 100 && element.textContent.trim().length <= 28 && !clipped(element); });
      if (!target) return;
      const r = target.getBoundingClientRect();
      target.style.position = 'relative';
      target.style.top = `${Math.round(vh * 0.55 - r.top)}px`;
      window.dispatchEvent(new window.Event('resize'));
      forced = { index, target, at: now, idle: new Map(idle.map(cursor => [cursor, cursorPoint(cursor)])), ...controller.scroll };
      trials.push(forced);
      return;
    }
    const rect = forced.target.getBoundingClientRect();
    if (forced.seen === undefined && rect.top < window.innerHeight && rect.bottom > 0) forced.seen = now;
    const state = forced.target.dataset.buildState;
    if (state === 'pending') return;
    forced.begun = now;
    forced.state = state;
    forced.after = controller.scroll;
    // The working cursor at the line's start is the one that built it.
    const anchor = { x: rect.left, y: rect.bottom };
    const working = [...document.querySelectorAll('.agentic-cursor.is-working')].map(cursor => ({ cursor, p: cursorPoint(cursor) })).filter(entry => entry.p);
    const nearest = working.sort((a, b) => Math.hypot(a.p.x - anchor.x, a.p.y - anchor.y) - Math.hypot(b.p.x - anchor.x, b.p.y - anchor.y))[0];
    forced.cursor = nearest?.cursor;
    forced.distance = nearest ? Math.hypot(nearest.p.x - anchor.x, nearest.p.y - anchor.y) : Infinity;
    forced = null;
  });
  assertNoResidue(document);
  if (!measurable(document)) return;
  assert.ok(trials.length, 'a line was pulled into view early');
  const rescued = trials.filter(trial => trial.state === 'typing');
  assert.ok(rescued.length >= 1, `typed by an agent, not shown at once (${trials.map(trial => `${trial.index}:${trial.state}`).join(', ')})`);
  for (const trial of trials) {
    assert.ok(trial.begun !== undefined && trial.seen !== undefined, 'the line was built');
    assert.ok(trial.begun - trial.seen <= RESCUE.cap + 16, `hidden on screen for ${trial.begun - trial.seen}ms`);
    if (trial.state !== 'typing') { assert.ok(trial.after.instant > trial.instant, 'shown at once only when nobody was free, and counted'); continue; }
    assert.ok(trial.after.rescued > trial.rescued, 'counted as a rescue');
    assert.ok(trial.cursor && trial.distance < 40, `a cursor is at the line (${trial.distance.toFixed(0)}px away)`);
    // An idle margin agent if one is free long enough; otherwise one called out of the dock.
    if (!trial.idle.has(trial.cursor)) continue;
    const from = trial.idle.get(trial.cursor);
    const [left, right] = contentColumn(document, 1280);
    assert.ok(from.x + 2 < left || from.x + 2 > right, 'it came from the side margin');
  }
  assert.ok(rescued.some(trial => trial.idle.has(trial.cursor)), `an idle margin agent took at least one (${rescued.map(trial => trial.cursor?.textContent).join(', ')})`);
});

test('the visible-target rule: hidden, transparent, zero-size and clipped items get no agent', t => {
  const { document, window, controller, clock } = setup(t, { width: 1280, frames: true, layout: true });
  // Contact is planned last, so its items can be changed before its stop starts.
  const intro = document.querySelector('.contact-intro');
  intro.hidden = true;
  const [faint, flat, plain] = document.querySelectorAll('.contact-links li');
  faint.style.opacity = '0.02';
  flat.style.cssText = 'display: block; width: 0; height: 0; overflow: hidden; padding: 0; margin: 0; border: 0';
  // The footer row clipped down to a pixel: its spans are there but cannot be seen.
  const footer = document.querySelector('.footer-bottom');
  footer.style.cssText = 'overflow: hidden; height: 1px; padding: 0';
  const spans = [...footer.querySelectorAll(':scope > span')];
  const hiddenText = [...document.querySelectorAll('.explorer-caption *, .project-stories *')];
  const touched = new Set();
  const note = element => { if (element) touched.add(element); };
  while (controller.touring && clock.now() < 120000) {
    clock.step(16);
    document.querySelectorAll('[data-agentic-job], [data-build-state]').forEach(note);
    document.querySelectorAll('.agentic-cursor.is-working').forEach(cursor => note(cursor.agenticTarget));
  }
  const reached = element => touched.has(element) || [...touched].some(other => element.contains(other));
  assert.equal(reached(intro), false, 'nothing inside [hidden]');
  assert.equal(reached(faint), false, 'nothing transparent');
  assert.equal(hiddenText.filter(reached).length, 0, 'not the hidden caption or the case-study text');
  if (measurable(document)) {
    assert.equal(reached(flat), false, 'nothing without a box');
    assert.deepEqual(spans.filter(reached).map(span => span.textContent), [], 'nothing clipped away');
    assert.ok(reached(plain), 'the visible link still gets its agent');
  }
  assertNoResidue(document);
  for (const element of [intro, faint, flat, plain, ...spans]) assert.equal(element.closest('[data-build-state]'), null, 'nothing left hidden');
});

test('a working label is only shown while its work is on screen', t => {
  const { document, window, controller, clock } = setup(t, { width: 1280, frames: true, layout: true });
  let shown = 0;
  const phantoms = [];
  while (controller.touring && clock.now() < 120000) {
    clock.step(16);
    if (!measurable(document)) continue;
    for (const cursor of document.querySelectorAll('.agentic-cursor.is-working:not(.is-away):not(.is-docked):not(.is-orchestrator)')) {
      const target = cursor.agenticTarget;
      if (!target) continue;
      shown++;
      const r = target.getBoundingClientRect();
      const onScreen = r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < window.innerHeight && r.right > 0 && r.left < window.innerWidth;
      const hidden = Boolean(target.closest('[hidden]')) || window.getComputedStyle(target).visibility === 'hidden';
      if (!onScreen || hidden) phantoms.push(`${cursor.textContent} @${clock.now()}ms`);
    }
  }
  assertNoResidue(document);
  if (!measurable(document)) return;
  assert.ok(shown > 500, `${shown} label frames sampled`);
  // A frame of lag while the page moves is tolerated, nothing more.
  assert.ok(phantoms.length <= shown * 0.002, `${phantoms.length} labels over nothing: ${phantoms.slice(0, 6).join(' | ')}`);
});

test('typos are rare, deterministic and only in plain lowercase words', () => {
  const sentence = 'Email is the fastest way to reach me.';
  assert.deepEqual(typoFor(sentence), typoFor(sentence));
  for (const text of ['Georgia Institute of Technology', 'SEP 2021 – MAY 2023', 'Lucenatrujillo.cesar@gmail.com', 'Trace and evaluate LLM systems', 'Run MLOps and model deployment', 'ADP · ROSELAND, NJ', '18+ hands-on workshops']) {
    assert.equal(typoFor(text), null, text);
  }
  assert.equal(typoFor('the quick brown fox jumps over the lazy dog', { transform: 'uppercase' }), null);
  const words = 'gentle river carries small stones toward quiet meadows where tired travellers rest under ancient willow branches'.split(' ');
  let typed = 0;
  let typos = 0;
  for (let i = 0; i < 400; i++) {
    const text = Array.from({ length: 3 + (i % 5) }, (_, k) => words[(i * 7 + k * 3 + Math.floor(i / 16)) % words.length]).join(' ');
    typed += text.split(' ').length;
    const typo = typoFor(text);
    if (!typo) continue;
    typos++;
    // Inside a word of four letters or more, never its first letter, and a different key.
    const word = /[a-z]+$/.exec(text.slice(0, typo.at))?.[0] || '';
    const whole = word + (/^[a-z]+/.exec(text.slice(typo.at))?.[0] || '');
    assert.ok(word.length >= 1 && whole.length >= 4, `${text} @${typo.at}`);
    assert.notEqual(typo.ch, text[typo.at]);
    assert.match(typo.ch, /^[a-z]$/);
  }
  const rate = typos / typed;
  assert.ok(rate > 1 / 14 && rate < 1 / 5, `about one word in eight: ${typos} in ${typed}`);
});

test('a travelling Experience stage holds on each chapter while it is pasted and written', t => {
  // Wide screen with motion allowed: experience.js pins the stage and travels it.
  const media = query => ({ matches: !/motion:\s*reduce\b/.test(query), addEventListener() {}, removeEventListener() {} });
  const { document, window, controller, clock } = setup(t, { width: 1280, frames: true, layout: true, media });
  // The browser harness lays the page out at 1280 x 800 (the stage needs the
  // height). Frames are stepped by hand here, so the stage is moved by
  // experience.js's own script driver, told about each scroll.
  if (window.frameElement) window.frameElement.style.height = '800px';
  window.CSS = { supports: () => false };
  // Stepped frames do not advance CSS animations: chapters arrive without their slide-in.
  const still = document.createElement('style');
  still.textContent = '.xp-chapter { animation: none !important; }';
  document.head.append(still);
  const xp = initExperience(document, window);
  const section = document.querySelector('#experience');
  if (!xp || section.dataset.xp !== 'travel' || !measurable(document)) { controller.skip(); return; }
  const travel = section.querySelector('.xp-travel');
  const top = travel.getBoundingClientRect().top + window.scrollY;
  const distance = parseFloat(section.style.getPropertyValue('--xp-distance'));
  const chapters = [...section.querySelectorAll('.xp-chapter')];
  const targets = chapters.map(chapter => top + parseFloat(chapter.style.getPropertyValue('--xp-at')) * distance);
  const held = chapters.map(() => 0);
  const xpStops = new Set();
  let ghosts = 0;
  let holes = 0;
  const keys = new Set();
  const offStage = [];
  const typed = new Set();
  const progress = new Set();
  let last = clock.now();
  while (controller.touring && clock.now() < 120000) {
    window.dispatchEvent(new window.Event('scroll'));
    clock.step(16);
    if (!controller.touring) break;
    const dt = clock.now() - last;
    last = clock.now();
    if (controller.tour.name !== 'Experience') continue;
    xpStops.add(controller.tour.index);
    progress.add(dockOf(document).querySelector('.agentic-dock-progress').textContent);
    targets.forEach((y, k) => { if (Math.abs(window.scrollY - y) < 120) held[k] += dt; });
    ghosts = Math.max(ghosts, document.querySelectorAll('.agentic-frame.is-ghost').length);
    holes = Math.max(holes, document.querySelectorAll('.agentic-hole').length);
    document.querySelectorAll('.agentic-tag.is-on').forEach(tag => keys.add(tag.textContent));
    for (const chapter of chapters.slice(1)) {
      for (const line of chapter.querySelectorAll('.xp-title, .xp-org, .xp-when, .xp-points > li')) {
        if (typed.has(line) || line.dataset.buildState !== 'typing') continue;
        typed.add(line);
        const r = line.getBoundingClientRect();
        if (!(r.right > 0 && r.left < window.innerWidth)) offStage.push(line.textContent.trim().slice(0, 24));
      }
    }
  }
  assertNoResidue(document);
  assert.equal(xpStops.size, 3, 'one stop per chapter');
  assert.deepEqual([...progress], [`${stopNames(document).indexOf('Experience') + 1} / ${stopNames(document).length}`], 'one plan step in the dock');
  // Pasted chapters are quick (Experience is ~9 s in all); the last one is
  // written as it slides in and held briefly before Projects.
  assert.ok(held.every(ms => ms >= 700), `the stage holds on each chapter: ${held.map(Math.round)} ms`);
  assert.ok(ghosts >= 1 && keys.has('⌘C') && keys.has('⌘V'), `copied and pasted (${[...keys]})`);
  assert.ok(holes >= 3, 'the pasted copy leaves placeholders');
  assert.ok(chapters.slice(1).every(chapter => typed.has(chapter.querySelector('.xp-title'))), 'chapters 2 and 3 are typed by agents');
  assert.deepEqual(offStage, [], 'only what is on the stage is written');
});

// ---- Nov 10 review fixes: pacing, pins, residue, pill ----------------------
// Every label or badge a visitor can see right now: working cursor labels,
// guide labels, size and coordinate chips, key tags and QA pins.
function badges(document, window) {
  const shown = element => window.getComputedStyle(element).display !== 'none' && parseFloat(window.getComputedStyle(element).opacity) > 0.05;
  const labels = [...document.querySelectorAll('.agentic-cursor.is-working.is-in:not(.is-away):not(.is-hush):not(.is-docked) .agentic-role')].map(label => label.textContent);
  const chips = [...document.querySelectorAll('.agentic-frame:not(.is-out):not(.no-size) .agentic-size')].filter(chip => chip.textContent && (chip.closest('.is-drag.is-set, .has-size.is-set, .is-coord')));
  return {
    labels,
    count: labels.length + document.querySelectorAll('.agentic-guide-label.is-on').length + chips.length
      + document.querySelectorAll('.agentic-tag.is-on:not(.is-out), .agentic-pin.is-on:not(.is-out)').length,
    chips: chips.map(chip => chip.textContent).filter(text => !/^x \d+ · y \d+$/.test(text)),
  };
}

test('the hero keeps at most six labels on screen, no size chips or repeated labels, and the headline reads by ~2.5 s', t => {
  const { document, window, controller, clock } = setup(t, { width: 1280, frames: true, layout: true });
  let most = 0;
  let mostAt = 0;
  const repeats = [];
  const chips = new Set();
  const headline = [...document.querySelectorAll('.hero-line > span, .hero-fade')];
  let readAt = 0;
  // Fully typed: no longer pending, and the write clip is open to the end.
  const typed = element => {
    if (element.dataset.buildState === 'pending') return false;
    const clip = /inset\([^ ]+ ([\d.]+)px/.exec(element.style.clipPath || '');
    return !clip || +clip[1] <= 1.5;
  };
  while (controller.touring && controller.tour.index === 0) {
    clock.step(16);
    const now = clock.now();
    if (now <= 3000) {
      const seen = badges(document, window);
      if (seen.count > most) { most = seen.count; mostAt = now; }
      const twice = seen.labels.filter((text, index) => seen.labels.indexOf(text) !== index);
      if (twice.length) repeats.push(`${twice[0]} @${now}ms`);
      seen.chips.forEach(text => chips.add(text));
    }
    if (!readAt && headline.every(typed)) readAt = now;
  }
  controller.skip();
  assertNoResidue(document);
  assert.ok(most <= 6, `${most} labels and badges at once (${mostAt}ms)`);
  assert.deepEqual(repeats.slice(0, 3), [], 'no two agents show the same label at once');
  assert.deepEqual([...chips], [], 'no measurement chips over the hero');
  assert.ok(readAt > 0 && readAt <= 2800, `the headline was fully typed at ${readAt}ms`);
});

// The first Experience `sub` stop (a chapter pasted on the travelling stage).
const subStopIndex = document => TOUR_STOPS.filter(stop => document.querySelector(stop.sel)).findIndex(stop => stop.sub);
function travelling(t, extra = {}) {
  const media = query => ({ matches: !/motion:\s*reduce\b/.test(query), addEventListener() {}, removeEventListener() {} });
  const env = setup(t, { width: 1280, frames: true, layout: true, media, ...extra });
  const { window, document } = env;
  if (window.frameElement) window.frameElement.style.height = '800px';
  window.CSS = { supports: () => false };
  const still = document.createElement('style');
  still.textContent = '.xp-chapter { animation: none !important; } .agentic-dock { transition: none !important; }';
  document.head.append(still);
  env.xp = initExperience(document, window);
  return env;
}

test('Skip or Escape during the Capabilities paste or an Experience chapter paste leaves nothing behind', t => {
  for (const action of ['skip', 'escape']) {
    // Capabilities: while a pasted card's ghost is on its way.
    const cap = setup(t, { width: 1280, frames: true, layout: true });
    let reached = false;
    while (cap.controller.touring && cap.clock.now() < 90000) {
      cap.clock.step(16);
      if (cap.controller.tour?.name === 'Capabilities' && cap.document.querySelector('.agentic-frame.is-ghost:not(.is-out)')) { reached = true; break; }
      if (cap.controller.tour && cap.controller.tour.index > 3) break;
    }
    if (measurable(cap.document)) assert.ok(reached, `${action}: reached the Capabilities paste`);
    if (action === 'skip') cap.document.querySelector('[data-agentic-skip]').click();
    else cap.document.dispatchEvent(new cap.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    assert.equal(cap.controller.touring, false);
    assertNoResidue(cap.document);
    cap.clock.step(2000);
    assertNoResidue(cap.document);
    // Experience: a chapter `sub` stop, with its placeholders down.
    const xp = travelling(t);
    const sub = subStopIndex(xp.document);
    let inSub = false;
    while (xp.controller.touring && xp.clock.now() < 90000) {
      xp.window.dispatchEvent(new xp.window.Event('scroll'));
      xp.clock.step(16);
      if (xp.controller.tour?.index === sub && (xp.document.querySelector('.agentic-hole:not(.is-out)') || xp.document.querySelector('.agentic-frame.is-ghost'))) { inSub = true; break; }
      if (xp.controller.tour && xp.controller.tour.index > sub) break;
    }
    if (xp.xp && xp.document.querySelector('#experience').dataset.xp === 'travel' && measurable(xp.document)) assert.ok(inSub, `${action}: reached a chapter paste`);
    if (action === 'skip') xp.document.querySelector('[data-agentic-skip]').click();
    else xp.document.dispatchEvent(new xp.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    assert.equal(xp.controller.touring, false);
    assertNoResidue(xp.document);
    assert.equal(xp.document.querySelector('#experience [data-build-state]'), null, `${action}: every chapter is visible`);
    assert.equal(dockOf(xp.document).querySelector('.agentic-dock-summary').textContent, 'Tour skipped ·', `${action}: the pill says the tour was skipped`);
  }
});

test('every QA pin follows its item and is resolved or gone by the end of its stop', t => {
  const { document, window, controller, clock } = setup(t, { width: 1280, frames: true, layout: true });
  let pins = 0;
  let previous = [];
  let index = 0;
  const left = [];
  const frozen = [];
  while (controller.touring && clock.now() < 90000) {
    clock.step(16);
    if (!controller.touring) break;
    if (controller.tour.index !== index) {
      // The frame before the stop changed: nothing unresolved was still up.
      left.push(...previous.filter(pin => !pin.resolved && !pin.out).map(pin => `${pin.note} (stop ${index})`));
      index = controller.tour.index;
    }
    const nodes = [...document.querySelectorAll('.agentic-pin')];
    pins = Math.max(pins, nodes.length);
    previous = nodes.map(node => ({ note: node.textContent, resolved: node.classList.contains('is-resolved'), out: node.classList.contains('is-out') }));
    if (!measurable(document)) continue;
    // A pin that is up sits by its item while the page moves (a frame of lag allowed).
    for (const node of nodes) {
      if (!node.classList.contains('is-on') || node.classList.contains('is-out')) continue;
      const item = /contrast/.test(node.textContent) ? document.querySelector('.explorer-index') : document.querySelector('.capability-list');
      const r = item.getBoundingClientRect();
      const y = translateOf(node)?.y ?? NaN;
      if (r.bottom > 120 && r.top < window.innerHeight - 120 && !(y >= r.top - 60 && y <= r.bottom + 20)) frozen.push(`${node.textContent} at y ${Math.round(y)}, item ${Math.round(r.top)}–${Math.round(r.bottom)} @${clock.now()}ms`);
    }
  }
  assertNoResidue(document);
  assert.deepEqual(left, [], 'pins left unresolved when their stop ended');
  if (!measurable(document)) return;
  assert.ok(pins >= 1, 'QA left a pin');
  assert.deepEqual(frozen.slice(0, 3), [], 'pins stay on their item');
});

test('Capabilities placement frames step aside about 750 ms after each card lands', t => {
  const { document, controller, clock } = setup(t, { width: 1280, frames: true, layout: true });
  const born = new Map();
  const lives = [];
  while (controller.touring && clock.now() < 90000) {
    clock.step(16);
    if (!controller.touring) break;
    if (controller.tour.name !== 'Capabilities') { if (lives.length) break; continue; }
    // Tinted placement frames (a place or reveal job): solid, with a size chip.
    for (const frame of document.querySelectorAll('.agentic-frame.has-size:not(.is-review):not(.is-text)')) {
      if (!born.has(frame)) born.set(frame, clock.now());
      if (frame.classList.contains('is-out') && !frame.counted) { frame.counted = true; lives.push(clock.now() - born.get(frame)); }
    }
  }
  controller.skip();
  assert.ok(lives.length >= 3, `${lives.length} placement frames`);
  // frameMs 750 at this stop's pace (0.95-1.15x), within a frame either way;
  // a frame whose job ended sooner goes with its job.
  assert.ok(lives.every(ms => ms <= 750 * 1.05 + 32), `frames up for ${lives.join(', ')} ms`);
  assert.ok(lives.filter(ms => ms >= 750 * 0.95 - 32).length >= 3, `most last about 750 ms: ${lives.join(', ')}`);
});

test('handoff lines are short, on screen and brief', t => {
  const { document, window, controller, clock } = setup(t, { width: 1280, frames: true, layout: true });
  const seen = new Map();
  const bad = [];
  while (controller.touring && clock.now() < 90000) {
    clock.step(16);
    for (const line of document.querySelectorAll('.agentic-dispatch.is-handoff')) {
      if (seen.has(line)) continue;
      seen.set(line, clock.now());
      const w = parseFloat(line.style.width);
      const from = translateOf(line);
      const angle = parseFloat(line.style.rotate) || 0;
      const to = { x: from.x + Math.cos(angle) * w, y: from.y + Math.sin(angle) * w };
      const inside = p => p.x >= -1 && p.y >= -1 && p.x <= window.innerWidth + 1 && p.y <= window.innerHeight + 1;
      if (w > window.innerWidth * 0.45 + 1) bad.push(`${Math.round(w)}px long`);
      if (!inside(from) || !inside(to)) bad.push('off screen');
    }
    for (const [line, at] of seen) {
      if (line.isConnected || line.gone) continue;
      line.gone = true;
      if (clock.now() - at > 500 + 32) bad.push(`up ${clock.now() - at}ms`);
    }
  }
  assertNoResidue(document);
  assert.deepEqual(bad.slice(0, 4), [], `${bad.length} handoff lines out of bounds`);
});

test('on a short screen the Introduction stop still ends with its copy and pills in view', t => {
  const { document, window, controller, clock } = setup(t, { width: 1280, height: 600, frames: true, layout: true });
  let last = null;
  while (controller.touring && clock.now() < 60000) {
    clock.step(16);
    if (!controller.touring) break;
    if (controller.tour.name === 'Introduction') {
      const footer = document.querySelector('.cinematic-footer').getBoundingClientRect();
      const pills = document.querySelector('.scene-actions').getBoundingClientRect();
      last = { footer, pills, vh: window.innerHeight };
    } else if (last) break;
  }
  controller.skip();
  if (!measurable(document) || !last || last.vh > 640) return;
  assert.ok(last.pills.bottom <= last.vh && last.pills.top >= 0, `scene pills at ${Math.round(last.pills.top)}–${Math.round(last.pills.bottom)} of ${last.vh}`);
  assert.ok(last.footer.bottom <= last.vh + 1, `copy ends at ${Math.round(last.footer.bottom)} of ${last.vh}`);
});

test('a single-column Capabilities list (700 px) places its cards directly, without copy and paste', t => {
  const { document, window, controller, clock } = setup(t, { width: 700, frames: true, layout: true });
  const list = document.querySelector('.capability-list');
  const columns = window.getComputedStyle(list).gridTemplateColumns.split(' ').filter(Boolean).length;
  const kinds = new Set();
  let placed = 0;
  while (controller.touring && clock.now() < 90000) {
    clock.step(16);
    if (!controller.touring) break;
    if (controller.tour.name !== 'Capabilities') { if (kinds.size) break; continue; }
    document.querySelectorAll('#capabilities [data-agentic-job]').forEach(element => kinds.add(element.dataset.agenticJob));
    placed = Math.max(placed, document.querySelectorAll('#capabilities .capability[data-agentic-job="place"]').length);
    document.querySelectorAll('.agentic-tag').forEach(tag => kinds.add(`tag ${tag.textContent}`));
  }
  controller.skip();
  if (!measurable(document) || columns !== 1) return;
  assert.ok(!kinds.has('copy') && !kinds.has('paste') && !kinds.has('tag ⌘C') && !kinds.has('tag ⌘V'), `no copy or paste in one column: ${[...kinds]}`);
  assert.ok(placed >= 3, `${placed} cards placed one by one`);
});

test('the Projects stop opens the first project (a real click) without ending the tour, and leaves a normal state', t => {
  const { document, window, controller, clock } = setup(t, { width: 1280, height: 800, frames: true, layout: true });
  const explorer = initExplorer(document, window);
  const stage = document.querySelector('.explorer-stage');
  let stacked = 0;
  let chip = false;
  let title = '';
  while (controller.touring && clock.now() < 90000) {
    clock.step(16);
    if (!controller.touring) break;
    if (controller.tour.name !== 'Projects') { if (stacked) break; continue; }
    if (!stacked && stage?.dataset.explorerMode === 'stack') {
      stacked = clock.now();
      title = document.querySelector('.explorer-caption-title')?.textContent || '';
      chip = Boolean(document.querySelector('.explorer-item.is-active .explorer-card-open'));
    }
  }
  if (!explorer || !measurable(document)) { controller.skip(); return; }
  assert.ok(stacked > 0, 'the explorer turned into the drum');
  assert.equal(controller.touring, true, 'the click did not end the tour');
  assert.equal(title, 'Multi-Agent Workflow');
  assert.ok(chip, 'the active cover carries its Case study chip');
  // The selection is the explorer's first project: where a visitor starts.
  assert.equal(explorer.state.index, 0);
  controller.skip();
  assertNoResidue(document);
});

test('the dock rises above the Experience chapter bar instead of covering it', t => {
  const { document, window, controller, clock } = travelling(t);
  const controls = () => [...document.querySelectorAll('.xp-index-button, .xp-step')];
  const overlaps = [];
  let checked = 0;
  while (controller.touring && clock.now() < 90000) {
    window.dispatchEvent(new window.Event('scroll'));
    clock.step(16);
    if (!controller.touring) break;
    if (controller.tour.name !== 'Experience') continue;
    const dock = dockOf(document).getBoundingClientRect();
    const near = controls().map(element => element.getBoundingClientRect())
      .filter(r => r.height > 0 && r.top < window.innerHeight && r.bottom > 0 && r.right >= dock.left && r.left <= dock.right);
    if (!near.length) continue;
    checked++;
    const hit = near.find(r => r.top < dock.bottom && r.bottom > dock.top);
    if (hit) overlaps.push(`${Math.round(dock.top)}–${Math.round(dock.bottom)} over ${Math.round(hit.top)}–${Math.round(hit.bottom)} @${clock.now()}ms`);
  }
  controller.skip();
  if (document.querySelector('#experience').dataset.xp !== 'travel' || !measurable(document)) return;
  assert.ok(checked > 10, `${checked} control samples`);
  // A frame of lag while the bar slides in.
  assert.ok(overlaps.length <= 1, `${overlaps.length} frames with the dock over the chapter bar: ${overlaps.slice(0, 3).join(' | ')}`);
});

test('the pill goes on its own after Skip, even with focus moved onto it, and says the tour was skipped', async t => {
  const { document, controller } = setup(t, { width: 1280, config: { pillDuration: 200 } });
  const skip = document.querySelector('[data-agentic-skip]');
  skip.focus();
  skip.click();
  assert.equal(controller.touring, false);
  const dock = dockOf(document);
  assert.equal(dock.dataset.state, 'pill');
  assert.equal(dock.querySelector('.agentic-dock-summary').textContent, 'Tour skipped ·');
  assert.ok(dock.contains(document.activeElement), 'focus moved to the pill (Replay)');
  assert.ok(await until(() => !dockOf(document), 2000), 'the pill dismissed itself');
});

// ---- Round 10: Open the work (#lab) ----------------------------------------
test('the Lab stop places the three cards, wires each preview once its card is down, then the links, in a short stop', t => {
  const { document, window, controller, clock } = setup(t, { width: 1280, height: 800, frames: true, layout: true });
  // As on the page: the explorer above it is a ring and the project stories are
  // hidden (app.js), so the scroll from Projects is the real one.
  initExplorer(document, window);
  document.body.classList.add('js-enabled');
  const stop = TOUR_STOPS.find(item => item.name === 'Lab');
  assert.equal(stop.sel, '#lab');
  const names = stopNames(document);
  assert.equal(names[names.indexOf('Projects') + 1], 'Lab', 'right after Projects');
  assert.equal(names[names.indexOf('Lab') + 1], 'Skills');
  const labels = new Set();
  const first = new Map();
  let start = null;
  let end = null;
  while (controller.touring && clock.now() < 90000) {
    clock.step(16);
    if (controller.tour?.name !== 'Lab') { if (start !== null && end === null) end = clock.now(); continue; }
    start ??= clock.now();
    document.querySelectorAll('.agentic-cursor.is-working .agentic-role').forEach(label => labels.add(label.textContent));
    document.querySelectorAll('#lab [data-build-state="placing"], #lab [data-build-state="typing"]').forEach(element => { if (!first.has(element)) first.set(element, clock.now()); });
  }
  assertNoResidue(document);
  assert.ok(start !== null && end !== null, 'the tour went through Lab');
  // About 4 s at 1280x800 in Chrome, most of it the scroll down from the explorer.
  assert.ok(end - start <= 5000, `Lab stop took ${end - start}ms`);
  if (!measurable(document)) return;
  const cards = [...document.querySelectorAll('#lab .open-card')];
  cards.forEach((card, index) => {
    const preview = card.querySelector('.work-preview');
    const link = card.querySelector('.open-card-link');
    assert.ok(first.has(card), `card ${index + 1} placed`);
    assert.ok(first.has(preview) && first.get(preview) >= first.get(card), `preview ${index + 1} wired after its card`);
    assert.ok(first.has(link) && first.get(link) >= first.get(card), `link ${index + 1} wired after its card`);
  });
  assert.ok([...labels].some(text => /placing 'Evaluation lab'$/.test(text)), [...labels].join(' | '));
  assert.ok([...labels].some(text => / · wiring preview$/.test(text)), [...labels].join(' | '));
});

test('the Lab stop waits for its gate (the live previews), at most GATE_CAP_MS; the gate is first asked as the tour starts', async t => {
  const labStep = document => `${stopNames(document).indexOf('Lab') + 1} / ${stopNames(document).length}`;
  const progress = document => document.querySelector('.agentic-dock-progress')?.textContent;
  // A gate that settles while the stop waits: Lab starts once it does.
  let asked = 0;
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const held = setup(t, { width: 1280, frames: true, config: { stopGates: { '#lab': () => { asked++; return gate; } } } });
  assert.equal(asked, 1, 'asked as the tour starts, so the previews load early');
  const toLab = ({ controller, clock }) => { while (controller.touring && controller.tour.name !== 'Lab' && clock.now() < 90000) clock.step(16); };
  toLab(held);
  assert.equal(held.controller.tour.name, 'Lab');
  for (let i = 0; i < 30; i++) held.clock.step(16);
  assert.notEqual(progress(held.document), labStep(held.document), 'not started while the gate is open');
  release();
  await new Promise(resolve => setTimeout(resolve, 0));
  held.clock.step(16);
  assert.equal(progress(held.document), labStep(held.document), 'started once it settled');
  while (held.controller.touring && held.clock.now() < 120000) held.clock.step(16);
  assertNoResidue(held.document);
  // A gate that never settles holds the stop for GATE_CAP_MS (real time) only.
  const stuck = setup(t, { width: 1280, frames: true, config: { stopGates: { '#lab': () => new Promise(() => {}) } } });
  toLab(stuck);
  stuck.clock.step(16);
  assert.notEqual(progress(stuck.document), labStep(stuck.document));
  await new Promise(resolve => setTimeout(resolve, GATE_CAP_MS + 100));
  stuck.clock.step(16);
  assert.equal(progress(stuck.document), labStep(stuck.document), 'started after the cap');
  // Skip while it waits: nothing starts later.
  const skipped = setup(t, { width: 1280, frames: true, config: { stopGates: { '#lab': () => new Promise(() => {}) } } });
  toLab(skipped);
  skipped.controller.skip();
  await new Promise(resolve => setTimeout(resolve, GATE_CAP_MS + 100));
  assert.equal(skipped.controller.touring, false);
  assertNoResidue(skipped.document);
});

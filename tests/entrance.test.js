import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import { initAgenticEntrance, shouldPlayEntrance, crewSize, crewTier, TOUR_STOPS } from '../web/entrance.js';

const html = await readFile(new URL('../web/index.html', import.meta.url), 'utf8');
const entranceCSS = await readFile(new URL('../web/entrance.css', import.meta.url), 'utf8');
const storageKey = 'cesar:portfolio:agentic-intro:v1';
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

function setup(t, { seen = false, reduced = false, hash = '', storageBlocked = false, observeSections = false, width, frames = false, media, navigationType } = {}) {
  const { window } = new JSDOM(html, { url: `https://portfolio.test/${hash}` });
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
  if (storageBlocked) Object.defineProperty(window, 'localStorage', { get() { throw new Error('Storage denied'); } });
  const clock = frames ? manualFrames(window) : null;
  // Manual frames use the real production timing; real frames use tiny durations.
  const config = clock ? { now: clock.now, pillDuration: 600000 } : { ...fast };
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
const stopNames = document => TOUR_STOPS.filter(stop => document.querySelector(stop.sel)).map(stop => stop.name);
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
  assert.equal(dock.querySelector('.agentic-dock-summary').textContent, '18 agents built this page');
  assert.ok(dock.querySelector('[data-agentic-dock-replay]'));
  assert.equal(document.querySelector('[data-agentic-replay]').hidden, false);
  assert.ok(heroEnded >= 7000 && heroEnded <= 9000, `hero took ${heroEnded}ms`);
  assert.ok(clock.now() <= 41000, `tour took ${clock.now()}ms`);
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
  assert.ok(lower.every(max => max >= 1 && max < hero), `lower crews ${lower}`);
  assert.ok(new Set(lower).size >= 2, `crew sizes differ between sections: ${[...maxByStop]}`);
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
  while (controller.touring && clock.now() < 90000) {
    clock.step(16);
    if (!controller.touring || controller.tour.index === index) continue;
    index = controller.tour.index;
    // The stop has just launched; nothing has scrolled yet.
    for (const element of document.querySelectorAll('[data-build-state="pending"]')) {
      if (element.closest('#home')) continue;
      const rect = element.getBoundingClientRect();
      if (rect.height > 0) { assert.ok(rect.top >= window.innerHeight - 1, `${element.className || element.id} was visible`); checked++; }
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

test('crew size scales with the viewport: one orchestrator plus 18, 9 or 5 subagents', t => {
  assert.deepEqual([1440, 1280, 1100, 1024, 768, 640, 390, 375, 360].map(crewTier),
    ['desktop', 'desktop', 'desktop', 'tablet', 'tablet', 'tablet', 'phone', 'phone', 'phone']);
  for (const [width, subagents] of [[1280, 18], [768, 9], [375, 5]]) {
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
  assert.ok([...actions].every(text => /^[a-z0-9]+ · [a-zé ]+$/.test(text)), [...actions].join(' | '));
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
  assert.equal(document.querySelectorAll('.agentic-cursor').length, 19);
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
  assert.equal(row.lastElementChild.textContent, 'MADE TO BE EXPLORED.');
});

test('with fast timing the whole first visit completes without residue', async t => {
  const { document, window, controller } = setup(t, { width: 1280 });
  assert.ok(await until(() => !controller.touring, 6000), 'tour finished');
  assert.equal(controller.phase, 'ready');
  assert.equal(window.localStorage.getItem(storageKey), 'seen');
  assertNoResidue(document);
});

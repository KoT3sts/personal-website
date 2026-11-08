import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import { initAgenticEntrance, shouldPlayEntrance } from '../web/entrance.js';

const html = await readFile(new URL('../web/index.html', import.meta.url), 'utf8');
const entranceCSS = await readFile(new URL('../web/entrance.css', import.meta.url), 'utf8');
const storageKey = 'cesar:portfolio:agentic-intro:v1';

function setup(t, { seen = false, reduced = false, hash = '', storageBlocked = false, observeSections = false } = {}) {
  const { window } = new JSDOM(html, { url: `https://portfolio.test/${hash}` });
  window.matchMedia = () => ({ matches: reduced });
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
  const controller = initAgenticEntrance(window.document, window, { heroDuration: 60, sectionDuration: 30 });
  t.after(() => window.close());
  return { window, document: window.document, controller, intersect: (target, isIntersecting) => observerCallback([{ target, isIntersecting }]) };
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
  assert.equal(document.querySelector('[data-build-state]'), null);
  assert.equal(document.querySelector('.agentic-stage'), null);
  assert.ok(document.querySelector('[data-agentic-replay]'));
});

test('skip and Escape immediately settle all content and disable later automatic sections', t => {
  for (const action of ['skip', 'escape']) {
    const { document, window, controller } = setup(t);
    if (action === 'skip') document.querySelector('[data-agentic-skip]').click();
    else document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    assert.equal(controller.phase, 'ready');
    assert.equal(controller.sectionsEligible, false);
    assert.equal(document.querySelector('[data-build-state]'), null);
    assert.equal(document.querySelector('.agentic-stage'), null);
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

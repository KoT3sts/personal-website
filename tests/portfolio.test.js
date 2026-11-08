import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import { initPortfolio } from '../web/app.js';

const html = await readFile(new URL('../web/index.html', import.meta.url), 'utf8');

test('About navigation covers both scenes while header colors follow the actual section', t => {
  const { window } = new JSDOM(html, { url: 'https://portfolio.test/#about' });
  t.after(() => window.close());
  window.matchMedia = () => ({ matches: true });
  let onIntersection;
  const observed = [];
  window.IntersectionObserver = class {
    constructor(callback) { onIntersection = callback; }
    observe(element) { observed.push(element); }
  };
  const { document } = window;
  initPortfolio(document, window);
  const header = document.querySelector('.site-header');
  const nav = () => document.querySelector('.main-nav [aria-current]')?.hash;
  const enter = id => onIntersection([{ target: document.getElementById(id), isIntersecting: true }]);
  assert.ok(observed.includes(document.querySelector('#introduction')));
  enter('about');
  assert.equal(nav(), '#about');
  assert.ok(header.classList.contains('is-dark'));
  enter('introduction');
  assert.equal(nav(), '#about', 'cinematic introduction belongs to About');
  assert.ok(header.classList.contains('is-dark'));
  enter('work');
  assert.equal(nav(), '#work');
  assert.equal(header.classList.contains('is-dark'), false);
});

function setup(reducedMotion = false, withDialog = false) {
  const { window: runtime } = new JSDOM(html, { url: 'https://portfolio.test/' });
  const { document, Event } = runtime;
  runtime.matchMedia = () => ({ matches: reducedMotion });
  if (withDialog) {
    // JSDOM lacks these native methods. Model only their browser-owned
    // open/close effects; the app's content and focus handlers run unchanged.
    const dialog = document.querySelector('.project-dialog');
    dialog.showModal = () => {
      dialog.setAttribute('open', '');
      dialog.querySelector('.dialog-close').focus();
    };
    dialog.close = () => {
      dialog.removeAttribute('open');
      dialog.dispatchEvent(new Event('close'));
    };
  }
  const result = initPortfolio(document, runtime);
  function dispatch(element, type, properties = {}) {
    const event = new Event(type, { bubbles: true, cancelable: true });
    Object.assign(event, properties);
    element.dispatchEvent(event);
    return event;
  }
  return { document, dispatch, ...result };
}

test('gallery next, previous, and named selectors update the displayed project and accessible controls', () => {
  const { document, dispatch, state } = setup();
  dispatch(document.querySelector('.gallery-next'), 'click');
  assert.equal(state.index, 1);
  assert.match(document.querySelector('.gallery-count').textContent, /02 \/ 03 — Work Helper/);
  assert.equal(document.querySelector('[data-select="1"]').getAttribute('aria-pressed'), 'true');
  assert.equal(document.querySelectorAll('.project-card[aria-hidden="false"]').length, 1);
  document.querySelectorAll('.project-card[aria-hidden="true"] a').forEach(link => assert.equal(link.getAttribute('tabindex'), '-1'));
  dispatch(document.querySelector('.gallery-prev'), 'click');
  assert.equal(state.index, 0);
  dispatch(document.querySelector('[data-select="2"]'), 'click');
  assert.match(document.querySelector('.gallery-count').textContent, /VoiceLab/);
});

test('gallery keyboard arrows and horizontal swipes browse while vertical swipes scroll the page', () => {
  const { document, dispatch, state } = setup();
  const stage = document.querySelector('.gallery-stage');
  const key = dispatch(stage, 'keydown', { key: 'ArrowLeft' });
  assert.equal(key.defaultPrevented, true);
  assert.equal(state.index, 2);
  dispatch(stage, 'pointerdown', { button: 0, pointerId: 1, clientX: 160, clientY: 120 });
  dispatch(stage, 'pointermove', { pointerId: 1, clientX: 70, clientY: 123 });
  dispatch(stage, 'pointerup', { pointerId: 1, clientX: 70, clientY: 123 });
  assert.equal(state.index, 0);
  const followupClick = dispatch(stage, 'click');
  assert.equal(followupClick.defaultPrevented, true);
  dispatch(stage, 'pointerdown', { button: 0, pointerId: 2, clientX: 160, clientY: 120 });
  dispatch(stage, 'pointermove', { pointerId: 2, clientX: 165, clientY: 210 });
  dispatch(stage, 'pointerup', { pointerId: 2, clientX: 170, clientY: 230 });
  assert.equal(state.index, 0);
});

test('project descriptions remain reachable when native dialogs are unavailable', () => {
  const { document, dispatch } = setup();
  assert.equal(document.querySelector('.project-stories').style.display, 'grid');
  for (const link of document.querySelectorAll('[data-open]')) {
    assert.ok(document.getElementById(link.getAttribute('href').slice(1)));
    assert.equal(dispatch(link, 'click', { button: 0 }).defaultPrevented, false);
  }
});

test('swiping a focused project moves focus outside the outgoing hidden panel', () => {
  const { document, dispatch } = setup();
  const outgoingLink = document.querySelector('.project-card a');
  const stage = document.querySelector('.gallery-stage');
  outgoingLink.focus();
  assert.equal(document.activeElement, outgoingLink);
  dispatch(stage, 'pointerdown', { button: 0, pointerId: 3, clientX: 180, clientY: 120 });
  dispatch(stage, 'pointermove', { pointerId: 3, clientX: 80, clientY: 122 });
  dispatch(stage, 'pointerup', { pointerId: 3, clientX: 80, clientY: 122 });
  assert.equal(document.activeElement, stage);
  assert.equal(document.activeElement.closest('[aria-hidden="true"]'), null);
});

test('project dialog uses the chosen project content and restores the opener on close', () => {
  const { document, dispatch } = setup(false, true);
  const opener = document.querySelector('.project-card a');
  const source = document.querySelector('#project-barking');
  const dialog = document.querySelector('.project-dialog');
  opener.focus();
  const click = dispatch(opener, 'click', { button: 0 });
  assert.equal(click.defaultPrevented, true);
  assert.equal(dialog.querySelector('h3').textContent, 'Barking Village');
  assert.equal(dialog.querySelector('.story-lead').textContent, source.querySelector('.story-lead').textContent);
  assert.equal(document.querySelectorAll('#dialog-project-title').length, 1);
  assert.equal(document.body.classList.contains('dialog-open'), true);
  assert.equal(document.activeElement, dialog.querySelector('.dialog-close'));
  dispatch(dialog.querySelector('.dialog-close'), 'click');
  assert.equal(document.body.classList.contains('dialog-open'), false);
  assert.equal(document.activeElement, opener);
});

test('reduced motion avoids pointer-driven sculpture movement', () => {
  const { document, dispatch } = setup(true);
  dispatch(document.querySelector('.hero'), 'pointermove', { clientX: 1200, pointerType: 'mouse' });
  assert.equal(document.querySelector('.hero-art').style.getPropertyValue('--art-rotate'), '');
});

test('every internal navigation target and local image points to a real destination', async () => {
  const { document } = new JSDOM(html).window;
  for (const link of document.querySelectorAll('a[href^="#"]')) assert.ok(document.getElementById(link.getAttribute('href').slice(1)));
  for (const image of document.querySelectorAll('img[src]')) {
    const data = await readFile(new URL(`../web/${image.getAttribute('src')}`, import.meta.url));
    assert.ok(data.byteLength > 0);
    assert.ok(image.hasAttribute('alt'));
  }
});

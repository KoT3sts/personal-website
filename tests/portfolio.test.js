import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import { initPortfolio } from '../web/app.js';

const html = await readFile(new URL('../web/index.html', import.meta.url), 'utf8');

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
  assert.match(document.querySelector('.gallery-count').textContent, /02 \/ 06 — Thoughts-to-Text BCI/);
  assert.equal(document.querySelector('[data-select="1"]').getAttribute('aria-pressed'), 'true');
  assert.equal(document.querySelectorAll('.project-card[aria-hidden="false"]').length, 1);
  document.querySelectorAll('.project-card[aria-hidden="true"] a').forEach(link => assert.equal(link.getAttribute('tabindex'), '-1'));
  dispatch(document.querySelector('.gallery-prev'), 'click');
  assert.equal(state.index, 0);
  dispatch(document.querySelector('[data-select="3"]'), 'click');
  assert.match(document.querySelector('.gallery-count').textContent, /04 \/ 06 — VoiceLab/);
  dispatch(document.querySelector('[data-select="5"]'), 'click');
  assert.match(document.querySelector('.gallery-count').textContent, /06 \/ 06 — Barking Village/);
});

test('every project card has a matching selector, story, and only the nearest neighbours stay visible', () => {
  const { document } = setup();
  const cards = [...document.querySelectorAll('.project-card')];
  const selectors = [...document.querySelectorAll('[data-select]')];
  assert.equal(cards.length, 6);
  assert.equal(selectors.length, cards.length);
  cards.forEach((card, index) => {
    const title = card.querySelector('h3').textContent;
    assert.equal(selectors[index].textContent, title);
    const story = document.getElementById(card.querySelector('[data-open]').dataset.open);
    assert.ok(story, `missing story for ${title}`);
    assert.equal(story.querySelector('h3').textContent, title);
  });
  // Index 0 is active: cards 1 and 5 are neighbours, 2 and 4 fade out, 3 wraps behind and is hidden.
  assert.equal(cards[0].style.getPropertyValue('--card-opacity'), '1');
  assert.equal(cards[1].style.getPropertyValue('--card-opacity'), '0.65');
  assert.equal(cards[5].style.getPropertyValue('--card-opacity'), '0.65');
  assert.equal(cards[2].style.getPropertyValue('--card-opacity'), '0');
  assert.equal(cards[3].hasAttribute('data-far'), true);
  assert.equal(cards.filter(card => card.hasAttribute('data-far')).length, 1);
});

test('gallery keyboard arrows and horizontal swipes browse while vertical swipes scroll the page', () => {
  const { document, dispatch, state } = setup();
  const stage = document.querySelector('.gallery-stage');
  const key = dispatch(stage, 'keydown', { key: 'ArrowLeft' });
  assert.equal(key.defaultPrevented, true);
  assert.equal(state.index, 5);
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
  const source = document.querySelector('#project-agents');
  const dialog = document.querySelector('.project-dialog');
  opener.focus();
  const click = dispatch(opener, 'click', { button: 0 });
  assert.equal(click.defaultPrevented, true);
  assert.equal(dialog.querySelector('h3').textContent, 'Multi-Agent Workflow');
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

test('every internal navigation target, local image, and local download points to a real destination', async () => {
  const { document } = new JSDOM(html).window;
  for (const link of document.querySelectorAll('a[href^="#"]')) assert.ok(document.getElementById(link.getAttribute('href').slice(1)));
  for (const image of document.querySelectorAll('img[src]')) {
    const data = await readFile(new URL(`../web/${image.getAttribute('src')}`, import.meta.url));
    assert.ok(data.byteLength > 0);
    assert.ok(image.hasAttribute('alt'));
  }
  for (const link of document.querySelectorAll('a[href^="./"]')) {
    const data = await readFile(new URL(`../web/${link.getAttribute('href')}`, import.meta.url));
    assert.ok(data.byteLength > 0);
  }
});

test('contact paths cover email, LinkedIn, GitHub, and the résumé without publishing a phone number', () => {
  const { document } = new JSDOM(html).window;
  const hrefs = [...document.querySelectorAll('#contact a')].map(link => link.getAttribute('href'));
  assert.ok(hrefs.includes('mailto:Lucenatrujillo.cesar@gmail.com'));
  assert.ok(hrefs.includes('https://www.linkedin.com/in/cesar-tortolero'));
  assert.ok(hrefs.includes('https://github.com/KoT3sts'));
  assert.ok(hrefs.includes('./assets/Cesar_Tortolero_Resume.pdf'));
  const heroActions = [...document.querySelectorAll('.hero-actions a')].map(link => link.getAttribute('href'));
  assert.ok(heroActions.includes('./assets/Cesar_Tortolero_Resume.pdf'));
  assert.ok(heroActions.includes('https://www.linkedin.com/in/cesar-tortolero'));
  for (const link of document.querySelectorAll('a[target="_blank"]')) assert.match(link.getAttribute('rel'), /noopener/);
  assert.doesNotMatch(html, /\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}/);
  assert.doesNotMatch(html, /tel:/i);
});

test('the first heading states the role and the page keeps one h1 with ordered section headings', () => {
  const { document } = new JSDOM(html).window;
  assert.equal(document.querySelectorAll('h1').length, 1);
  assert.match(document.querySelector('h1').textContent, /Cesar Tortolero, Machine Learning Engineer/);
  assert.match(document.title, /Machine Learning Engineer/);
  assert.match(document.querySelector('meta[name="description"]').content, /Machine Learning Engineer/);
  for (const id of ['about', 'experience', 'work', 'skills', 'contact']) assert.ok(document.querySelector(`.main-nav a[href="#${id}"]`), `nav link for ${id}`);
  let previous = 1;
  for (const heading of document.querySelectorAll('main h1, main h2, main h3, main h4')) {
    const level = Number(heading.tagName[1]);
    assert.ok(level <= previous + 1, `heading level jumps to ${heading.tagName}: ${heading.textContent}`);
    previous = level;
  }
});

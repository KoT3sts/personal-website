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
  const { document, Event } = window;
  // JSDOM has no layout: stub the boxes. The header's centre line is y = 50.
  const header = document.querySelector('.site-header');
  header.getBoundingClientRect = () => ({ top: 24, bottom: 76, height: 52 });
  const sections = [...document.querySelectorAll('main > section[id], footer[id]')];
  function layout(boxes) {
    sections.forEach(section => { section.getBoundingClientRect = () => boxes[section.id] || { top: -5000, bottom: -4000 }; });
    window.dispatchEvent(new Event('scroll'));
  }
  layout({ home: { top: 0, bottom: 800 }, about: { top: 800, bottom: 1700 } });
  initPortfolio(document, window);
  const nav = () => document.querySelector('.main-nav [aria-current]')?.hash;
  const enter = id => onIntersection([{ target: document.getElementById(id), isIntersecting: true }]);
  assert.ok(observed.includes(document.querySelector('#introduction')));
  assert.equal(header.classList.contains('is-dark'), false, 'light hero behind the header');
  enter('about');
  assert.equal(nav(), '#about');
  assert.equal(header.classList.contains('is-dark'), false, 'the nav band alone never changes the header tone');
  layout({ about: { top: -200, bottom: 700 } });
  assert.ok(header.classList.contains('is-dark'));
  enter('introduction');
  assert.equal(nav(), '#about', 'cinematic introduction belongs to About');
  layout({ introduction: { top: -10, bottom: 900 } });
  assert.ok(header.classList.contains('is-dark'));
  enter('work');
  assert.equal(nav(), '#work');
  layout({ work: { top: -300, bottom: 600 } });
  assert.equal(header.classList.contains('is-dark'), false);
  // Regression: at the very bottom the dark footer filled the nav band while the
  // light closing note was still behind the header, so the wordmark vanished.
  enter('contact');
  layout({ approach: { top: -900, bottom: -400 }, notes: { top: -400, bottom: 125 }, contact: { top: 125, bottom: 800 } });
  assert.equal(header.classList.contains('is-dark'), false, 'light closing note behind the header at the page bottom');
  layout({ notes: { top: -500, bottom: 30 }, contact: { top: 30, bottom: 705 } });
  assert.ok(header.classList.contains('is-dark'), 'dark once the footer is behind the header');
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
  // Index 0 is active: cards 1 and 5 are the visible neighbours, the rest are offscreen.
  assert.equal(cards[0].style.getPropertyValue('--card-opacity'), '1');
  assert.equal(cards[0].style.getPropertyValue('--caption'), '1');
  for (const index of [1, 5]) {
    assert.equal(cards[index].style.getPropertyValue('--card-opacity'), '0.6');
    assert.equal(cards[index].style.getPropertyValue('--caption'), '0', 'only the centred card shows its caption');
    assert.equal(cards[index].hasAttribute('data-far'), false);
  }
  assert.deepEqual(cards.map(card => card.hasAttribute('data-far')), [false, false, true, true, true, false]);
  // The curved surface is decoration: each card keeps its real link, image and alt text.
  cards.forEach(card => {
    const strips = card.querySelector('.project-image-link .ribbon-strips');
    assert.equal(strips.getAttribute('aria-hidden'), 'true');
    assert.ok(strips.querySelectorAll('.ribbon-strip').length >= 10);
    assert.ok(card.querySelector('.project-image-link img').getAttribute('alt').length > 20);
  });
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

test('About scenes lead into capabilities, then experience, work, skills and approach, with the Currently note in the scene', () => {
  const { document } = new JSDOM(html).window;
  const order = [...document.querySelectorAll('main > section[id]')].map(section => section.id);
  assert.deepEqual(order, ['home', 'about', 'introduction', 'capabilities', 'experience', 'work', 'projects', 'skills', 'approach', 'notes']);
  assert.ok(document.querySelector('footer#contact'));
  assert.equal(document.querySelector('#introduction').dataset.navSection, 'about');
  const sceneLinks = [...document.querySelectorAll('#introduction .scene-pill')].map(link => link.getAttribute('href'));
  assert.deepEqual(sceneLinks, ['#capabilities', '#experience']);
  assert.ok(document.querySelector('#introduction .scene-pill-primary[href="#capabilities"]'));
  assert.match(document.querySelector('#introduction-title').textContent, /AI agents/);
  assert.match(document.querySelector('#introduction .cinematic-copy').textContent, /Machine Learning Engineer at ADP/);
  const labels = [...document.querySelectorAll('.about-transition-meta > :first-child, .section-top > :first-child')].map(label => label.textContent.match(/^(\d{2}) \//)?.[1]).filter(Boolean);
  assert.deepEqual(labels, ['01', '02', '03', '04', '05', '06', '07'], 'mono section labels count up in page order');
  const items = [...document.querySelectorAll('#capabilities .capability')];
  assert.equal(items.length, 8);
  for (const item of items) {
    assert.ok(item.querySelector('h3')?.textContent.trim(), 'capability needs a title');
    assert.ok(item.querySelector('.capability-proof')?.textContent.replace('PROOF', '').trim(), 'capability needs a proof line');
  }
  assert.equal(document.querySelectorAll('.currently').length, 1);
  assert.ok(document.querySelector('#introduction .currently'));
  assert.match(document.querySelector('.currently').textContent, /Pursuing an M\.S\. in Computer Science \(Machine Learning\) at Georgia Tech, part-time, while working full-time\./);
  assert.doesNotMatch(document.body.textContent, /open to work|looking for (a|new) (job|role)|available for hire/i);
});

test('every anchor the first-visit entrance targets still exists in the markup', () => {
  const { document } = new JSDOM(html).window;
  for (const selector of ['.wordmark', '.main-nav', '.hero-kicker', '#hero-title', '.hero-art', '.hero-portrait', '.sculpture', '.hero-orbit', '.hero-intro', '.hero-note', '.scroll-cue', '#introduction .cinematic-art', '#introduction .cinematic-copy', '#introduction .scene-actions', '.project-image-link', '.footer-bottom']) {
    assert.ok(document.querySelector(selector), `entrance anchor ${selector}`);
  }
});

test('dragging moves the ribbon with the pointer, and a short drag settles back onto the same project', () => {
  const { document, dispatch, state } = setup();
  const stage = document.querySelector('.gallery-stage');
  const cards = [...document.querySelectorAll('.project-card')];
  const offset = card => Number(card.style.getPropertyValue('--o'));
  dispatch(stage, 'pointerdown', { button: 0, pointerId: 7, clientX: 300, clientY: 120 });
  dispatch(stage, 'pointermove', { pointerId: 7, clientX: 270, clientY: 121 });
  assert.ok(stage.classList.contains('is-dragging'));
  assert.ok(offset(cards[0]) < 0, 'active card follows the pointer left');
  assert.ok(offset(cards[1]) < 1, 'next card approaches the centre');
  assert.ok(Number(cards[1].style.getPropertyValue('--card-opacity')) > 0.6, 'next card brightens as it approaches');
  assert.ok(Number(cards[0].style.getPropertyValue('--caption')) < 1, 'outgoing caption starts to fade');
  dispatch(stage, 'pointerup', { pointerId: 7, clientX: 270, clientY: 121 });
  assert.equal(state.index, 0);
  assert.equal(stage.classList.contains('is-dragging'), false);
  assert.equal(offset(cards[0]), 0);
  assert.equal(cards[1].style.getPropertyValue('--card-opacity'), '0.6');
});

test('tapping a visible neighbour selects it instead of opening it', () => {
  const { document, dispatch, state } = setup(false, true);
  const strip = document.querySelector('.project-card[data-project="bci"] .ribbon-strip');
  const click = dispatch(strip, 'click', { button: 0 });
  assert.equal(click.defaultPrevented, true);
  assert.equal(state.index, 1);
  assert.equal(document.querySelector('.project-dialog').hasAttribute('open'), false);
  assert.match(document.querySelector('.gallery-count').textContent, /^02 \/ 06 — Thoughts-to-Text BCI$/);
});

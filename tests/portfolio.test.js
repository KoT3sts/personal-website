import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import { initPortfolio } from '../web/app.js';
import { initExplorer } from '../web/explorer.js';

const html = await readFile(new URL('../web/index.html', import.meta.url), 'utf8');

test('About navigation covers both scenes while header colors follow the actual section', t => {
  const { window } = new JSDOM(html, { url: 'https://portfolio.test/#about' });
  t.after(() => window.close());
  window.matchMedia = () => ({ matches: true });
  window.IntersectionObserver = class { observe() {} disconnect() {} };
  const { document, Event } = window;
  // JSDOM has no layout: stub the boxes. The header's centre line is y = 50;
  // the nav's reading line is 30% of the window height (768 -> y = 230).
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
  assert.equal(nav(), undefined, 'the hero has no nav entry');
  assert.equal(header.classList.contains('is-dark'), false, 'light hero behind the header');
  layout({ home: { top: -600, bottom: 200 }, about: { top: 200, bottom: 1100 } });
  assert.equal(nav(), '#about');
  assert.equal(header.classList.contains('is-dark'), false, 'the nav line alone never changes the header tone');
  layout({ about: { top: -200, bottom: 700 } });
  assert.ok(header.classList.contains('is-dark'));
  layout({ about: { top: -900, bottom: -10 }, introduction: { top: -10, bottom: 900 } });
  assert.equal(nav(), '#about', 'cinematic introduction belongs to About');
  assert.ok(header.classList.contains('is-dark'));
  layout({ work: { top: -300, bottom: 600 } });
  assert.equal(nav(), '#work');
  assert.equal(header.classList.contains('is-dark'), false);
  // Regression: at the very bottom the dark footer filled the nav band while the
  // light closing note was still behind the header, so the wordmark vanished.
  layout({ approach: { top: -900, bottom: -400 }, notes: { top: -400, bottom: 125 }, contact: { top: 125, bottom: 800 } });
  assert.equal(nav(), '#contact');
  assert.equal(header.classList.contains('is-dark'), false, 'light closing note behind the header at the page bottom');
  layout({ notes: { top: -500, bottom: 30 }, contact: { top: 30, bottom: 705 } });
  assert.ok(header.classList.contains('is-dark'), 'dark once the footer is behind the header');
});

test('the nav follows the reading line both ways: never WORK while Experience is read', t => {
  const { window } = new JSDOM(html, { url: 'https://portfolio.test/#experience' });
  t.after(() => window.close());
  window.matchMedia = () => ({ matches: true });
  window.IntersectionObserver = class { observe() {} disconnect() {} };
  const { document, Event } = window;
  const sections = [...document.querySelectorAll('main > section[id], footer[id]')];
  function layout(boxes) {
    sections.forEach(section => { section.getBoundingClientRect = () => boxes[section.id] || { top: -5000, bottom: -4000 }; });
    window.dispatchEvent(new Event('scroll'));
  }
  initPortfolio(document, window);
  const nav = () => document.querySelector('.main-nav [aria-current]')?.hash;
  layout({ experience: { top: -2000, bottom: 400 }, work: { top: 400, bottom: 1600 } });
  assert.equal(nav(), '#experience');
  layout({ experience: { top: -2300, bottom: 100 }, work: { top: 100, bottom: 1300 } });
  assert.equal(nav(), '#work');
  // Back up a little: the work section is still on screen, but Experience is under the line again.
  layout({ experience: { top: -2150, bottom: 250 }, work: { top: 250, bottom: 1450 } });
  assert.equal(nav(), '#experience');
});

function setup(reducedMotion = false) {
  const { window: runtime } = new JSDOM(html, { url: 'https://portfolio.test/' });
  const { document, Event } = runtime;
  runtime.matchMedia = () => ({ matches: reducedMotion, addEventListener() {}, removeEventListener() {} });
  initPortfolio(document, runtime);
  function dispatch(element, type, properties = {}) {
    const event = new Event(type, { bubbles: true, cancelable: true });
    Object.assign(event, properties);
    element.dispatchEvent(event);
    return event;
  }
  return { window: runtime, document, dispatch };
}

test('one gallery: the explorer in #work, every cover a link to its case study, no dialog', () => {
  const { document } = setup();
  assert.equal(document.querySelector('.project-dialog, dialog, #projects, .gallery, .project-card'), null);
  const explorer = document.querySelector('#work .explorer');
  assert.ok(explorer);
  assert.equal(document.querySelector('#work .work-heading').nextElementSibling, explorer, 'right under the heading');
  const links = [...explorer.querySelectorAll('.explorer-card')];
  assert.equal(links.length, 6);
  links.forEach(link => assert.match(link.getAttribute('href'), /^\.\/projects\/[a-z-]+\.html$/));
  // The stories stay in the page (no-script fallback; the case studies repeat them).
  assert.equal(document.querySelectorAll('.project-stories > .project-story').length, 6);
});

test('explorer keys open the ring and step through, the index selects and is announced', async () => {
  const { window, document } = setup();
  const explorer = initExplorer(document, window);
  assert.equal(explorer.state.mode, 'ring');
  const covers = [...document.querySelectorAll('.explorer-card')];
  const key = (element, name) => {
    const event = new window.KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true });
    element.dispatchEvent(event);
    return event;
  };
  assert.equal(key(covers[0], 'ArrowDown').defaultPrevented, true, 'the first arrow opens the stack');
  assert.equal(explorer.state.mode, 'stack');
  assert.equal(explorer.state.index, 0);
  assert.equal(key(covers[0], 'ArrowDown').defaultPrevented, true);
  assert.equal(explorer.state.index, 1);
  assert.equal(document.activeElement, covers[1], 'focus follows the selection');
  assert.equal(covers[1].getAttribute('aria-current'), 'true');
  assert.deepEqual(covers.map(link => link.tabIndex), [-1, 0, -1, -1, -1, -1]);
  key(covers[1], 'End');
  assert.equal(explorer.state.index, 5);
  assert.equal(key(covers[5], 'ArrowDown').defaultPrevented, false, 'past the last project the page scrolls');
  document.querySelector('[data-explorer-pick="4"]').click();
  assert.equal(explorer.state.index, 4);
  assert.equal(document.querySelector('.explorer-caption-title').textContent, 'Work Helper');
  assert.equal(document.querySelector('.explorer-index-count').textContent, '05 / 06');
  await new Promise(resolve => setTimeout(resolve, 250));
  assert.equal(document.querySelector('.explorer-live').textContent, 'Work Helper, project 5 of 6, opportunity discovery.');
  // The caption shows the active project's facts, read from its story; only that panel is live.
  const panels = [...document.querySelectorAll('.explorer-caption .explorer-facts-panel')];
  assert.equal(panels.length, 6);
  const active = panels.filter(panel => panel.classList.contains('is-active'));
  assert.deepEqual(active, [panels[4]]);
  assert.deepEqual(panels.map(panel => panel.hasAttribute('inert')), [true, true, true, true, false, true]);
  assert.deepEqual([...panels[4].querySelectorAll('dt')].map(term => term.textContent), ['Focus', 'Stage']);
  assert.deepEqual([...panels[4].querySelectorAll('dd')].map(value => value.textContent), ['Making opportunity discovery more approachable', 'In development']);
  assert.equal(document.querySelector('.explorer-caption').hasAttribute('aria-hidden'), false, 'the facts are read');
  assert.equal(document.querySelector('.explorer-caption-title').getAttribute('aria-hidden'), 'true', 'the repeated title is not');
  assert.deepEqual([...panels[1].querySelectorAll('.explorer-tags li')].map(tag => tag.textContent), ['EEG', 'Autoencoder', 't-SNE']);
  assert.equal(panels[2].querySelector('.explorer-facts-link').getAttribute('href'), './lab/sentiment-eval.html');
  assert.equal(panels.filter(panel => panel.querySelector('.explorer-facts-link')).length, 1, 'the lab link only for the chatbot');
  // Focus on the lab link when the project changes goes to the new cover, not <body>.
  document.querySelector('[data-explorer-pick="2"]').click();
  const lab = panels[2].querySelector('.explorer-facts-link');
  lab.focus();
  assert.equal(document.activeElement, lab);
  document.querySelector('[data-explorer-pick="3"]').click();
  assert.equal(explorer.state.index, 3);
  assert.equal(panels[2].hasAttribute('inert'), true);
  assert.equal(document.activeElement, covers[3], 'focus follows the selection out of the inert panel');
  // Focus elsewhere (an index button) stays where it is.
  const pick = document.querySelector('[data-explorer-pick="4"]');
  pick.focus();
  pick.click();
  assert.equal(document.activeElement, pick);
  // A pointer click on a neighbour selects it; on the active cover it follows the link.
  const neighbour = new window.MouseEvent('click', { bubbles: true, cancelable: true, detail: 1, button: 0 });
  covers[2].dispatchEvent(neighbour);
  assert.equal(neighbour.defaultPrevented, true);
  assert.equal(explorer.state.index, 2);
  // (Checked on the way up, then stopped: jsdom cannot navigate.)
  let followed = null;
  document.addEventListener('click', event => { followed = !event.defaultPrevented; event.preventDefault(); }, { once: true });
  covers[2].dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true, detail: 1, button: 0 }));
  assert.equal(followed, true);
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
  assert.deepEqual(order, ['home', 'about', 'introduction', 'capabilities', 'experience', 'work', 'skills', 'approach', 'notes']);
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
  assert.equal(items.length, 7);
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
  for (const selector of ['.wordmark', '.main-nav', '.hero-kicker', '#hero-title', '.hero-art', '.hero-portrait', '.sculpture', '.hero-orbit', '.hero-intro', '.hero-proof', '.hero-note', '.scroll-cue', '#introduction .cinematic-art', '#introduction .cinematic-copy', '#introduction .scene-actions', '.explorer-item .explorer-cover', '#explorer-title', '.footer-bottom']) {
    assert.ok(document.querySelector(selector), `entrance anchor ${selector}`);
  }
});

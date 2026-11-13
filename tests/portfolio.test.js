import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import { initPortfolio, loadWorkPreviews, bootPage } from '../web/app.js';
import { initHomeCharts } from '../web/home-charts.js';
import { initExplorer, buildFacts, readFacts } from '../web/explorer.js';

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
  // Open the work (#lab) has its own nav entry and a light tone.
  layout({ work: { top: -1200, bottom: 100 }, lab: { top: 100, bottom: 1300 } });
  assert.equal(nav(), '#lab');
  assert.equal(header.classList.contains('is-dark'), false, 'light lab section behind the header');
  layout({ lab: { top: -1000, bottom: 300 }, skills: { top: 300, bottom: 1500 } });
  assert.equal(nav(), '#lab', 'Lab stays marked until Skills reaches the reading line');
  layout({ lab: { top: -1100, bottom: 200 }, skills: { top: 200, bottom: 1400 } });
  assert.equal(nav(), '#skills');
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

test('the facts panels in the page are exactly what explorer.js would build from the stories', () => {
  // index.html carries them so the caption (the stage's height on tablets and phones) is as tall
  // before explorer.js runs as after; a reload or back/forward then lands where it left off.
  const { document } = setup();
  const panels = [...document.querySelectorAll('.explorer-caption > .explorer-facts > .explorer-facts-panel')];
  const covers = [...document.querySelectorAll('.explorer-card')];
  const stories = [...document.querySelectorAll('.project-stories .project-story')];
  assert.equal(panels.length, covers.length);
  const bare = node => { const copy = node.cloneNode(true); copy.classList.remove('is-active'); copy.removeAttribute('inert'); return copy.outerHTML; };
  covers.forEach((cover, index) => {
    const story = stories.find(item => item.querySelector('.story-case-link')?.getAttribute('href') === cover.getAttribute('href'));
    const built = buildFacts(document, cover.querySelector('.explorer-card-name').textContent, readFacts(story));
    assert.equal(bare(panels[index]), bare(built), `panel ${index + 1}`);
  });
  // explorer.js uses them as they are (no second set), and without them builds its own.
  const { window, document: fresh } = setup();
  initExplorer(fresh, window);
  assert.equal(fresh.querySelectorAll('.explorer-facts').length, 1);
  assert.equal(fresh.querySelectorAll('.explorer-facts-panel').length, 6);
  const { window: bareWindow, document: without } = setup();
  without.querySelector('.explorer-facts').remove();
  initExplorer(without, bareWindow);
  assert.equal(without.querySelectorAll('.explorer-caption .explorer-facts-panel').length, 6);
  assert.ok(without.querySelector('.explorer-facts').nextElementSibling.matches('.explorer-caption-open'));
});

test('if explorer.js fails mid-way, the HTML explorer comes back .is-off: the plain grid and the stories, nothing of the stage', async () => {
  const { window } = new JSDOM(html, { url: 'https://portfolio.test/' });
  const { document } = window;
  window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  document.documentElement.dataset.tour = 'skip';
  const ok = () => ({});
  bootPage(document, window, {
    portfolio: ok, experience: ok, charts: ok, workPreviews: () => null, entrance: () => {},
    // Fails after it has styled the covers, added shades and tab stops.
    explorer: (doc, win) => { initExplorer(doc, win); throw new Error('explorer failed'); },
  });
  const explorer = document.querySelector('#work .explorer');
  assert.ok(explorer.classList.contains('is-off'));
  assert.equal(explorer.classList.contains('is-ready'), false);
  assert.ok('booted' in document.documentElement.dataset, 'the rest of the page still boots');
  assert.equal(explorer.querySelector('.explorer-shade'), null);
  assert.deepEqual([...explorer.querySelectorAll('.explorer-item, .explorer-card')].filter(node => node.hasAttribute('style') || node.hasAttribute('tabindex') || node.hasAttribute('aria-current')).length, 0, 'no leftover transforms or tab stops');
  // No first-paint rule (explorer.css, styles.css) matches anything in it, or hides the stories.
  const sheets = await Promise.all(['explorer.css', 'styles.css'].map(file => readFile(new URL(`../web/${file}`, import.meta.url), 'utf8')));
  const split = list => { const out = ['']; let depth = 0; for (const ch of list) { if (ch === '(') depth++; if (ch === ')') depth--; if (ch === ',' && !depth) out.push(''); else out[out.length - 1] += ch; } return out.map(part => part.trim()); };
  const gated = sheets.flatMap(css => [...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}@]+)\{[^{}]*\}/g)].flatMap(([, list]) => split(list)))
    .filter(selector => selector.includes('[data-tour]') && selector.includes('.explorer'))
    .map(selector => selector.replace(/::?(before|after)\b/g, '').replace(/:(hover|focus-visible)\b/g, ''));
  assert.ok(gated.length > 60);
  const nodes = [explorer, ...explorer.querySelectorAll('*'), document.querySelector('.project-stories')];
  let checked = 0;
  for (const selector of gated) {
    let hits;
    try { hits = nodes.filter(node => node.matches(selector)); checked++; } catch { continue; }
    assert.deepEqual(hits.map(node => node.className), [], selector);
  }
  assert.ok(checked > 60, `${checked} selectors checked`);
  // With scripts and a working explorer the same selectors do apply.
  const live = document.createElement('div');
  live.className = 'explorer';
  explorer.after(live);
  assert.ok(live.matches(':root[data-tour] .explorer:not(.is-off)'));
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
  assert.equal(key(covers[0], 'ArrowDown').defaultPrevented, true, 'the first arrow opens the stack and moves');
  assert.equal(explorer.state.mode, 'stack');
  assert.equal(explorer.state.index, 1);
  assert.equal(document.activeElement, covers[1], 'focus follows the selection');
  assert.equal(covers[1].getAttribute('aria-current'), 'true');
  assert.deepEqual(covers.map(link => link.tabIndex), [-1, 0, -1, -1, -1, -1]);
  key(covers[1], 'End');
  assert.equal(explorer.state.index, 5);
  assert.equal(key(covers[5], 'ArrowDown').defaultPrevented, true, 'past the last project the arrow stays with the explorer, not the page');
  assert.equal(explorer.state.index, 5);
  assert.equal(key(covers[5], 'ArrowLeft').defaultPrevented, true);
  assert.equal(explorer.state.index, 4);
  assert.equal(key(covers[4], 'PageDown').defaultPrevented, false, 'page keys still scroll the page');
  const pickAt = n => document.querySelector(`[data-explorer-pick="${n}"]`);
  key(pickAt(1), 'ArrowDown');
  assert.equal(explorer.state.index, 2, 'on the index the step counts from the focused entry');
  assert.equal(document.activeElement, pickAt(2));
  document.querySelector('[data-explorer-pick="4"]').click();
  assert.equal(explorer.state.index, 4);
  assert.equal(document.querySelector('.explorer-caption-title').textContent, 'Work Helper');
  assert.equal(document.querySelector('.explorer-index-count').textContent, '05 / 06');
  await new Promise(resolve => setTimeout(resolve, 250));
  assert.equal(document.querySelector('.explorer-live').textContent, 'Work Helper, project 5 of 6, side project.');
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
  assert.equal(panels[2].querySelector('.explorer-facts-link').firstChild.textContent, 'How I evaluate a classifier (public data)', 'says how the lab ties to the chatbot');
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
  // The tour link works without scripts: it opens the recorded run.
  assert.ok(heroActions.includes('./lab/build-trace.html'));
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
  for (const id of ['about', 'experience', 'work', 'lab', 'skills', 'contact']) assert.ok(document.querySelector(`.main-nav a[href="#${id}"]`), `nav link for ${id}`);
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
  assert.deepEqual(order, ['home', 'about', 'introduction', 'capabilities', 'experience', 'work', 'lab', 'skills', 'approach', 'notes']);
  assert.ok(document.querySelector('footer#contact'));
  assert.equal(document.querySelector('#introduction').dataset.navSection, 'about');
  const sceneLinks = [...document.querySelectorAll('#introduction .scene-pill')].map(link => link.getAttribute('href'));
  assert.deepEqual(sceneLinks, ['#capabilities', '#experience']);
  assert.ok(document.querySelector('#introduction .scene-pill-primary[href="#capabilities"]'));
  assert.match(document.querySelector('#introduction-title').textContent, /AI agents/);
  assert.match(document.querySelector('#introduction .cinematic-copy').textContent, /Machine Learning Engineer at ADP/);
  const labels = [...document.querySelectorAll('.about-transition-meta > :first-child, .section-top > :first-child')].map(label => label.textContent.match(/^(\d{2}) \//)?.[1]).filter(Boolean);
  assert.deepEqual(labels, ['01', '02', '03', '04', '05', '06', '07', '08'], 'mono section labels count up in page order');
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
  for (const selector of ['.wordmark', '.main-nav', '.hero-kicker', '#hero-title', '.hero-art', '.hero-portrait', '.sculpture', '.hero-orbit', '.hero-intro', '.hero-proof', '.hero-note', '.scroll-cue', '#introduction .cinematic-art', '#introduction .cinematic-copy', '#introduction .scene-actions', '.explorer-item .explorer-cover', '#explorer-title', '#lab-title', '.open-heading > p', '.open-card .open-card-text', '.open-card .work-preview', '.open-card-link', '.footer-bottom']) {
    assert.ok(document.querySelector(selector), `entrance anchor ${selector}`);
  }
});

// ---- Round 10: Open the work (#lab), home charts, skill links -------------------

test('Open the work: three large cards between Work and Skills, each with a sentence, a preview with a static summary and one link', async () => {
  const { document } = new JSDOM(html).window;
  const lab = document.querySelector('#lab');
  assert.equal(lab.previousElementSibling.id, 'work');
  assert.equal(lab.nextElementSibling.id, 'skills');
  assert.equal(lab.classList.contains('dark-section'), false, 'light, between the light Work and the dark Skills');
  assert.equal(lab.getAttribute('aria-labelledby'), 'lab-title');
  assert.match(lab.querySelector('.section-top').textContent, /^05 \/ INTERACTIVE DEMOS/);
  assert.equal(lab.querySelector('#lab-title').textContent.replace(/\s+/g, ' ').trim(), 'TRY THE WORK.');
  assert.equal(lab.querySelector('.open-heading > p').textContent, 'Three things you can try, not just read.');
  const cards = [...lab.querySelectorAll('.open-cards > .open-card')];
  assert.deepEqual(cards.map(card => [card.querySelector('h3').textContent, card.querySelector('.open-card-text').textContent, card.querySelector('.work-preview').dataset.preview, card.querySelector('a.open-card-link').getAttribute('href')]), [
    ['Agent observability', 'A dashboard of the AI coding agents that built this site: every step, every failure, and automated quality checks on each run.', 'obs', './lab/agent-observability.html'],
    ['Replay the redesign', 'Two days of redesign (Nov 10–11), step by step: 52 recorded steps, errors and recoveries included.', 'trace', './lab/build-trace.html'],
    ['How I evaluate agents', 'How I find agent failures and stop them from shipping.', 'loop', './lab/evaluating-agents.html'],
  ]);
  // The summaries say something without scripts, and only figures the lab pages state.
  const stats = card => [...card.querySelectorAll('.open-stats > div')].map(row => `${row.querySelector('dt').textContent} ${row.querySelector('dd').textContent}`);
  // The observability summary is the same numbers work-previews.js computes from the JSON
  // (tests/work-previews.test.js checks those against the file).
  assert.deepEqual(stats(cards[0]), ['Traces 77', 'Tool calls 9,712', 'Tool error rate 1.7%']);
  assert.equal(cards[0].querySelector('.open-note').textContent, 'NOV 7–12, 2026 · 13 AUTOMATED CHECKS · NO LLM JUDGE');
  assert.deepEqual(stats(cards[1]), ['Steps 52', 'Errors retried or fixed 6 of 8', 'Commits 16']);
  assert.equal(cards[1].querySelector('.open-note').textContent, 'NOV 10–11, 2026');
  assert.deepEqual([...cards[2].querySelectorAll('.open-loop > li > .mono')].map(step => step.textContent), ['TRACE', 'CLASSIFY', 'FIXED TEST SET', 'GATE']);
  // The sentiment lab is not on the homepage list any more; it stays linked from the chatbot story.
  // (The chatbot's facts panel in the explorer repeats the story's link.)
  assert.deepEqual([...document.querySelectorAll('a[href="./lab/sentiment-eval.html"]')].map(link => link.closest('.project-story, .explorer-facts-panel, section')?.className), ['explorer-facts-panel', 'project-story']);
  assert.equal(lab.querySelector('a[href="./lab/sentiment-eval.html"]'), null);
  assert.ok(document.querySelector('#project-chatbot a.story-lab-link[href="./lab/sentiment-eval.html"]'));
  assert.equal(document.querySelector('.story-lab-link').firstChild.textContent, 'How I evaluate a classifier (public data)');
  assert.doesNotMatch(html, /rounds? 4|EVALUATION LAB/i);
  const essay = await readFile(new URL('../web/lab/evaluating-agents.html', import.meta.url), 'utf8');
  assert.match(essay, /Of its 52 steps, 8 ended in an error, and 6 of those are followed by a recorded retry or fix/);
  for (const [, step] of [...cards[2].querySelectorAll('.open-loop > li')].map(li => [li, li.lastChild.textContent.trim()])) assert.ok(essay.includes(step), step);
  // The previews' stylesheet is linked; the module is loaded by app.js, not by a tag.
  assert.match(html, /<link rel="stylesheet" href="\.\/work-previews\.css">/);
  assert.doesNotMatch(html, /<(?:script|link)[^>]*work-previews\.js/);
  // In the main nav, shown on phones in place of About (the section right under the hero).
  assert.ok(document.querySelector('.main-nav a[href="#lab"]:not(.nav-optional)'));
  assert.ok(document.querySelector('.main-nav a[href="#about"].nav-optional'));
});

test('the live previews are optional: a missing or failing module keeps the summaries, never throws, and settles', async () => {
  const fresh = () => { const { window } = new JSDOM(html, { url: 'https://portfolio.test/' }); delete window.IntersectionObserver; return window; };
  const quiet = window => { window.console.warn = () => {}; return window; };
  let window = quiet(fresh());
  const before = window.document.querySelector('#lab .work-preview').innerHTML;
  let previews = loadWorkPreviews(window.document, window, () => Promise.reject(new Error('404')));
  assert.equal(await previews.done, false);
  await previews.settled;
  assert.equal(window.document.querySelector('#lab .work-preview').innerHTML, before);
  assert.ok(window.document.querySelector('#lab').classList.contains('previews-off'), 'no room reserved for previews that will not come');
  window = quiet(fresh());
  previews = loadWorkPreviews(window.document, window, () => ({ initWorkPreviews() { throw new Error('boom'); } }));
  assert.equal(await previews.done, false);
  await previews.settled;
  window = quiet(fresh());
  assert.equal(await loadWorkPreviews(window.document, window, () => ({})).done, false, 'a module without initWorkPreviews');
  // A working module: `settled` waits for the module's own settled promise (sync or async init).
  window = quiet(fresh());
  let called = null;
  let finish;
  previews = loadWorkPreviews(window.document, window, () => ({ async initWorkPreviews(doc, win) { called = [doc, win]; return { settled: new Promise(resolve => { finish = resolve; }) }; } }));
  assert.equal(await previews.done, true);
  assert.deepEqual(called, [window.document, window]);
  let isSettled = false;
  previews.settled.then(() => { isSettled = true; });
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(isSettled, false, 'not before the previews settle');
  finish();
  await previews.settled;
  assert.equal(window.document.querySelector('#lab').classList.contains('previews-off'), false);
  // A rejected `settled` still settles.
  window = quiet(fresh());
  previews = loadWorkPreviews(window.document, window, () => ({ initWorkPreviews() { return { settled: Promise.reject(new Error('json')) }; } }));
  await previews.settled;
  // It waits for the section to come near when an observer exists, unless the tour starts it first.
  window = fresh();
  let observed = null;
  let loads = 0;
  window.IntersectionObserver = class { constructor(callback) { observed = { callback }; } observe(target) { observed.target = target; } disconnect() { observed.gone = true; } };
  previews = loadWorkPreviews(window.document, window, () => { loads++; return { initWorkPreviews() {} }; });
  assert.equal(observed.target.id, 'lab');
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(loads, 0, 'not fetched with the page');
  observed.callback([{ isIntersecting: true }]);
  assert.equal(await previews.done, true);
  assert.equal(loads, 1);
  assert.ok(observed.gone);
  window = fresh();
  window.IntersectionObserver = class { observe() {} disconnect() {} };
  loads = 0;
  previews = loadWorkPreviews(window.document, window, () => { loads++; return { initWorkPreviews() {} }; });
  assert.equal(await previews.start(), true, 'the build tour starts it early');
  await previews.start();
  assert.equal(loads, 1, 'once');
});

test('home charts: the proof figures keep their final text, four capability cards get a chart drawn from their own sentence', () => {
  const { window } = new JSDOM(html, { url: 'https://portfolio.test/' });
  const { document } = window;
  window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  delete window.IntersectionObserver;
  const before = [...document.querySelectorAll('.hero-proof .proof-figure')].map(figure => figure.textContent);
  initHomeCharts(document, window);
  // Without an observer (or with reduced motion) nothing counts: final figures only, as before.
  assert.deepEqual([...document.querySelectorAll('.hero-proof .proof-figure')].map(figure => figure.textContent), before);
  assert.equal(document.querySelectorAll('.proof-count').length, 2, '350 and 250+ ("Day to minutes" stays text)');
  for (const count of document.querySelectorAll('.proof-count')) {
    assert.equal(count.querySelector('.proof-count-ink').getAttribute('aria-hidden'), 'true');
    assert.equal(count.classList.contains('is-counting'), false);
  }
  assert.deepEqual([...document.querySelectorAll('.proof-count-final')].map(final => final.textContent), ['350', '250+']);
  const charts = [...document.querySelectorAll('.capability .cap-chart')];
  assert.deepEqual(charts.map(chart => chart.closest('.capability').dataset.chart), ['records', 'inventory', 'jobs', 'videos']);
  charts.forEach(chart => {
    assert.equal(chart.getAttribute('aria-hidden'), 'true');
    assert.equal(chart.previousElementSibling.className, 'capability-proof', 'right under the proof line');
    assert.equal(chart.classList.contains('is-armed'), false, 'drawn in full, no animation');
  });
  const [records, inventory, jobs, videos] = charts;
  assert.equal(records.querySelector('.cap-band-label').textContent, '2,400+ RECORDS');
  assert.deepEqual([...records.querySelectorAll('.cap-tick')].map(tick => tick.textContent), ['PRECISION', 'RECALL', 'F1']);
  assert.doesNotMatch(records.textContent, /0\.\d/, 'metric names only, no values');
  assert.equal(inventory.querySelectorAll('rect').length, 296);
  assert.deepEqual([...jobs.querySelectorAll('.cap-row')].map(row => [row.querySelector('.cap-row-label').textContent, row.querySelectorAll('rect.cap-on').length, row.querySelector('.cap-row-value').textContent]), [['US', 58, '58/58'], ['EU', 21, '21/21']]);
  assert.equal(videos.querySelectorAll('.cap-dot').length, 12);
  // No chart where the card states no number.
  for (const title of ['Build and ship AI agents and MCP integrations on AWS', 'Build serverless backends and cloud infrastructure', 'Do applied ML research']) {
    const card = [...document.querySelectorAll('.capability')].find(item => item.querySelector('h3').textContent === title);
    assert.equal(card.querySelector('.cap-chart'), null, title);
  }
  // Running it twice draws nothing twice.
  initHomeCharts(document, window);
  assert.equal(document.querySelectorAll('.cap-chart').length, 4);
  assert.equal(document.querySelectorAll('.proof-count').length, 2);
  window.close();
});

test('skill tags used on a card or role are toggle buttons that mark those places; only presses are announced; Escape clears', async () => {
  const { window } = new JSDOM(html, { url: 'https://portfolio.test/' });
  const { document } = window;
  window.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} });
  const { skills } = initHomeCharts(document, window);
  const buttons = [...document.querySelectorAll('#skills .skill-list .tag-list > li > button.skill-tag')];
  assert.deepEqual(buttons.map(button => button.textContent), ['Python', 'TypeScript', 'MCP', 'LangChain', 'MLflow', 'AWS Bedrock AgentCore', 'Amazon SageMaker', 'AWS Lambda', 'Terraform', 'FastAPI']);
  buttons.forEach(button => { assert.equal(button.type, 'button'); assert.equal(button.getAttribute('aria-pressed'), 'false'); });
  // Tags nothing else lists stay plain text.
  const plain = [...document.querySelectorAll('#skills .skill-list .tag-list > li')].filter(item => !item.querySelector('button')).map(item => item.textContent);
  assert.deepEqual(plain, ['SQL', 'RAG', 'LLM evaluation', 'scikit-learn', 'TensorFlow', 'Docker', 'pytest']);
  const usage = document.querySelector('#skills .skill-usage');
  const live = document.querySelector('#skills .skill-usage-live');
  assert.equal(usage.hasAttribute('aria-live'), false, 'the visible line is not live');
  assert.equal(live.getAttribute('aria-live'), 'polite');
  assert.equal(usage.previousElementSibling.className, 'skill-list');
  const hint = 'Tags with a dot are used on a card or role above. Pick one to see where.';
  assert.equal(usage.textContent, hint);
  const settle = () => new Promise(resolve => setTimeout(resolve, 200));
  const tag = name => buttons.find(button => button.textContent === name);
  const matched = () => [...document.querySelectorAll('.is-skill-match')].map(node => node.querySelector('h3, h4').textContent);
  // Focus (or hover) previews visually only: the line changes, nothing is announced.
  tag('AWS Lambda').dispatchEvent(new window.FocusEvent('focus'));
  assert.deepEqual(matched(), ['Build serverless backends and cloud infrastructure', 'Cloud infrastructure & release engineering']);
  assert.match(usage.textContent, /^AWS Lambda — used in: /);
  tag('AWS Lambda').dispatchEvent(new window.FocusEvent('blur'));
  await settle();
  assert.deepEqual(matched(), []);
  assert.equal(usage.textContent, hint);
  assert.equal(live.textContent, '', 'no announcement for focus, hover or blur');
  // A press marks the places and is announced once.
  tag('MLflow').click();
  assert.equal(tag('MLflow').getAttribute('aria-pressed'), 'true');
  assert.deepEqual(matched(), ['Run MLOps and model deployment', 'MLOps & GenAI']);
  assert.deepEqual([...document.querySelectorAll('.is-skill-hit')].map(node => node.textContent), ['MLflow', 'MLflow']);
  const text = 'MLflow — used in: Run MLOps and model deployment · MLOps & GenAI (Associate ML Engineer).';
  assert.equal(usage.textContent, text);
  await settle();
  assert.equal(live.textContent, text);
  // One at a time; a second press of the same tag clears it.
  tag('MCP').click();
  assert.deepEqual(buttons.filter(button => button.getAttribute('aria-pressed') === 'true').map(button => button.textContent), ['MCP']);
  assert.deepEqual(matched(), ['Build and ship AI agents and MCP integrations on AWS', 'AI agent platform & applied AI']);
  tag('MCP').click();
  await settle();
  assert.deepEqual(matched(), []);
  assert.equal(live.textContent, 'Highlight cleared.');
  assert.equal(usage.textContent, hint);
  // Escape clears a pressed tag.
  tag('Amazon SageMaker').click();
  assert.equal(skills.pressed, 'Amazon SageMaker');
  document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  assert.equal(skills.pressed, null);
  assert.deepEqual(matched(), []);
  assert.ok(buttons.every(button => button.getAttribute('aria-pressed') === 'false'));
  window.close();
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  explorerTier, explorerGeometry, clampIndex, halfTurn, ringPose, stackPose, blendPose, poseTransform,
  stackOrder, cascadeMix, travelDuration, wheelPixels, wheelWants, wheelAction, wheelOwner, visibleShare,
  dragTarget, keyTarget, counterLabel, RING,
} from '../web/explorer-state.js';

const html = await readFile(new URL('../web/index.html', import.meta.url), 'utf8');
const css = await readFile(new URL('../web/explorer.css', import.meta.url), 'utf8');
const entrance = await readFile(new URL('../web/entrance.js', import.meta.url), 'utf8');
const SLUGS = ['agent-workflow', 'thoughts-to-text', 'companion-chatbot', 'voicelab', 'work-helper', 'barking-village'];
const work = html.match(/<section id="work"[\s\S]*?\n {4}<\/section>/)?.[0] || '';
const section = work.match(/<div class="explorer">[\s\S]*?\n {6}<\/div>\n/)?.[0] || '';

test('the explorer is the one project gallery, in #work right under the heading', () => {
  assert.ok(section, '#work has the explorer');
  assert.doesNotMatch(html, /id="projects"|project-dialog|class="gallery|project-card|ribbon/, 'no second gallery, ribbon or dialog');
  assert.ok(work.indexOf('<div class="work-heading">') < work.indexOf('<div class="explorer">'), 'explorer after the heading');
  assert.ok(work.indexOf('<div class="explorer">') < work.indexOf('<div class="project-stories">'), 'stories stay below');
  const order = [...html.matchAll(/<section id="([^"]+)"/g)].map(match => match[1]).filter(id => !id.startsWith('project-'));
  assert.deepEqual(order.slice(order.indexOf('work'), order.indexOf('work') + 2), ['work', 'skills']);
  // The centre label sits under the section's h2.
  assert.match(section, /<h3 id="explorer-title">/);
  assert.doesNotMatch(section, /<h2/);
});

test('every project links to its case study, in order, with a described cover and a name', () => {
  const links = [...section.matchAll(/<a class="explorer-card" href="\.\/projects\/([a-z-]+)\.html" aria-label="([^"]+)">/g)];
  assert.deepEqual(links.map(match => match[1]), SLUGS);
  links.forEach(([, slug, label]) => {
    // "Name, category: what the cover shows. Read the case study." The link
    // describes the cover, so the image itself is decorative (alt="").
    assert.match(label, /^[^,]+, [a-zA-Z ]+: [^.]{30,}\. Read the case study\.$/);
    assert.match(section, new RegExp(`src="\\./assets/${slug}\\.svg" alt=""`));
  });
  const names = [...section.matchAll(/<span class="explorer-card-name">([^<]+)<\/span>/g)].map(match => match[1]);
  assert.deepEqual(names, ['Multi-Agent Workflow', 'Thoughts-to-Text BCI', 'Companionship Chatbot', 'VoiceLab', 'Work Helper', 'Barking Village']);
  // Titles match the project stories exactly.
  names.forEach(name => assert.ok(html.includes(`-title">${name}</h3>`), `story title for ${name}`));
});

test('the index is a list of buttons, one per project, with a live region beside it', () => {
  const picks = [...section.matchAll(/<button class="explorer-pick" type="button" data-explorer-pick="(\d)">/g)].map(match => Number(match[1]));
  assert.deepEqual(picks, [0, 1, 2, 3, 4, 5]);
  assert.match(section, /<ol role="list" aria-labelledby="explorer-index-label">/);
  assert.match(section, /id="explorer-index-label"/);
  assert.match(section, /class="explorer-live visually-hidden" aria-live="polite" aria-atomic="true"/);
  // Script-only parts start hidden so the no-script page is a plain list.
  for (const part of ['explorer-caption', 'explorer-index', 'explorer-hint']) assert.match(section, new RegExp(`class="${part}[^"]*"[^>]*hidden>`));
});

test('the build tour builds the explorer on the Projects stop, with no separate Index stop', () => {
  const work = entrance.indexOf("{ sel: '#work', name: 'Projects'");
  const skills = entrance.indexOf("{ sel: '#skills', name: 'Skills'");
  assert.ok(work > 0 && skills > work);
  assert.equal(entrance.indexOf("name: 'Index'"), -1);
  assert.equal(entrance.indexOf("'#projects'"), -1);
  const stop = entrance.slice(work, skills);
  for (const sel of ['#explorer-title', '.explorer-item', '.explorer-index', '.explorer-hint']) assert.ok(stop.includes(`sel: '${sel}'`), `builds ${sel}`);
  assert.doesNotMatch(stop, /project-card|gallery-/);
  assert.equal([...entrance.matchAll(/^ {2}\{ sel: '#[a-z]+', name: '/gm)].length, 9, 'nine stops');
});

test('reduced motion and touch have their own paths in the stylesheet', () => {
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /touch-action: pan-y/);
  assert.match(css, /@media \(max-width: 699px\)/);
});

test('the ring is about 80% of the window tall and keeps clear of the index column', () => {
  // 1280x800: deck 1098 wide (band inside the gutters), as tall as the window; index 243 + gap.
  const g = explorerGeometry(1098, 800, { viewport: 1280, viewportHeight: 800, reserve: 275 });
  assert.ok(g.ringRadius * 2 >= 800 * 0.74 && g.ringRadius * 2 <= 800 * 0.8, `diameter ${g.ringRadius * 2}`);
  const cover = g.ringScale * g.cardW;
  // Top and bottom covers stay inside the deck.
  assert.ok(2 * g.ringRadius + cover * 620 / 900 <= 800 - 2 * RING.pad + 1);
  // At any spin a cover's outer corner stays inside the room left of the index.
  const corner = Math.hypot(g.ringRadius + cover * 620 / 900 / 2, cover / 2);
  assert.equal(g.ringX, -138);
  assert.ok(1098 / 2 + g.ringX + corner <= 1098 - 275 + 1, 'clear of the index');
  assert.ok(1098 / 2 + g.ringX - corner >= -1, 'inside the band on the left');
  assert.ok(Math.abs(ringPose(0, g).x - g.ringX) < 1e-9, 'the ring is centred in its room');
  // Covers roughly a third larger than before, never larger than the stack's.
  assert.ok(cover > 230 && cover < g.cardW);
  // Tablets have no side column: the width bounds the ring, centred.
  const tablet = explorerGeometry(657, 647, { viewport: 768, viewportHeight: 1024, reserve: 657 });
  assert.equal(tablet.ringX, 0);
  assert.ok(2 * Math.hypot(tablet.ringRadius + tablet.ringScale * tablet.cardW * 620 / 900 / 2, tablet.ringScale * tablet.cardW / 2) <= 657);
  assert.ok(tablet.ringRadius > 200);
  // Phones keep the flat deck.
  assert.equal(explorerGeometry(358, 400, { viewport: 390, viewportHeight: 844 }).ringRadius, 0);
});

test('tiers: ring on desktop and tablet, flat deck on phones', () => {
  assert.equal(explorerTier(1440), 'desktop');
  assert.equal(explorerTier(1100), 'desktop');
  assert.equal(explorerTier(768), 'tablet');
  assert.equal(explorerTier(390), 'phone');
  assert.equal(explorerGeometry(390, 400).ring, false);
  const desktop = explorerGeometry(1280, 650);
  assert.equal(desktop.ring, true);
  assert.ok(desktop.stackX > 0, 'the stack leaves the left side to the title');
  assert.equal(explorerGeometry(768, 520).stackX, 0);
  for (const [w, h] of [[1440, 750], [1280, 650], [768, 520], [390, 400], [0, 0]]) {
    const g = explorerGeometry(w, h);
    assert.ok(Math.abs(g.cardH / g.cardW - 620 / 900) < 0.01, 'covers keep their ratio');
    assert.ok(g.pitch > 0 && g.perspective > 0);
  }
});

test('the ring places six covers evenly round the label, the first at the top', () => {
  const g = explorerGeometry(1280, 650);
  const poses = [0, 1, 2, 3, 4, 5].map(index => ringPose(index, g));
  assert.ok(Math.abs(poses[0].x) < 1e-9 && poses[0].y < 0);
  poses.forEach(pose => assert.ok(Math.abs(Math.hypot(pose.x, pose.y) - g.ringRadius) < 1e-6));
  // Neighbours are 60° apart; a cover never turns more than a quarter turn.
  assert.ok(Math.abs(Math.hypot(poses[1].x - poses[0].x, poses[1].y - poses[0].y) - g.ringRadius) < 1e-6);
  poses.forEach(pose => assert.ok(pose.turn > -90 && pose.turn <= 90));
  assert.equal(halfTurn(180), 0);
  assert.equal(halfTurn(-90), 90);
  assert.equal(halfTurn(135), -45);
  const spun = ringPose(0, g, 90);
  assert.ok(Math.abs(spun.x - g.ringRadius) < 1e-6 && Math.abs(spun.y) < 1e-6, 'a quarter spin moves the first cover to the right');
});

test('the stack keeps the active cover in front and neighbours above and below', () => {
  const g = explorerGeometry(1280, 650);
  const active = stackPose(0, g);
  assert.equal(active.y, 0);
  assert.equal(active.opacity, 1);
  assert.equal(active.tilt + 0, 0);
  const above = stackPose(-1, g);
  const below = stackPose(1, g);
  assert.ok(above.y < 0 && below.y > 0);
  assert.ok(above.z < 0 && below.z < 0, 'neighbours recede');
  assert.ok(above.tilt > 0 && below.tilt < 0, 'neighbours tip away round a horizontal axis');
  // Neighbours stay opaque (real occlusion) and are dimmed by a shade instead.
  assert.equal(above.opacity, 1);
  assert.ok(above.shade > 0 && stackPose(-2, g).shade > above.shade && active.shade === 0);
  assert.equal(stackPose(3, g).opacity, 0);
  assert.ok(stackOrder(0, 6) > stackOrder(1, 6) && stackOrder(1, 6) > stackOrder(2, 6));
  const phone = explorerGeometry(390, 400);
  const peek = stackPose(1, phone);
  assert.equal(peek.tilt, 0);
  assert.ok(peek.y > 0 && peek.scale < 1);
});

test('blending runs from the ring pose to the stack pose', () => {
  const g = explorerGeometry(1280, 650);
  const ring = ringPose(2, g);
  const stack = stackPose(2, g);
  assert.deepEqual(blendPose(ring, stack, 0), ring);
  assert.deepEqual(blendPose(ring, stack, 1), stack);
  const half = blendPose(ring, stack, 0.5);
  assert.ok(Math.abs(half.x - (ring.x + stack.x) / 2) < 1e-9);
  assert.match(poseTransform(half), /^translate3d\(-?[\d.]+px, -?[\d.]+px, -?[\d.]+px\) rotateZ\(-?[\d.]+deg\) rotateX\(-?[\d.]+deg\) scale\([\d.]+\)$/);
});

test('the ring opens in a short cascade, nearest cover first', () => {
  assert.equal(cascadeMix(0, 0, 6), 0);
  assert.equal(cascadeMix(1, 5, 6), 1);
  assert.ok(cascadeMix(0.3, 0, 6) > cascadeMix(0.3, 5, 6));
  assert.equal(cascadeMix(0.2, 5, 6), 0, 'the farthest cover waits');
  assert.ok(travelDuration(1) >= 560 && travelDuration(5) <= 1000);
});

test('the wheel opens the ring, steps through, and releases at both ends', () => {
  assert.equal(wheelAction({ mode: 'ring', index: 0, count: 6, direction: 1 }), 'open');
  assert.equal(wheelAction({ mode: 'ring', index: 0, count: 6, direction: -1 }), 'release');
  assert.equal(wheelAction({ mode: 'stack', index: 2, count: 6, direction: 1 }), 'next');
  assert.equal(wheelAction({ mode: 'stack', index: 2, count: 6, direction: -1 }), 'previous');
  assert.equal(wheelAction({ mode: 'stack', index: 5, count: 6, direction: 1 }), 'release');
  assert.equal(wheelAction({ mode: 'stack', index: 0, count: 6, direction: -1 }), 'close');
  assert.equal(wheelAction({ mode: 'stack', index: 0, count: 6, direction: -1, ring: false }), 'release');
  assert.equal(wheelWants({ mode: 'stack', index: 5, count: 6, direction: 1 }), false);
  assert.equal(wheelWants({ mode: 'stack', index: 0, count: 6, direction: 0 }), false);
});

test('a wheel gesture belongs to the page unless it starts with the explorer in view', () => {
  assert.equal(wheelOwner({ fresh: true, inView: true, wants: true }), 'explorer');
  assert.equal(wheelOwner({ fresh: true, inView: false, wants: true }), 'page');
  assert.equal(wheelOwner({ fresh: true, inView: true, wants: false }), 'page');
  // Mid-gesture: the page never loses a gesture it owns, the explorer gives it
  // up as soon as it reaches an end.
  assert.equal(wheelOwner({ previous: 'page', fresh: false, inView: true, wants: true }), 'page');
  assert.equal(wheelOwner({ previous: 'explorer', fresh: false, inView: true, wants: true }), 'explorer');
  assert.equal(wheelOwner({ previous: 'explorer', fresh: false, inView: true, wants: false }), 'page');
  assert.equal(visibleShare(100, 700, 800), 1);
  assert.equal(visibleShare(-300, 300, 800), 0.5);
  assert.equal(visibleShare(900, 1200, 800), 0);
  assert.equal(wheelPixels({ deltaY: 3, deltaMode: 1 }), 48);
  assert.equal(wheelPixels({ deltaY: 1, deltaMode: 2 }, 700), 700);
  assert.equal(wheelPixels({ deltaY: -40 }), -40);
});

test('drags, keys and indexes stay inside the list', () => {
  assert.equal(dragTarget({ origin: 2, position: 2.1, pitch: 160, count: 6 }), 2);
  assert.equal(dragTarget({ origin: 2, position: 2.4, pitch: 160, count: 6 }), 3);
  assert.equal(dragTarget({ origin: 2, position: 1.7, pitch: 160, count: 6 }), 1);
  assert.equal(dragTarget({ origin: 5, position: 5.6, velocity: 0.01, pitch: 160, count: 6 }), 5);
  assert.equal(dragTarget({ origin: 0, position: -0.4, pitch: 160, count: 6 }), 0);
  assert.equal(dragTarget({ origin: 1, position: 1.2, velocity: 0.02, pitch: 160, count: 6 }), 3);
  assert.equal(keyTarget('ArrowDown', 0, 6), 1);
  assert.equal(keyTarget('ArrowRight', 5, 6), 5);
  assert.equal(keyTarget('ArrowUp', 0, 6), 0);
  assert.equal(keyTarget('End', 1, 6), 5);
  assert.equal(keyTarget('Home', 4, 6), 0);
  assert.equal(keyTarget('PageDown', 1, 6), null, 'page keys keep scrolling the page');
  assert.equal(keyTarget('Enter', 1, 6), null);
  assert.equal(clampIndex(9, 6), 5);
  assert.equal(clampIndex(-2, 6), 0);
  assert.equal(clampIndex(Number.NaN, 6), 0);
  assert.equal(counterLabel(1, 6), '02 / 06');
});

test('the ring shows the active project too: title, category and a way into its case study', async () => {
  const js = await readFile(new URL('../web/explorer.js', import.meta.url), 'utf8');
  const caption = section.match(/<div class="explorer-caption"[\s\S]*?<\/div>/)?.[0] || '';
  assert.match(caption, /^<div class="explorer-caption" aria-hidden="true" hidden>/);
  // A pointer convenience: out of the tab order (the active cover is the same link for keys and screen readers).
  assert.match(caption, /<a class="explorer-caption-open mono" href="\.\/projects\/agent-workflow\.html" tabindex="-1">CASE STUDY <span class="icon icon-arrow-ne" aria-hidden="true"><\/span><\/a>/);
  assert.match(js, /captionOpen\.setAttribute\('href', href\)/);
  // Visible in both modes; in the ring it sits under the index (desktop) or beside it (tablet).
  assert.doesNotMatch(css, /\.explorer\.is-ready \.explorer-caption \{[^}]*(visibility: hidden|opacity: 0)/);
  assert.match(css, /\[data-explorer-mode="ring"\] \.explorer-caption \{ top: auto; bottom: 64px; left: auto; right: 0;/);
  assert.match(css, /\[data-explorer-mode="ring"\] \.explorer-caption-open \{ display: inline-flex; \}/);
  assert.match(css, /\.explorer-caption-open \{[^}]*min-height: 44px/);
  // The tour does not build it, so it waits out the tour.
  assert.match(css, /html\.agentic-touring \.explorer\.is-ready \[data-explorer-mode="ring"\] \.explorer-caption \{ visibility: hidden; \}/);
});

// Each story's facts, as explorer.js reads them (dl rows; a row of tags is the stack).
const STORY_IDS = ['project-agents', 'project-bci', 'project-chatbot', 'project-voicelab', 'project-work-helper', 'project-barking'];
const storyFacts = id => {
  const story = work.match(new RegExp(`<section id="${id}" class="project-story"[\\s\\S]*?</section>`))?.[0] || '';
  const rows = [...(story.match(/<dl>([\s\S]*?)<\/dl>/)?.[1] || '').matchAll(/<div><dt>([^<]+)<\/dt><dd>([\s\S]*?)<\/dd><\/div>/g)];
  const tags = rows.flatMap(([, , value]) => [...value.matchAll(/<li>([^<]+)<\/li>/g)].map(match => match[1]));
  return {
    story,
    rows: rows.filter(([, , value]) => !value.includes('<li>')).map(([, term, value]) => [term, value]),
    tags,
    lab: story.match(/<a class="text-link story-lab-link" href="([^"]+)"/)?.[1] || null,
  };
};

test('every project has facts in its story, in the explorer order', () => {
  STORY_IDS.forEach((id, index) => {
    const facts = storyFacts(id);
    // explorer.js pairs a cover with the story whose case-study link matches.
    assert.match(facts.story, new RegExp(`class="text-link story-case-link" href="\\./projects/${SLUGS[index]}\\.html"`), `${id} is project ${index + 1}`);
    assert.ok(facts.rows.length + (facts.tags.length ? 1 : 0) >= 2, `${id}: at least two facts`);
    facts.rows.forEach(([term, value]) => assert.ok(term.trim() && value.trim() && !/</.test(value), `${id}: ${term} is plain text`));
  });
  assert.deepEqual(storyFacts('project-bci').rows, [['Role', 'Lead researcher, Sep 2021 – May 2023'], ['Result', '+15% classification accuracy']]);
  assert.deepEqual(storyFacts('project-chatbot').rows, [['Award', '1st Place, KSU CDay 2024']]);
  assert.deepEqual(storyFacts('project-chatbot').tags, ['LLM', 'Sentiment analysis']);
  // Only the chatbot's story has the evaluation lab link.
  assert.deepEqual(STORY_IDS.map(id => storyFacts(id).lab), [null, null, './lab/sentiment-eval.html', null, null, null]);
});

test('the explorer builds the facts from the stories with textContent, and announces only the title', async () => {
  const js = await readFile(new URL('../web/explorer.js', import.meta.url), 'utf8');
  assert.doesNotMatch(js, /innerHTML|insertAdjacentHTML|outerHTML/);
  assert.match(js, /const node = document\.createElement\(tag\);/);
  assert.match(js, /if \(text !== undefined\) node\.textContent = text;/);
  assert.match(js, /document\.querySelectorAll\('\.project-stories \.project-story'\)/);
  assert.match(js, /story\.querySelector\('\.story-case-link'\)\?\.getAttribute\('href'\) === href/);
  assert.match(js, /element\(document, 'dl', 'explorer-facts-list'\)/);
  assert.match(js, /element\(document, 'dt', 'mono', term\), element\(document, 'dd', '', value\)/);
  assert.match(js, /const FACT_ROWS = 3;/);
  assert.match(js, /const FACT_TAGS = 5;/);
  assert.match(js, /`\+\$\{rest\}`/);
  assert.match(js, /story\.querySelector\('\.story-lab-link'\)/);
  // Every change of project switches the panel (wheel, drag, keys, index and tour all go through showCaption).
  assert.match(js, /panel\.classList\.toggle\('is-active', active\);\s*\/\/[^\n]*\n\s*panel\.toggleAttribute\('inert', !active\);/);
  // The live region stays short: title, position, category.
  assert.match(js, /live\.textContent = `\$\{project\.title\}, project \$\{index \+ 1\} of \$\{count\}\$\{project\.spoken \? `, \$\{project\.spoken\}` : ''\}\.`;/);
  // Focus inside a panel about to go inert moves to the new cover first.
  const show = js.slice(js.indexOf('function showCaption'), js.indexOf('function render'));
  assert.ok(show.indexOf("links[index]?.focus({ preventScroll: true })") > 0);
  assert.ok(show.indexOf('panel.contains(focused)') < show.indexOf("panel.toggleAttribute('inert'"), 'focus moves before the panel goes inert');
});

test('tablets keep one caption layout in ring and stack; the lab link has a 44px hit area', () => {
  // The desktop ring's narrow-column facts rules stay on desktop.
  const desktop = css.slice(css.indexOf('@media (min-width: 1100px) {'));
  assert.match(desktop, /^@media \(min-width: 1100px\) \{\s*\.explorer\.is-ready \[data-explorer-mode="ring"\] \.explorer-facts \{ min-height: \d+px;[^}]*\}\s*\.explorer\.is-ready \[data-explorer-mode="ring"\] \.explorer-fact \{ grid-template-columns: minmax\(0, 1fr\);/);
  assert.equal(css.match(/\[data-explorer-mode="ring"\] \.explorer-fact \{/g).length, 1);
  const tablet = css.slice(css.indexOf('@media (max-width: 1099px)'), css.indexOf('@media (max-width: 699px)'));
  assert.match(tablet, /\[data-explorer-mode="ring"\] \.explorer-caption-title \{ line-height: \.88; \}/);
  assert.match(tablet, /\[data-explorer-mode="ring"\] \.explorer-caption-lead \{ display: block; \}/);
  assert.match(tablet, /\.explorer\.is-ready \.explorer-caption-open \{ display: inline-flex; \}/);
  // Hidden, not removed, in the stack: it keeps its place. Never visibility: visible (the tour hides the ring caption).
  assert.match(tablet, /\[data-explorer-mode="stack"\] \.explorer-caption-open \{ visibility: hidden; \}/);
  assert.doesNotMatch(css, /explorer-caption-open \{[^}]*visibility: visible/);
  const phone = css.slice(css.indexOf('@media (max-width: 699px)'));
  assert.match(phone, /\.explorer\.is-ready \.explorer-caption-open \{ display: none; \}/);
  assert.match(css, /\.explorer-facts-link \{ position: relative;/);
  assert.match(css, /\.explorer-facts-link::before \{ content: ""; position: absolute; top: calc\(50% - 22px\); bottom: calc\(50% - 22px\); left: min\(0px, calc\(50% - 22px\)\); right: min\(0px, calc\(50% - 22px\)\); \}/);
});

test('the facts block keeps its height, crossfades, and reads at 11px+ with 4.5:1 contrast', () => {
  // All six panels share one grid cell: the block is as tall as the tallest.
  assert.match(css, /\.explorer-facts \{ display: grid; min-height: \d+px;/);
  assert.match(css, /\.explorer-facts-panel \{ grid-area: 1 \/ 1;[^}]*opacity: 0; visibility: hidden; transition: opacity/);
  assert.match(css, /\.explorer-facts-panel\.is-active \{ opacity: 1; visibility: visible;/);
  // A reserved height per breakpoint: desktop stack, the ring column, tablet and phones (in the flow).
  assert.match(css, /\[data-explorer-mode="ring"\] \.explorer-facts \{ min-height: \d+px;/);
  const tablet = css.slice(css.indexOf('@media (max-width: 1099px)'), css.indexOf('@media (max-width: 699px)'));
  assert.match(tablet, /\.explorer-facts \{ min-height: \d+px; \}/);
  assert.match(tablet, /\.explorer-caption-title \{ min-height: 1\.76em; \}/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{[^@]*\.explorer-facts-panel, \.explorer-facts-panel\.is-active \{ transition: none; \}/);
  // Short desktop windows give up the tags, then the facts, in the ring only.
  assert.match(css, /\(min-width: 1480px\) and \(max-height: 729px\) \{\s*\.explorer\.is-ready \[data-explorer-mode="ring"\] \.explorer-fact-stack \{ display: none; \}/);
  // Type: mono labels on the label token, values at 14px, tags at 12px.
  assert.match(css, /\.explorer-fact dt \{[^}]*font-size: var\(--text-label\);[^}]*text-transform: uppercase;/);
  assert.match(css, /\.explorer-fact dd \{[^}]*font-size: 14px;/);
  assert.match(css, /\.explorer \.explorer-tags li \{[^}]*font-size: 12px;/);
  assert.match(css, /\.explorer-facts-link \{[^}]*font-size: var\(--text-label\);[^}]*pointer-events: auto;/);
  const lum = hex => {
    const [r, g, b] = [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const ratio = (a, b) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);
  const quiet = /--explorer-quiet: #([0-9a-f]{6});/.exec(css)[1];
  const value = /\.explorer-fact dd \{[^}]*color: #([0-9a-f]{6});/.exec(css)[1];
  const tag = /\.explorer \.explorer-tags li \{[^}]*background: #([0-9a-f]{6}); color: #([0-9a-f]{6});/.exec(css);
  for (const [fg, bg] of [[quiet, '101114'], [value, '101114'], [tag[2], tag[1]], [quiet, tag[1]], ['c7d2a8', '101114']]) {
    assert.ok(ratio(fg, bg) >= 4.5, `#${fg} on #${bg}: ${ratio(fg, bg).toFixed(2)}`);
  }
});

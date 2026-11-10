import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  explorerTier, explorerGeometry, clampIndex, halfTurn, ringPose, stackPose, blendPose, poseTransform,
  stackOrder, cascadeMix, travelDuration, wheelPixels, wheelWants, wheelAction, wheelOwner, visibleShare,
  dragTarget, keyTarget, counterLabel,
} from '../web/explorer-state.js';

const html = await readFile(new URL('../web/index.html', import.meta.url), 'utf8');
const css = await readFile(new URL('../web/explorer.css', import.meta.url), 'utf8');
const entrance = await readFile(new URL('../web/entrance.js', import.meta.url), 'utf8');
const SLUGS = ['agent-workflow', 'thoughts-to-text', 'companion-chatbot', 'voicelab', 'work-helper', 'barking-village'];
const section = html.match(/<section id="projects"[\s\S]*?\n {4}<\/section>/)?.[0] || '';

test('the project index sits between the ribbon gallery and skills, on the Work nav item', () => {
  assert.ok(section, '#projects section exists');
  const order = [...html.matchAll(/<section id="([^"]+)"/g)].map(match => match[1]).filter(id => !id.startsWith('project-'));
  assert.deepEqual(order.slice(order.indexOf('work'), order.indexOf('work') + 3), ['work', 'projects', 'skills']);
  assert.match(section, /^<section id="projects" class="explorer dark-section" data-nav-section="work" aria-labelledby="projects-title">/);
  assert.match(section, /<h2 id="projects-title">/);
  // Its mono label is unnumbered, so the 01–07 section labels still count up.
  assert.doesNotMatch(section, /class="section-top mono"><span>\d{2} \//);
});

test('every project links to its case study, in order, with a cover and a name', () => {
  const links = [...section.matchAll(/<a class="explorer-card" href="\.\/projects\/([a-z-]+)\.html" aria-label="([^"]+)">/g)];
  assert.deepEqual(links.map(match => match[1]), SLUGS);
  links.forEach(([, slug, label]) => {
    assert.match(label, /Read the case study\.$/);
    assert.match(section, new RegExp(`src="\\./assets/${slug}\\.svg"`));
  });
  const names = [...section.matchAll(/<span class="explorer-card-name">([^<]+)<\/span>/g)].map(match => match[1]);
  assert.deepEqual(names, ['Multi-Agent Workflow', 'Thoughts-to-Text BCI', 'Companionship Chatbot', 'VoiceLab', 'Work Helper', 'Barking Village']);
  // Titles match the project stories exactly.
  names.forEach(name => assert.ok(html.includes(`-title">${name}</h3>`), `story title for ${name}`));
});

test('the index is a list of buttons, one per project, with a live region beside it', () => {
  const picks = [...section.matchAll(/<button class="explorer-pick" type="button" data-explorer-pick="(\d)">/g)].map(match => Number(match[1]));
  assert.deepEqual(picks, [0, 1, 2, 3, 4, 5]);
  assert.match(section, /<ol role="list" aria-labelledby="projects-index-label">/);
  assert.match(section, /class="explorer-live visually-hidden" aria-live="polite" aria-atomic="true"/);
  // Script-only parts start hidden so the no-script page is a plain list.
  for (const part of ['explorer-caption', 'explorer-index', 'explorer-hint']) assert.match(section, new RegExp(`class="${part}[^"]*"[^>]*hidden>`));
  assert.match(section, /<a href="#skills">CONTINUE TO SKILLS/);
});

test('the build tour has an Index stop right after Projects', () => {
  const work = entrance.indexOf("{ sel: '#work', name: 'Projects'");
  const index = entrance.indexOf("{ sel: '#projects', name: 'Index'");
  const skills = entrance.indexOf("{ sel: '#skills', name: 'Skills'");
  assert.ok(work > 0 && index > work && skills > index);
  // A light stop (the tour's total length is budgeted).
  const weight = Number(entrance.slice(index, skills).match(/weight: ([\d.]+)/)?.[1]);
  assert.ok(weight > 0 && weight <= 0.5, `Index weight ${weight}`);
});

test('reduced motion and touch have their own paths in the stylesheet', () => {
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /touch-action: pan-y/);
  assert.match(css, /@media \(max-width: 699px\)/);
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

// Circular / stacked work explorer (SPECIFICATION V07), the site's one project
// gallery, in #work. Progressive enhancement: without this script it is a
// plain list of case-study links.
//
// At rest the six covers sit in a ring round the "All projects" label. Any
// deliberate input (wheel over the stage, drag, arrow keys, the index, a click
// on a cover) turns the ring into a vertical drum: the active cover faces the
// visitor near the centre and its neighbours tip away above and below. One
// selection drives the covers, the large caption, the index and the live
// announcement. Per frame only transform and opacity are written.
import {
  explorerGeometry, ringPose, stackPose, blendPose, poseTransform, stackOrder, cascadeMix,
  easeOutExpo, travelDuration, wheelPixels, wheelAction, wheelWants, wheelOwner,
  dragTarget, keyTarget, counterLabel, clampIndex,
} from './explorer-state.js';

const MODE_MS = 900; // ring <-> stack
const GESTURE_GAP = 220; // ms of wheel silence that ends a gesture
const WHEEL_STEP = 56; // px of wheel per project
const WHEEL_COOLDOWN = 300; // ms between wheel steps (trackpad momentum)
const IN_VIEW = 0.86; // share of the stage that must be visible to take the wheel
const SPIN = 3; // deg/s: the ring's idle drift
const EASE = 'cubic-bezier(.16, 1, .3, 1)';
const INDEX_GAP = 32; // px kept between the ring and the index column (desktop)
const FACT_ROWS = 3; // term/value rows shown per project
const FACT_TAGS = 5; // stack tags shown before "+N"
const LAB_LABEL = 'How I evaluate a classifier (public data)';

const clean = value => (value || '').replace(/\s+/g, ' ').trim();
function element(document, tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

// A project's facts, read from its story below the explorer (the no-script
// fallback and the one source of truth): term/value rows, the stack as tags,
// and the evaluation lab link when the story has one.
export function readFacts(story) {
  const facts = { rows: [], stackTerm: '', stack: [], lab: null };
  if (!story) return facts;
  story.querySelectorAll('dl > div').forEach(row => {
    const term = clean(row.querySelector('dt')?.textContent);
    const value = row.querySelector('dd');
    if (!term || !value) return;
    const tags = [...value.querySelectorAll('li')].map(tag => clean(tag.textContent)).filter(Boolean);
    if (tags.length) { facts.stackTerm = term; facts.stack = tags; }
    else if (clean(value.textContent)) facts.rows.push({ term, value: clean(value.textContent) });
  });
  const lab = story.querySelector('.story-lab-link');
  const href = lab?.getAttribute('href');
  if (href) facts.lab = { href, note: clean(lab.querySelector('.visually-hidden')?.textContent).replace(/^:\s*/, '') };
  return facts;
}

// One facts panel, built with createElement/textContent only (never HTML from data).
function buildFacts(document, title, facts) {
  const panel = element(document, 'div', 'explorer-facts-panel');
  panel.setAttribute('role', 'group');
  panel.setAttribute('aria-label', `${title}: key facts`);
  const list = element(document, 'dl', 'explorer-facts-list');
  facts.rows.slice(0, FACT_ROWS).forEach(({ term, value }) => {
    const row = element(document, 'div', 'explorer-fact');
    row.append(element(document, 'dt', 'mono', term), element(document, 'dd', '', value));
    list.append(row);
  });
  if (facts.stack.length) {
    const row = element(document, 'div', 'explorer-fact explorer-fact-stack');
    const value = element(document, 'dd');
    const tags = element(document, 'ul', 'tag-list explorer-tags');
    tags.setAttribute('role', 'list');
    facts.stack.slice(0, FACT_TAGS).forEach(tag => tags.append(element(document, 'li', '', tag)));
    const rest = facts.stack.length - FACT_TAGS;
    if (rest > 0) {
      const more = element(document, 'li', 'explorer-tag-more', `+${rest}`);
      more.append(element(document, 'span', 'visually-hidden', ' more'));
      tags.append(more);
    }
    value.append(tags);
    row.append(element(document, 'dt', 'mono', facts.stackTerm), value);
    list.append(row);
  }
  panel.append(list);
  if (facts.lab) {
    const line = element(document, 'p', 'explorer-facts-more');
    const link = element(document, 'a', 'explorer-facts-link mono', LAB_LABEL);
    link.setAttribute('href', facts.lab.href);
    if (facts.lab.note) link.append(element(document, 'span', 'visually-hidden', `: ${facts.lab.note}`));
    const arrow = element(document, 'span', 'icon icon-arrow-e');
    arrow.setAttribute('aria-hidden', 'true');
    link.append(' ');
    link.append(arrow);
    line.append(link);
    panel.append(line);
  }
  return panel;
}

export function initExplorer(document, window) {
  const section = document.querySelector('#work .explorer');
  const stage = section?.querySelector('.explorer-stage');
  const list = stage?.querySelector('.explorer-covers');
  if (!stage || !list) return null;
  const items = [...list.querySelectorAll('.explorer-item')];
  const count = items.length;
  if (!count) return null;
  const links = items.map(item => item.querySelector('.explorer-card'));
  const picks = [...stage.querySelectorAll('[data-explorer-pick]')];
  const caption = stage.querySelector('.explorer-caption');
  const captionTitle = caption?.querySelector('.explorer-caption-title');
  const captionCategory = caption?.querySelector('.explorer-caption-category');
  const captionCount = caption?.querySelector('.explorer-caption-count');
  const captionLead = caption?.querySelector('.explorer-caption-lead');
  // The ring caption's way in: the active cover's own link, for the pointer only.
  const captionOpen = caption?.querySelector('.explorer-caption-open');
  const indexBox = stage.querySelector('.explorer-index');
  const indexCount = stage.querySelector('.explorer-index-count');
  const live = stage.querySelector('.explorer-live');
  const root = document.documentElement;
  const text = (item, selector) => item.querySelector(selector)?.textContent.trim() || '';
  const projects = items.map((item, index) => {
    const title = text(item, '.explorer-card-name');
    // The link's label carries the category in sentence case, then the cover's
    // description ("Name, category: what the cover shows. …"); announce only the category.
    const label = links[index]?.getAttribute('aria-label') || '';
    const spoken = label.startsWith(`${title}, `) ? label.slice(title.length + 2).split('. ')[0].split(': ')[0] : '';
    return {
      title,
      category: text(item, '.explorer-card-category').replace(/^\d+\s*\/\s*/, ''),
      spoken,
      lead: text(item, '.explorer-card-lead'),
    };
  });
  // Each cover's story is the one whose case-study link matches the cover's.
  const stories = [...document.querySelectorAll('.project-stories .project-story')];
  const storyFor = href => stories.find(story => href && story.querySelector('.story-case-link')?.getAttribute('href') === href);
  // The active project's facts, one panel per project stacked in one cell,
  // so the block is as tall as the tallest and nothing below it moves.
  const factsBox = caption ? element(document, 'div', 'explorer-facts') : null;
  const factPanels = factsBox ? items.map((_, index) => {
    const panel = buildFacts(document, projects[index].title, readFacts(storyFor(links[index]?.getAttribute('href'))));
    factsBox.append(panel);
    return panel;
  }) : [];
  if (factsBox) {
    if (captionOpen) caption.insertBefore(factsBox, captionOpen);
    else caption.append(factsBox);
    // The caption's title, category and links repeat the active cover (hidden
    // from screen readers); the facts are new, so they are read.
    caption.removeAttribute('aria-hidden');
    [captionTitle, captionCategory?.parentElement, captionLead, captionOpen].forEach(part => part?.setAttribute('aria-hidden', 'true'));
  }

  const motion = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  const reduced = () => Boolean(motion?.matches);
  const raf = window.requestAnimationFrame?.bind(window);
  const cancelRaf = window.cancelAnimationFrame?.bind(window);
  const now = () => window.performance?.now?.() ?? Date.now();
  const touring = () => root.classList.contains('agentic-running') || root.classList.contains('agentic-touring');

  const state = {
    index: 0,
    position: 0,
    mode: 'ring',
    mixes: items.map(() => 0),
    spin: 0,
    geometry: explorerGeometry(0, 0, { count }),
    travel: null,
    modeTween: null,
    frame: 0,
    last: 0,
    onScreen: false,
    hover: false,
    hidden: document.visibilityState === 'hidden',
    width: -1,
    height: -1,
  };
  // Last values written per cover, so unchanged styles are not rewritten.
  const written = items.map(() => ({ transform: '', opacity: -1, shade: -1, order: -1 }));
  // A dark veil per cover (decoration) dims the neighbours without making them see-through.
  const shades = links.map(link => {
    const shade = document.createElement('span');
    shade.className = 'explorer-shade';
    shade.setAttribute('aria-hidden', 'true');
    link.append(shade);
    return shade;
  });

  // ---- Geometry: read layout on resize only. ----
  function measure() {
    // The deck (the covers' box) sets the geometry: the whole stage on
    // desktop, the area above the caption and index on smaller screens.
    const width = list.clientWidth || 0;
    const height = list.clientHeight || 0;
    const viewport = window.innerWidth || root.clientWidth || width;
    const viewportHeight = window.innerHeight || root.clientHeight || height;
    // Desktop keeps the ring clear of the index column on the right.
    const reserve = indexBox?.offsetWidth ? indexBox.offsetWidth + INDEX_GAP : 0;
    if (width === state.width && height === state.height && viewport === state.viewport
      && viewportHeight === state.viewportHeight && reserve === state.reserve) return;
    state.width = width;
    state.height = height;
    state.viewport = viewport;
    state.viewportHeight = viewportHeight;
    state.reserve = reserve;
    const geometry = explorerGeometry(width, height, { count, viewport, viewportHeight, reserve });
    state.geometry = geometry;
    const vars = {
      '--explorer-card-w': `${geometry.cardW}px`, '--explorer-card-h': `${geometry.cardH}px`,
      '--explorer-stack-x': `${geometry.stackX}px`, '--explorer-ring-x': `${geometry.ringX}px`,
      '--explorer-perspective': `${geometry.perspective}px`,
    };
    Object.entries(vars).forEach(([name, value]) => stage.style.setProperty(name, value));
    stage.dataset.explorerTier = geometry.tier;
    // Phones have no ring: they always show the deck.
    if (!geometry.ring && state.mode !== 'stack') setMode('stack', { instant: true });
    paint();
    wake();
  }

  // ---- Paint: transform and opacity per cover; z-order only when it changes. ----
  function paint() {
    const geometry = state.geometry;
    items.forEach((item, index) => {
      const offset = index - state.position;
      const mix = geometry.ring ? state.mixes[index] : 1;
      const stack = stackPose(offset, geometry);
      const pose = mix >= 1 ? stack : blendPose(ringPose(index, geometry, state.spin), stack, mix);
      const record = written[index];
      const transform = poseTransform(pose);
      if (transform !== record.transform) { item.style.transform = transform; record.transform = transform; }
      const opacity = Math.round(pose.opacity * 1000) / 1000;
      if (opacity !== record.opacity) {
        item.style.opacity = String(opacity);
        record.opacity = opacity;
        // Away covers ignore the pointer; the selected one never counts as away.
        const away = opacity < 0.02 && index !== state.index;
        if (item.hasAttribute('data-away') !== away) item.toggleAttribute('data-away', away);
      }
      const shade = Math.round(pose.shade * 1000) / 1000;
      if (shade !== record.shade) { shades[index].style.opacity = String(shade); record.shade = shade; }
      const order = mix > 0.5 ? stackOrder(offset, count) : 1;
      if (order !== record.order) { item.style.zIndex = String(order); record.order = order; }
    });
  }

  // ---- One rAF loop, alive only while something moves. ----
  function spinning() {
    return state.geometry.ring && state.mode === 'ring' && !state.modeTween && state.onScreen && !state.hover
      && !state.hidden && !reduced() && !touring() && !gesture?.dragging;
  }
  function schedule() {
    if (!state.frame && raf) state.frame = raf(frame);
  }
  function wake() {
    if (spinning()) { state.last = 0; schedule(); }
  }
  function frame(time) {
    state.frame = 0;
    const elapsed = state.last ? Math.min(64, time - state.last) : 0;
    state.last = time;
    let busy = false;
    const travel = state.travel;
    if (travel) {
      const progress = (time - travel.start) / travel.duration;
      if (progress >= 1) { state.position = travel.to; state.travel = null; }
      else { state.position = travel.from + (travel.to - travel.from) * easeOutExpo(Math.max(0, progress)); busy = true; }
    }
    const tween = state.modeTween;
    if (tween) {
      const progress = Math.max(0, (time - tween.start) / tween.duration);
      state.mixes = tween.from.map((from, index) => from + (tween.to - from) * cascadeMix(progress, tween.ranks[index], count));
      if (progress >= 1) { state.mixes = items.map(() => tween.to); state.modeTween = null; }
      else busy = true;
    }
    if (gesture?.dragging) busy = true;
    if (spinning()) { state.spin = (state.spin + (SPIN * elapsed) / 1000) % 360; busy = true; }
    paint();
    if (busy) schedule();
    else { state.last = 0; stage.classList.remove('is-moving'); }
  }
  function finishMotion() {
    if (state.frame) { cancelRaf?.(state.frame); state.frame = 0; }
    state.last = 0;
    if (state.travel) { state.position = state.travel.to; state.travel = null; }
    if (state.modeTween) { state.mixes = items.map(() => state.modeTween.to); state.modeTween = null; }
    stage.classList.remove('is-moving');
    paint();
  }
  const animated = () => Boolean(raf) && !reduced() && state.onScreen;

  function travelTo(index) {
    const distance = index - state.position;
    if (!animated() || Math.abs(distance) < 0.0005) {
      state.travel = null;
      state.position = index;
      paint();
      return;
    }
    state.travel = { from: state.position, to: index, start: now(), duration: travelDuration(distance) };
    stage.classList.add('is-moving');
    schedule();
  }

  function setMode(mode, { instant = false } = {}) {
    const next = state.geometry.ring || state.width < 0 ? mode : 'stack';
    if (state.mode === next) return;
    state.mode = next;
    stage.dataset.explorerMode = next;
    // The caption changes place with the mode (desktop): fade it in where it lands.
    if (!instant && typeof caption?.animate === 'function') {
      caption.animate([{ opacity: 0 }, { opacity: 1 }], reduced() ? { duration: 120 } : { duration: 520, delay: 160, easing: EASE, fill: 'backwards' });
    }
    const target = next === 'stack' ? 1 : 0;
    if (instant || !animated()) {
      state.modeTween = null;
      state.mixes = items.map(() => target);
      paint();
      wake();
      return;
    }
    state.modeTween = {
      from: [...state.mixes], to: target, start: now(), duration: MODE_MS,
      // The covers nearest the active one move first.
      ranks: items.map((_, index) => Math.abs(index - state.index)),
    };
    stage.classList.add('is-moving');
    schedule();
  }

  // ---- Selection: every input lands here. ----
  let announceTimer = 0;
  function announce(index) {
    if (!live) return;
    window.clearTimeout(announceTimer);
    const project = projects[index];
    announceTimer = window.setTimeout(() => {
      live.textContent = `${project.title}, project ${index + 1} of ${count}${project.spoken ? `, ${project.spoken}` : ''}.`;
    }, 160);
  }
  function showCaption(index, direction) {
    const project = projects[index];
    if (captionTitle) captionTitle.textContent = project.title;
    if (captionCategory) captionCategory.textContent = project.category;
    if (captionLead) captionLead.textContent = project.lead;
    const href = links[index]?.getAttribute('href');
    if (captionOpen && href) captionOpen.setAttribute('href', href);
    const label = counterLabel(index, count);
    if (captionCount) captionCount.textContent = label;
    if (indexCount) indexCount.textContent = label;
    // Focus in a panel about to go inert (the lab link) would fall to <body>:
    // it moves to the new project's cover instead.
    const focused = document.activeElement;
    if (focused && factPanels.some((panel, at) => at !== index && panel.contains(focused))) {
      links[index]?.focus({ preventScroll: true });
    }
    factPanels.forEach((panel, at) => {
      const active = at === index;
      panel.classList.toggle('is-active', active);
      // Inactive panels are out of sight, the tab order and the reading order.
      panel.toggleAttribute('inert', !active);
    });
    if (!direction || typeof caption?.animate !== 'function') return;
    const keyframes = reduced()
      ? [{ opacity: 0.4 }, { opacity: 1 }]
      : [{ opacity: 0, transform: `translate3d(0, ${direction * 18}px, 0)` }, { opacity: 1, transform: 'none' }];
    caption.animate(keyframes, { duration: reduced() ? 160 : 560, easing: EASE });
  }
  function render(direction = 0, { quiet = false } = {}) {
    items.forEach((item, index) => {
      const active = index === state.index;
      if (active) links[index].setAttribute('aria-current', 'true');
      else links[index].removeAttribute('aria-current');
      links[index].tabIndex = active ? 0 : -1;
      item.classList.toggle('is-active', active);
      if (active) item.removeAttribute('data-away');
    });
    picks.forEach((pick, index) => {
      if (index === state.index) pick.setAttribute('aria-current', 'true');
      else pick.removeAttribute('aria-current');
    });
    showCaption(state.index, direction);
    if (direction && !quiet) announce(state.index);
  }
  function select(index, { quiet = false, travel = true } = {}) {
    const target = clampIndex(index, count);
    const direction = Math.sign(target - state.index);
    state.index = target;
    setMode('stack');
    if (direction) render(direction, { quiet });
    if (travel) travelTo(target);
  }

  // ---- Index list and covers. ----
  picks.forEach(pick => pick.addEventListener('click', () => select(Number(pick.dataset.explorerPick))));
  let suppressClick = false;
  let suppressTimer = 0;
  // Pressing a neighbour cover selects it; it must not take focus first.
  list.addEventListener('mousedown', event => {
    const item = event.target.closest?.('.explorer-item');
    if (item && (state.mode === 'ring' || !item.classList.contains('is-active'))) event.preventDefault();
  }, true);
  // With pointer capture the click after a drag lands on the stage, not the list.
  stage.addEventListener('click', event => {
    if (!suppressClick) return;
    suppressClick = false;
    event.preventDefault();
    event.stopPropagation();
  }, true);
  list.addEventListener('click', event => {
    const link = event.target.closest?.('.explorer-card');
    if (!link) return;
    if (suppressClick) { event.preventDefault(); suppressClick = false; return; }
    // Keyboard and assistive-technology activation (detail 0) always opens the case study.
    if (event.detail === 0 || event.button > 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const index = links.indexOf(link);
    if (state.mode === 'stack' && index === state.index) return;
    event.preventDefault();
    if (index === state.index) setMode('stack');
    else select(index);
  });

  // ---- Keys: arrows move, Home/End jump, Escape returns to the ring. ----
  stage.addEventListener('keydown', event => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key === 'Escape') {
      if (state.mode === 'stack' && state.geometry.ring) { event.preventDefault(); setMode('ring'); }
      return;
    }
    const target = keyTarget(event.key, state.index, count);
    if (target === null) return;
    const onCover = event.target.closest?.('.explorer-card');
    const onPick = event.target.closest?.('[data-explorer-pick]');
    if (!onCover && !onPick) return;
    if (state.mode === 'ring') { event.preventDefault(); setMode('stack'); return; }
    // At either end the key does what it would anywhere else (scrolls the page).
    if (target === state.index) return;
    event.preventDefault();
    select(target, { quiet: Boolean(onCover) });
    (onCover ? links[target] : picks[target])?.focus({ preventScroll: true });
  });

  // ---- Wheel: only over the stage, only when it is in view, never past an end. ----
  const wheel = { last: -Infinity, owner: 'page', direction: 0, sum: 0, until: 0 };
  stage.addEventListener('wheel', event => {
    if (event.ctrlKey || touring()) return;
    const dy = wheelPixels(event, window.innerHeight || 800);
    if (Math.abs(event.deltaX || 0) > Math.abs(dy)) return;
    const time = now();
    const fresh = time - wheel.last > GESTURE_GAP;
    wheel.last = time;
    const direction = Math.sign(dy);
    if (!direction) return;
    if (fresh || direction !== wheel.direction) { wheel.sum = 0; wheel.direction = direction; }
    const context = { mode: state.mode, index: state.index, count, direction, ring: state.geometry.ring };
    let inView = false;
    if (fresh) {
      const bounds = stage.getBoundingClientRect();
      // A stage taller than the window counts as in view once it fills the window.
      const viewport = window.innerHeight || 0;
      const visible = Math.min(bounds.bottom, viewport) - Math.max(bounds.top, 0);
      inView = visible / Math.max(1, Math.min(bounds.bottom - bounds.top, viewport)) >= IN_VIEW;
    }
    wheel.owner = wheelOwner({ previous: wheel.owner, fresh, inView, wants: wheelWants(context) });
    if (wheel.owner !== 'explorer') return;
    event.preventDefault();
    if (time < wheel.until) return;
    wheel.sum += Math.abs(dy);
    if (wheel.sum < WHEEL_STEP) return;
    wheel.sum = 0;
    wheel.until = time + WHEEL_COOLDOWN;
    const action = wheelAction(context);
    if (action === 'open') setMode('stack');
    else if (action === 'close') setMode('ring');
    else if (action === 'next') select(state.index + 1);
    else if (action === 'previous') select(state.index - 1);
  }, { passive: false });

  // ---- Drag and touch: the stack follows the pointer, then settles. ----
  // Mouse and pen drag on either axis; touch only sideways (vertical swipes
  // keep scrolling the page: the stage is touch-action: pan-y).
  let gesture = null;
  function samplePosition(current, time) {
    current.samples.push({ position: state.position, time });
    while (current.samples.length > 2 && time - current.samples[0].time > 100) current.samples.shift();
  }
  function velocityOf(current) {
    const first = current.samples[0];
    const last = current.samples[current.samples.length - 1];
    const elapsed = first && last ? last.time - first.time : 0;
    return elapsed >= 16 ? (last.position - first.position) / elapsed : 0;
  }
  // Past either end the stack gives a little, like a rubber band.
  const band = value => (value < 0 ? value * 0.3 : value > count - 1 ? count - 1 + (value - count + 1) * 0.3 : value);
  stage.addEventListener('pointerdown', event => {
    if (event.button !== 0 || event.isPrimary === false) return;
    if (event.target.closest?.('.explorer-index')) return;
    gesture = { id: event.pointerId, x: event.clientX, y: event.clientY, touch: event.pointerType === 'touch', dragging: false, samples: [] };
  });
  stage.addEventListener('pointermove', event => {
    if (!gesture || gesture.id !== event.pointerId) return;
    const dx = event.clientX - gesture.x;
    const dy = event.clientY - gesture.y;
    if (!gesture.dragging) {
      const ax = Math.abs(dx);
      const ay = Math.abs(dy);
      if (gesture.touch && ay > ax && ay > 9) { gesture = null; return; }
      if (Math.max(ax, ay) < 10) return;
      gesture.axis = gesture.touch || ax > ay ? 'x' : 'y';
      gesture.dragging = true;
      gesture.start = state.position;
      gesture.origin = state.index;
      state.travel = null;
      setMode('stack');
      stage.classList.add('is-dragging');
      stage.setPointerCapture?.(event.pointerId);
    }
    const delta = gesture.axis === 'y' ? dy : dx;
    const pitch = gesture.axis === 'y' ? state.geometry.pitch : Math.max(120, state.geometry.cardW * 0.45);
    gesture.position = band(gesture.start - delta / pitch);
    gesture.pitch = pitch;
    // Reduced motion: no live movement; the release still selects.
    if (reduced()) return;
    state.position = gesture.position;
    samplePosition(gesture, now());
    // Caption and index follow the cover crossing the centre.
    const nearest = clampIndex(state.position, count);
    if (nearest !== state.index) select(nearest, { travel: false, quiet: true });
    if (!raf) paint();
    else schedule();
  });
  function finishGesture(event, cancelled = false) {
    if (!gesture || gesture.id !== event.pointerId) return;
    const current = gesture;
    gesture = null;
    stage.classList.remove('is-dragging');
    if (stage.hasPointerCapture?.(event.pointerId)) stage.releasePointerCapture(event.pointerId);
    if (!current.dragging) return;
    // A drag is never also a click on the cover under the pointer.
    suppressClick = true;
    window.clearTimeout(suppressTimer);
    suppressTimer = window.setTimeout(() => { suppressClick = false; }, 350);
    const velocity = cancelled ? 0 : velocityOf(current);
    const goal = cancelled ? current.origin : dragTarget({ origin: current.origin, position: current.position ?? current.start, velocity, pitch: current.pitch || 1, count });
    select(goal);
    // The caption followed the drag quietly; say where it landed.
    if (goal !== current.origin) announce(goal);
  }
  stage.addEventListener('pointerup', event => finishGesture(event));
  stage.addEventListener('pointercancel', event => finishGesture(event, true));
  stage.addEventListener('dragstart', event => event.preventDefault());

  // ---- Idle drift pauses under the pointer, offscreen, hidden, and during the tour. ----
  stage.addEventListener('pointerenter', event => { if (event.pointerType === 'mouse') state.hover = true; });
  stage.addEventListener('pointerleave', event => { if (event.pointerType === 'mouse') { state.hover = false; wake(); } });
  document.addEventListener('visibilitychange', () => {
    state.hidden = document.visibilityState === 'hidden';
    if (state.hidden) finishMotion();
    else wake();
  });
  if (typeof window.MutationObserver === 'function') {
    new window.MutationObserver(() => wake()).observe(root, { attributes: true, attributeFilter: ['class'] });
  }
  motion?.addEventListener?.('change', () => { if (reduced()) finishMotion(); else wake(); });

  // Offscreen: motion finishes at once, and the explorer is a ring again for
  // the next visit (the selection is kept).
  if (typeof window.IntersectionObserver === 'function') {
    new window.IntersectionObserver(entries => {
      const entry = entries?.[entries.length - 1];
      if (!entry) return;
      state.onScreen = entry.isIntersecting;
      if (state.onScreen) { wake(); return; }
      finishMotion();
      if (state.geometry.ring) setMode('ring', { instant: true });
    }).observe(stage);
  } else state.onScreen = true;
  if (typeof window.ResizeObserver === 'function') new window.ResizeObserver(measure).observe(list);
  // The tier follows the viewport, which can cross a breakpoint without the deck resizing.
  window.addEventListener('resize', measure);

  section.classList.add('is-ready');
  stage.querySelectorAll('.explorer-caption, .explorer-index, .explorer-hint').forEach(element => { element.hidden = false; });
  render();
  measure();
  return {
    get state() { return { index: state.index, mode: state.mode, position: state.position, tier: state.geometry.tier }; },
    select: index => select(index),
    setMode: mode => setMode(mode),
  };
}

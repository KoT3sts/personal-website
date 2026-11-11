// Section reveals, idle-loop control and pointer-led motion. Progressive
// enhancement only: content is complete and visible without this file, and
// nothing the visitor can already see is ever hidden.
import { SECTION_TARGETS } from './section-plan.js';

// Elements the first-visit entrance may trace with cursor frames after a
// cancelled tour. While it may still trace sections, these elements and their
// ancestors keep a stable position so frames stay aligned.
export const ENTRANCE_TRACED = SECTION_TARGETS;

// [selector, variant]. Variants differ only in travel distance and scale.
// The giant section headlines are not here: they rise line by line instead
// (see HEADLINES).
export const REVEAL_GROUPS = [
  ['.capabilities-heading > p', 'rise'], ['.capability', 'rise'],
  ['.experience-heading > p', 'rise'],
  ['.work-heading > p', 'rise'],
  ['.skill-list > div', 'rise'], ['.education-layout > *', 'rise'],
  ['.approach-heading > p', 'rise'], ['.approach-list details', 'rise'],
  ['.closing-note > .mono', 'rise'], ['.closing-note > p', 'heading'],
  ['.contact-intro', 'rise'], ['.contact-actions, #contact > .contact-button', 'rise'], ['.contact-links li', 'rise'],
];

// The oversized section headlines: the site's signature scroll moment.
export const HEADLINES = ['#about-title', '#capabilities-title', '#experience-title', '#work-title', '#skills-title', '#approach-title', '#contact-title'].join(', ');

// Light scenes set type like a press: a crisp rise from behind the line's own
// edge. Dark scenes light it as it surfaces: shorter travel, a fade up from
// dim. Both decelerate exponentially.
export const HEADLINE_EASE = 'cubic-bezier(.19, 1, .22, 1)';
export const HEADLINE_TONES = {
  light: { duration: 900, stagger: 95, travel: 125 },
  dark: { duration: 1150, stagger: 140, travel: 60 },
};
// Clip extents around each line (em): glyph overshoot above, period/descender
// room below and generous sides, so nothing is cropped at rest.
const CLIP = { top: '-.3em', side: '-.5em', bottom: '.18em' };

const LOOPS = ['.hero', '.closing-note', '.contact'];
const STAGGER = 85;
const MAX_STAGGER_STEPS = 4;
const CHIP_CAP = 8;

// Only content wholly below the fold may wait for a reveal.
export function shouldHold(rect, viewportHeight) {
  return rect.top > viewportHeight * 0.92;
}

export function staggerDelay(batchIndex) {
  return Math.min(Math.max(batchIndex, 0), MAX_STAGGER_STEPS) * STAGGER;
}

// Index of the section whose box contains a horizontal line (viewport y), or
// -1. Sections are contiguous, so at a shared edge the lower one wins.
export function sectionAtLine(rects, line) {
  for (let index = rects.length - 1; index >= 0; index -= 1) {
    const rect = rects[index];
    if (rect && rect.top <= line && rect.bottom > line) return index;
  }
  return -1;
}

export function isEntranceTracing(entrance, root) {
  if (root?.classList?.contains('agentic-running') || root?.classList?.contains('agentic-touring')) return true;
  return Boolean(entrance && (entrance.touring || entrance.sectionsEligible || (entrance.phase && entrance.phase !== 'ready')));
}

// ---- Pure helpers (unit tested) ---------------------------------------------

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const isBlank = node => node.nodeType === 3 && !/\S/.test(node.textContent || '');

// How a headline splits. `nodes` are its child nodes. With <br> line breaks,
// every line becomes one block unit and the <br>s go. A single-line headline
// (white-space: nowrap) staggers its words instead: each element child moves
// as itself and each text run is wrapped, with its edge spaces left outside so
// word spacing is unchanged.
export function planHeadline(nodes) {
  const list = [...nodes];
  const breaks = list.flatMap((node, index) => (node.nodeType === 1 && node.nodeName === 'BR' ? [index] : []));
  if (breaks.length) {
    const groups = [[]];
    list.forEach((node, index) => {
      if (breaks.includes(index)) groups.push([]);
      else groups[groups.length - 1].push(index);
    });
    const lines = groups.filter(group => group.some(index => !isBlank(list[index]) && list[index].nodeType !== 8));
    return lines.length > 1 ? { mode: 'lines', lines, breaks } : null;
  }
  const units = [];
  list.forEach((node, index) => {
    if (node.nodeType === 1) units.push({ index, kind: 'element' });
    else if (node.nodeType === 3 && !isBlank(node)) {
      const [, lead, core, trail] = node.textContent.match(/^(\s*)([\s\S]*?)(\s*)$/);
      units.push({ index, kind: 'text', lead, core, trail });
    }
  });
  return units.length > 1 ? { mode: 'words', units } : null;
}

// Each unit masks itself: as it moves down by t% it clips its own bottom by
// the same amount, so the visible part never leaves the line's box.
export function headlineKeyframes(tone) {
  const { travel } = HEADLINE_TONES[tone] || HEADLINE_TONES.light;
  const clip = shift => `inset(${CLIP.top} ${CLIP.side} calc(${shift}% - ${CLIP.bottom}) ${CLIP.side})`;
  const from = { transform: `translate3d(0, ${travel}%, 0)`, clipPath: clip(travel) };
  const to = { transform: 'translate3d(0, 0%, 0)', clipPath: clip(0) };
  if (tone !== 'dark') return [from, to];
  return [{ ...from, opacity: 0, filter: 'brightness(.35)' }, { offset: 0.55, opacity: 1 }, { ...to, opacity: 1, filter: 'brightness(1)' }];
}

export function headlineTiming(tone, index) {
  const { duration, stagger } = HEADLINE_TONES[tone] || HEADLINE_TONES.light;
  return { duration, delay: Math.min(index, 3) * stagger, easing: HEADLINE_EASE, fill: 'backwards' };
}

// Exponential smoothing toward a target; frame-rate independent.
export function approach(current, target, dt, tau) {
  if (!(tau > 0)) return target;
  return target + (current - target) * Math.exp(-Math.max(dt, 0) / tau);
}

// One damped-spring step (semi-implicit Euler, sub-stepped for long frames).
// Returns [position, velocity]. dt in ms.
export function springStep(position, velocity, target, dt, { stiffness = 240, damping = 19 } = {}) {
  let x = position;
  let v = velocity;
  let remaining = clamp(dt, 0, 64) / 1000;
  while (remaining > 0) {
    const h = Math.min(remaining, 1 / 120);
    v += (-stiffness * (x - target) - damping * v) * h;
    x += v * h;
    remaining -= h;
  }
  return [x, v];
}

// Pull toward the pointer while it is near the button: strongest over the
// button, fading to nothing `reach` px beyond its edge, never more than `max`.
export function magnetPull(dx, dy, halfWidth, halfHeight, { reach = 72, max = 9, ratio = 0.2 } = {}) {
  const nx = dx / Math.max(halfWidth + reach, 1);
  const ny = dy / Math.max(halfHeight + reach, 1);
  const distance = Math.hypot(nx, ny);
  if (distance >= 1) return { x: 0, y: 0 };
  const falloff = 1 - Math.pow(distance, 3);
  let x = dx * ratio * falloff;
  let y = dy * ratio * falloff;
  const length = Math.hypot(x, y);
  if (length > max) { x *= max / length; y *= max / length; }
  return { x, y };
}

// Pointer position (viewport fractions, 0..1) to the hero's depth response:
// lean (-1..1 per axis) and nearness to the art (0..1, the portrait and its
// orbit accent stand low and centred).
export function depthTarget(fx, fy) {
  const x = clamp(fx * 2 - 1, -1, 1);
  const y = clamp(fy * 2 - 1, -1, 1);
  const near = clamp(1 - Math.hypot(x, (y - 0.25) * 1.2) / 1.25, 0, 1);
  return { x, y, near };
}

export function mailtoAddress(href) {
  const match = /^mailto:([^?]+)/i.exec(href || '');
  if (!match) return '';
  try { return decodeURIComponent(match[1]); } catch { return match[1]; }
}

// The About opening (about-scenes.css): where this matches and JS runs, #about
// pins and its panel opens onto #introduction. Mirrors the CSS media query.
export const ABOUT_OPEN_MEDIA = 'screen and (min-width: 761px) and (min-height: 600px) and (prefers-reduced-motion: no-preference)';

// Progress (0..1) through a pinned section: 0 while its top is at or below the
// viewport's top, 1 once its bottom reaches the viewport's bottom.
export function openingProgress(top, height, viewportHeight) {
  const range = height - viewportHeight;
  if (!(range > 0)) return top < 0 ? 1 : 0;
  return clamp(-top / range, 0, 1);
}

// ---- Controller -------------------------------------------------------------

export function initMotion(document, window, { entrance } = {}) {
  const root = document.documentElement;
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  const pending = new Set();
  const timers = new Set();
  const loopState = new Map();
  const cleanups = [];
  const raf = window.requestAnimationFrame?.bind(window) || (callback => window.setTimeout(callback, 0));
  const now = () => window.performance?.now?.() ?? Date.now();
  let revealObserver = null;
  let loopObserver = null;
  let sceneObserver = null;

  const reduced = () => Boolean(reduce?.matches);
  const entranceRunning = () => Boolean(root.classList?.contains('agentic-running') || root.classList?.contains('agentic-touring'));
  const listen = (target, type, listener, options) => {
    if (!target?.addEventListener) return;
    target.addEventListener(type, listener, options);
    cleanups.push(() => target.removeEventListener(type, listener, options));
  };
  const later = (callback, ms) => {
    const id = window.setTimeout(() => { timers.delete(id); callback(); }, ms);
    timers.add(id);
    return id;
  };
  const cancelLater = id => { window.clearTimeout(id); timers.delete(id); };

  function clearReveal(element) {
    element.removeAttribute('data-reveal');
    element.removeAttribute('data-reveal-variant');
    element.style.removeProperty('--reveal-delay');
    element.querySelectorAll('.tag-list li').forEach(chip => chip.style.removeProperty('--chip'));
  }

  function revealNow(element) {
    if (!pending.delete(element)) return;
    revealObserver?.unobserve(element);
    clearReveal(element);
  }

  function revealAll() {
    [...pending].forEach(revealNow);
    revealObserver?.disconnect();
    document.querySelectorAll('[data-scene]').forEach(scene => scene.removeAttribute('data-scene'));
    sceneObserver?.disconnect();
    headlines.flush();
  }

  function play(elements) {
    // Entries arrive in DOM order; the batch index becomes the stagger.
    elements.forEach((element, index) => {
      if (!pending.delete(element)) return;
      revealObserver.unobserve(element);
      const delay = staggerDelay(index);
      element.style.setProperty('--reveal-delay', `${delay}ms`);
      element.querySelectorAll('.tag-list li').forEach((chip, chipIndex) => chip.style.setProperty('--chip', Math.min(chipIndex, CHIP_CAP)));
      element.dataset.reveal = 'in';
      later(() => clearReveal(element), delay + 1300);
    });
  }

  function markReveals() {
    if (reduced() || !window.IntersectionObserver) return;
    const tracing = isEntranceTracing(entrance, root);
    const viewportHeight = window.innerHeight || root.clientHeight;
    const candidates = [];
    REVEAL_GROUPS.forEach(([selector, variant]) => {
      document.querySelectorAll(selector).forEach(element => {
        if (tracing && (element.matches(ENTRANCE_TRACED) || element.querySelector(ENTRANCE_TRACED))) return;
        candidates.push([element, variant]);
      });
    });
    // Read every position first, then write, so marking costs one layout.
    const held = candidates.filter(([element]) => shouldHold(element.getBoundingClientRect(), viewportHeight));
    revealObserver = new window.IntersectionObserver(entries => {
      const entering = entries.filter(entry => entry.isIntersecting).map(entry => entry.target);
      if (entering.length) play(entering);
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0 });
    held.forEach(([element, variant]) => {
      pending.add(element);
      element.dataset.reveal = 'pending';
      element.dataset.revealVariant = variant;
      revealObserver.observe(element);
    });
  }

  // Browsers without scroll-driven animations get a one-time, decoration-only
  // scene settle (light, glow and flow field), never text.
  function markScenes() {
    if (reduced() || !window.IntersectionObserver) return;
    if (window.CSS?.supports?.('animation-timeline: view()')) return;
    const viewportHeight = window.innerHeight || root.clientHeight;
    const scenes = [...document.querySelectorAll('#about, #introduction, #contact')].filter(scene => shouldHold(scene.getBoundingClientRect(), viewportHeight));
    sceneObserver = new window.IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        entry.target.dataset.scene = 'in';
        sceneObserver.unobserve(entry.target);
      });
    }, { threshold: 0.2 });
    scenes.forEach(scene => { scene.dataset.scene = 'pending'; sceneObserver.observe(scene); });
  }

  // The About opening is CSS only where scroll timelines exist. Elsewhere this
  // drives the same --about-p from #about's position while it is pinned (the
  // CSS pins it whenever JS runs on a wide, tall-enough screen with motion).
  // The light scene's hold after the opening needs scroll timelines (Icarus's
  // fall is timed on one), so here the scene simply scrolls on, as before.
  function initAboutOpening() {
    const about = document.querySelector('#about');
    if (!about || window.CSS?.supports?.('animation-timeline: view()')) return null;
    const media = window.matchMedia?.(ABOUT_OPEN_MEDIA);
    if (!media) return null;
    let frame = 0;
    const update = () => {
      frame = 0;
      if (!media.matches) { about.style.removeProperty('--about-p'); return; }
      const rect = about.getBoundingClientRect();
      about.style.setProperty('--about-p', openingProgress(rect.top, rect.height, window.innerHeight || root.clientHeight).toFixed(4));
    };
    const schedule = () => { if (!frame) frame = raf(update); };
    listen(window, 'scroll', schedule, { passive: true });
    listen(window, 'resize', schedule);
    listen(media, 'change', schedule);
    update();
    return null;
  }

  // Idle loops (sculpture float and orbit, note orbit, contact glow) run only
  // on screen and while the page is visible.
  function applyLoop(element) {
    element.dataset.loop = loopState.get(element) && !document.hidden ? 'run' : 'paused';
  }
  function watchLoops() {
    const loops = LOOPS.map(selector => document.querySelector(selector)).filter(Boolean);
    if (!window.IntersectionObserver) return;
    loopObserver = new window.IntersectionObserver(entries => {
      entries.forEach(entry => { loopState.set(entry.target, entry.isIntersecting); applyLoop(entry.target); });
    }, { threshold: 0 });
    loops.forEach(element => { loopState.set(element, true); loopObserver.observe(element); });
  }
  const onVisibility = () => loopState.forEach((_, element) => applyLoop(element));

  // ---- Headlines: line-by-line rise from behind a mask -----------------------
  const headlines = (() => {
    const entries = new Map();
    const built = new WeakSet();
    let observer = null;
    let buildObserver = null;

    // The tour types some headlines; whatever it built in this page view is
    // never masked again.
    if (window.MutationObserver && document.body) {
      buildObserver = new window.MutationObserver(records => records.forEach(({ target }) => {
        const state = target.getAttribute?.('data-build-state');
        if (state !== 'typing' && state !== 'placing') return;
        if (target.matches?.(HEADLINES)) built.add(target);
        else if (state === 'placing') target.querySelectorAll?.(HEADLINES).forEach(heading => built.add(heading));
      }));
      buildObserver.observe(document.body, { subtree: true, attributes: true, attributeFilter: ['data-build-state'] });
    }

    // Where every run of text starts (left, top, bottom per text node; wrapper
    // boxes would report full line widths), where the last one ends, and the
    // headline's own height. Edge spaces moved outside a word only change that
    // word's right edge, which the next run's left edge still pins down.
    function textBox(heading) {
      const range = document.createRange?.();
      const walker = document.createTreeWalker?.(heading, 4);
      if (!range || !walker) return null;
      const values = [];
      let right = -Infinity;
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (!/\S/.test(node.data)) continue;
        range.selectNodeContents(node);
        const rect = range.getBoundingClientRect();
        values.push(rect.left, rect.top, rect.bottom);
        right = Math.max(right, rect.right);
      }
      if (!values.length) return null;
      return [...values, right, heading.getBoundingClientRect().height];
    }

    // Wraps lines (or words) in place. Original nodes are moved, never cloned,
    // so the accessible name and the text stay exactly as authored; `restore`
    // puts the original child list back. Splitting must not move a single
    // glyph: if the measured text box changes, the headline is left alone.
    function split(heading) {
      const nodes = [...heading.childNodes];
      const plan = planHeadline(nodes);
      if (!plan) return null;
      const before = textBox(heading);
      const units = [];
      const restore = () => {
        heading.replaceChildren(...nodes);
        units.forEach(unit => unit.removeAttribute?.('data-headline-unit'));
      };
      if (plan.mode === 'lines') {
        const next = plan.lines.map(line => {
          const wrap = document.createElement('motion-line');
          wrap.setAttribute('data-headline-unit', 'line');
          wrap.append(...line.map(index => nodes[index]));
          units.push(wrap);
          return wrap;
        });
        heading.replaceChildren(...next);
      } else {
        const byIndex = new Map(plan.units.map(unit => [unit.index, unit]));
        const next = nodes.flatMap((node, index) => {
          const unit = byIndex.get(index);
          if (!unit) return [node];
          if (unit.kind === 'element') {
            node.setAttribute('data-headline-unit', 'word');
            units.push(node);
            return [node];
          }
          const wrap = document.createElement('motion-line');
          wrap.setAttribute('data-headline-unit', 'word');
          wrap.textContent = unit.core;
          units.push(wrap);
          return [unit.lead && document.createTextNode(unit.lead), wrap, unit.trail && document.createTextNode(unit.trail)].filter(Boolean);
        });
        heading.replaceChildren(...next);
      }
      const after = textBox(heading);
      if (!before || !after || before.length !== after.length || before.some((value, index) => Math.abs(value - after[index]) > 0.75)) {
        restore();
        return null;
      }
      return { units, restore };
    }

    function finish(heading) {
      const entry = entries.get(heading);
      if (!entry) return;
      entries.delete(heading);
      observer?.unobserve(heading);
      if (entry.timer) cancelLater(entry.timer);
      entry.animations?.forEach(animation => animation.cancel());
      entry.restore();
      heading.removeAttribute('data-headline');
      heading.removeAttribute('data-headline-tone');
    }

    function reveal(heading) {
      const entry = entries.get(heading);
      if (!entry || entry.animations) return;
      observer?.unobserve(heading);
      if (reduced() || entranceRunning()) { finish(heading); return; }
      const tone = heading.getAttribute('data-headline-tone');
      const frames = headlineKeyframes(tone);
      entry.animations = entry.units.map((unit, index) => unit.animate(frames, headlineTiming(tone, index)));
      heading.setAttribute('data-headline', 'in');
      const last = headlineTiming(tone, entry.units.length - 1);
      Promise.all(entry.animations.map(animation => animation.finished)).then(() => finish(heading), () => {});
      // Safety net: hidden tabs may hold animation frames back.
      entry.timer = later(() => finish(heading), last.delay + last.duration + 600);
    }

    function mark() {
      if (reduced() || !window.IntersectionObserver || typeof document.createElement !== 'function') return;
      const all = [...document.querySelectorAll(HEADLINES)];
      if (!all.length || typeof all[0].animate !== 'function') return;
      const tracing = isEntranceTracing(entrance, root);
      const viewportHeight = window.innerHeight || root.clientHeight;
      const held = all.filter(heading => !entries.has(heading) && !built.has(heading)
        && !(tracing && heading.matches(ENTRANCE_TRACED))
        && shouldHold(heading.getBoundingClientRect(), viewportHeight));
      if (!held.length) return;
      observer ??= new window.IntersectionObserver(items => items.forEach(item => { if (item.isIntersecting) reveal(item.target); }), { rootMargin: '0px 0px -16% 0px', threshold: 0 });
      held.forEach(heading => {
        const parts = split(heading);
        if (!parts) return;
        entries.set(heading, parts);
        heading.setAttribute('data-headline-tone', heading.closest('.dark-section') ? 'dark' : 'light');
        heading.setAttribute('data-headline', 'pending');
        observer.observe(heading);
      });
    }

    // A fast jump (nav link, smooth deep-link scroll) can carry a headline past
    // the viewport between frames; once passed it is simply shown.
    let sweepFrame = 0;
    const sweep = () => {
      sweepFrame = 0;
      entries.forEach((entry, heading) => { if (!entry.animations && heading.getBoundingClientRect().bottom < 0) finish(heading); });
    };
    listen(window, 'scroll', () => { if (entries.size && !sweepFrame) sweepFrame = raf(sweep); }, { passive: true });

    function flush() { [...entries.keys()].forEach(finish); }

    return {
      mark,
      flush,
      get pending() { return entries.size; },
      destroy() { flush(); observer?.disconnect(); buildObserver?.disconnect(); },
    };
  })();

  // If Cesar's portrait cannot load, the orbital sculpture takes the centre of
  // the hero again (portrait.css), instead of a broken image and alt text.
  function watchPortrait() {
    const hero = document.querySelector('.hero');
    const image = hero?.querySelector?.('.hero-portrait img');
    if (!image) return;
    const fail = () => { hero.dataset.portrait = 'failed'; };
    if (image.complete && image.currentSrc && !image.naturalWidth) { fail(); return; }
    listen(image, 'error', fail, { once: true });
    listen(image, 'load', () => { if (hero.dataset.portrait === 'failed') delete hero.dataset.portrait; });
  }

  // ---- Hero: portrait and orbit accent lean into the pointer's depth --------
  // app.js tilts the sculpture (`rotate`); this sets the depth variables on
  // the art box, which motion.css turns into a small drift of the portrait
  // and a trailing, nearer-leaning orbit (and the fallback ground shadow).
  function initHeroDepth() {
    const hero = document.querySelector('.hero');
    const art = hero?.querySelector?.('.hero-art');
    if (!art?.style) return;
    const current = { x: 0, y: 0, near: 0 };
    let target = { x: 0, y: 0, near: 0 };
    let frame = 0;
    let last = 0;

    const paint = () => {
      const time = now();
      const dt = last ? Math.min(time - last, 64) : 16;
      last = time;
      let settled = true;
      for (const key of ['x', 'y', 'near']) {
        current[key] = approach(current[key], target[key], dt, 240);
        if (Math.abs(current[key] - target[key]) > 0.0008) settled = false;
        else current[key] = target[key];
      }
      if (settled && !target.x && !target.y && !target.near) {
        ['--depth-x', '--depth-y', '--depth-near'].forEach(name => art.style.removeProperty(name));
      } else {
        art.style.setProperty('--depth-x', current.x.toFixed(4));
        art.style.setProperty('--depth-y', current.y.toFixed(4));
        art.style.setProperty('--depth-near', current.near.toFixed(4));
      }
      frame = settled ? 0 : raf(paint);
      if (!frame) last = 0;
    };
    const kick = () => { if (!frame) frame = raf(paint); };
    const rest = () => { target = { x: 0, y: 0, near: 0 }; kick(); };
    const offscreen = () => hero.dataset?.loop === 'paused';

    listen(hero, 'pointermove', event => {
      if (event.pointerType === 'touch' || reduced() || entranceRunning() || offscreen()) { rest(); return; }
      target = depthTarget(event.clientX / Math.max(window.innerWidth || 1, 1), event.clientY / Math.max(window.innerHeight || 1, 1));
      kick();
    });
    listen(hero, 'pointerleave', rest);
    return rest;
  }

  // ---- Contact close: magnetic email pill, pointer-led glow, copy email ------
  function initContact() {
    const footer = document.querySelector('#contact');
    const pill = footer?.querySelector?.('.contact-button');
    if (!pill?.style || typeof document.createElement !== 'function') return null;

    injectCopy(footer, pill);

    const magnet = { x: 0, y: 0, vx: 0, vy: 0, tx: 0, ty: 0 };
    const glow = { x: 0, y: 0, tx: 0, ty: 0 };
    let pointer = null;
    let rects = null;
    let frame = 0;
    let last = 0;

    const measure = () => {
      const box = footer.getBoundingClientRect();
      const button = pill.getBoundingClientRect();
      // The pill's resting centre: its box minus the offset it carries now.
      rects = {
        footer: box,
        cx: button.left + button.width / 2 - magnet.x,
        cy: button.top + button.height / 2 - magnet.y,
        halfWidth: button.width / 2,
        halfHeight: button.height / 2,
      };
    };

    const paint = () => {
      const time = now();
      const dt = last ? Math.min(time - last, 64) : 16;
      last = time;
      if (pointer && !rects) measure();
      if (pointer && rects) {
        const pull = magnetPull(pointer.x - rects.cx, pointer.y - rects.cy, rects.halfWidth, rects.halfHeight);
        magnet.tx = pull.x;
        magnet.ty = pull.y;
        const { footer: box } = rects;
        const glowY = box.top + 150 + Math.min(240, (window.innerWidth || 1280) * 0.26) / 2;
        glow.tx = clamp((pointer.x - (box.left + box.width / 2)) * 0.6, -box.width * 0.32, box.width * 0.32);
        glow.ty = clamp((pointer.y - glowY) * 0.5, -110, box.height * 0.36);
      } else {
        magnet.tx = magnet.ty = glow.tx = glow.ty = 0;
      }
      [magnet.x, magnet.vx] = springStep(magnet.x, magnet.vx, magnet.tx, dt);
      [magnet.y, magnet.vy] = springStep(magnet.y, magnet.vy, magnet.ty, dt);
      glow.x = approach(glow.x, glow.tx, dt, 280);
      glow.y = approach(glow.y, glow.ty, dt, 280);
      const magnetSettled = Math.abs(magnet.x - magnet.tx) < 0.05 && Math.abs(magnet.y - magnet.ty) < 0.05 && Math.abs(magnet.vx) < 0.5 && Math.abs(magnet.vy) < 0.5;
      const glowSettled = Math.abs(glow.x - glow.tx) < 0.3 && Math.abs(glow.y - glow.ty) < 0.3;
      if (magnetSettled) { magnet.x = magnet.tx; magnet.y = magnet.ty; magnet.vx = magnet.vy = 0; }
      if (glowSettled) { glow.x = glow.tx; glow.y = glow.ty; }
      if (magnet.x || magnet.y) {
        pill.style.setProperty('--magnet-x', `${magnet.x.toFixed(2)}px`);
        pill.style.setProperty('--magnet-y', `${magnet.y.toFixed(2)}px`);
      } else {
        pill.style.removeProperty('--magnet-x');
        pill.style.removeProperty('--magnet-y');
      }
      if (glow.x || glow.y) {
        footer.style.setProperty('--glow-x', `${glow.x.toFixed(1)}px`);
        footer.style.setProperty('--glow-y', `${glow.y.toFixed(1)}px`);
      } else {
        footer.style.removeProperty('--glow-x');
        footer.style.removeProperty('--glow-y');
      }
      const settled = magnetSettled && glowSettled;
      frame = settled ? 0 : raf(paint);
      if (!frame) last = 0;
    };
    const kick = () => { if (!frame) frame = raf(paint); };
    const release = () => { pointer = null; rects = null; kick(); };

    listen(footer, 'pointermove', event => {
      if (event.pointerType === 'touch' || reduced() || entranceRunning()) { release(); return; }
      pointer = { x: event.clientX, y: event.clientY };
      kick();
    });
    listen(footer, 'pointerleave', release);
    // Scrolling or resizing moves the boxes under a still pointer.
    listen(window, 'scroll', () => { rects = null; }, { passive: true });
    listen(window, 'resize', () => { rects = null; });
    return release;
  }

  function injectCopy(footer, pill) {
    const clipboard = window.navigator?.clipboard;
    const address = mailtoAddress(pill.getAttribute('href'));
    if (!address || typeof clipboard?.writeText !== 'function' || footer.querySelector('.contact-copy')) return;
    const row = document.createElement('div');
    row.className = 'contact-actions';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'contact-copy';
    button.innerHTML = '<svg class="contact-copy-icon" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">'
      + '<g class="icon-copy"><rect x="5.25" y="5.25" width="8" height="8" rx="2"/><path d="M10.75 3.25v-.5a1.5 1.5 0 0 0-1.5-1.5h-5a1.5 1.5 0 0 0-1.5 1.5v5a1.5 1.5 0 0 0 1.5 1.5h.5"/></g>'
      + '<path class="icon-done" d="M3 8.5l3.2 3.2L13 4.8"/></svg><span class="contact-copy-label">Copy email</span>';
    const toast = document.createElement('span');
    toast.className = 'contact-toast';
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');
    pill.before(row);
    row.append(pill, button, toast);

    const label = button.querySelector('.contact-copy-label');
    let resetTimer = 0;
    let clearTimer = 0;
    const settle = () => {
      button.removeAttribute('data-state');
      label.textContent = 'Copy email';
      toast.removeAttribute('data-state');
      clearTimer = later(() => { toast.textContent = ''; }, 400);
    };
    listen(button, 'click', async () => {
      let ok = true;
      try { await clipboard.writeText(address); }
      catch { ok = false; }
      cancelLater(resetTimer);
      cancelLater(clearTimer);
      // Empty first, so repeating the same message is announced again.
      toast.textContent = '';
      raf(() => {
        toast.textContent = ok ? 'Email copied' : 'Couldn\u2019t copy. Use the email button instead.';
        toast.setAttribute('data-state', ok ? 'shown' : 'error');
      });
      if (ok) { button.setAttribute('data-state', 'copied'); label.textContent = 'Copied'; }
      resetTimer = later(settle, ok ? 2200 : 3600);
    });
  }

  const onFocus = event => {
    const held = event.target.closest?.('[data-reveal="pending"]');
    if (held) revealNow(held);
  };
  const resets = [];
  const onMotion = () => { if (reduced()) { revealAll(); resets.forEach(reset => reset?.()); } };
  const onBeforePrint = () => revealAll();

  // The entrance never builds over hidden text or a leaning sculpture.
  if (window.MutationObserver && root.nodeType === 1) {
    const rootObserver = new window.MutationObserver(() => {
      if (!entranceRunning()) return;
      headlines.flush();
      resets.forEach(reset => reset?.());
    });
    rootObserver.observe(root, { attributes: true, attributeFilter: ['class'] });
    cleanups.push(() => rootObserver.disconnect());
  }

  function settle() {
    // The guided tour owns section assembly while it runs; reveals start
    // once it ends or the visitor takes over.
    if (entrance?.touring && typeof entrance.whenTourEnds === 'function') {
      entrance.whenTourEnds(() => raf(settle));
      return;
    }
    try { markReveals(); markScenes(); headlines.mark(); }
    catch { revealAll(); }
  }

  watchLoops();
  document.addEventListener('visibilitychange', onVisibility);
  document.addEventListener('focusin', onFocus);
  reduce?.addEventListener?.('change', onMotion);
  window.addEventListener('beforeprint', onBeforePrint);
  // Each effect is optional; one failing leaves the others and the content.
  const attempt = init => { try { return init(); } catch { return null; } };
  [initHeroDepth, initContact].forEach(init => { const reset = attempt(init); if (reset) resets.push(reset); });
  attempt(watchPortrait);
  attempt(initAboutOpening);

  // Measure after load so restored scroll positions and deep links are known.
  if (document.readyState === 'complete') raf(settle);
  else window.addEventListener('load', () => raf(settle), { once: true });

  return {
    get pending() { return pending.size; },
    get headlines() { return headlines.pending; },
    revealAll,
    destroy() {
      revealAll();
      headlines.destroy();
      timers.forEach(id => window.clearTimeout(id));
      loopObserver?.disconnect();
      cleanups.forEach(cleanup => cleanup());
      document.removeEventListener('visibilitychange', onVisibility);
      document.removeEventListener('focusin', onFocus);
      reduce?.removeEventListener?.('change', onMotion);
      window.removeEventListener('beforeprint', onBeforePrint);
    },
  };
}

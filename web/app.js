import {
  createGalleryState, wrapOffset, wrapPosition, ribbonGeometry, ribbonPose, stripOffsets,
  cardCentre, releaseTarget, settleDuration, easeOutExpo,
} from './gallery-state.js';
// entrance.js (the build tour, ~177 KB) is loaded on demand: see bootEntrance().
import { initMotion } from './motion.js';
import { initHeader } from './header.js';

// 1: concave "curved display" ribbon. -1 bends it the other way (a convex drum).
const RIBBON_BEND = 1;

export function initPortfolio(document, window) {
  const gallery = document.querySelector('.gallery');
  const cards = [...gallery.querySelectorAll('.project-card')];
  const count = cards.length;
  const state = createGalleryState(count);
  const selectors = [...gallery.querySelectorAll('[data-select]')];
  const stage = gallery.querySelector('.gallery-stage');
  const counter = gallery.querySelector('.gallery-count');
  const counterIndex = counter.querySelector('.gallery-index');
  const counterTitle = counter.querySelector('.gallery-count-title');
  const dialog = document.querySelector('.project-dialog');
  const dialogContent = dialog.querySelector('.dialog-content');
  const canUseDialog = typeof dialog.showModal === 'function';
  const motion = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  const raf = window.requestAnimationFrame?.bind(window);
  const cancelRaf = window.cancelAnimationFrame?.bind(window);
  const now = () => window.performance?.now?.() ?? Date.now();
  const reduced = () => Boolean(motion?.matches);
  let dialogOpener = null;
  let gesture = null;
  let suppressClick = false;
  let suppressTimer;
  let shownIndex = state.index;
  // One shared selection. `goal` is the selected card (unwrapped while the
  // ribbon travels, so it can turn the short way round); `position` is the
  // continuous place the ribbon is drawn at.
  const ribbon = { position: state.index, goal: state.index, tween: null, frame: 0, onScreen: true, geometry: ribbonGeometry(0, { bend: RIBBON_BEND, count }), strips: 0, width: -1 };

  // ---- Geometry: read layout on resize only. ----
  function setGeometry(geometry) {
    ribbon.geometry = geometry;
    const vars = {
      '--ribbon-w': `${geometry.width}px`, '--ribbon-h': `${geometry.height}px`, '--ribbon-band': `${geometry.band}px`,
      '--ribbon-r': `${geometry.radius}px`, '--ribbon-p': `${geometry.perspective}px`, '--ribbon-a': geometry.angle,
      '--ribbon-bend': geometry.bend, '--strip-w': `${geometry.width / geometry.strips}px`,
    };
    Object.entries(vars).forEach(([name, value]) => gallery.style.setProperty(name, value));
    if (geometry.strips !== ribbon.strips) buildStrips(geometry);
    paint();
  }
  function measure() {
    const width = stage.clientWidth || window.innerWidth || 0;
    if (width === ribbon.width) return;
    ribbon.width = width;
    setGeometry(ribbonGeometry(width, { bend: RIBBON_BEND, count }));
  }

  // Each cover is cut into vertical strips (decoration only: the real link,
  // image and alt text stay in the card). Strips sit on the cylinder in CSS.
  function buildStrips(geometry) {
    ribbon.strips = geometry.strips;
    const offsets = stripOffsets(geometry.strips, geometry.width, geometry.pitch);
    cards.forEach(card => {
      const link = card.querySelector('.project-image-link');
      const image = link?.querySelector('img');
      if (!image) return;
      let holder = link.querySelector('.ribbon-strips');
      if (!holder) {
        holder = document.createElement('span');
        holder.className = 'ribbon-strips';
        holder.setAttribute('aria-hidden', 'true');
        link.append(holder);
      }
      holder.dataset.cover = image.src;
      if (ribbon.coversReady) holder.style.setProperty('--cover', `url("${image.src}")`);
      holder.replaceChildren(...offsets.map((offset, index) => {
        const strip = document.createElement('span');
        strip.className = 'ribbon-strip';
        strip.style.setProperty('--s', offset);
        strip.style.setProperty('--k', index);
        return strip;
      }));
    });
  }

  // Per frame: only custom properties that feed transforms and opacity.
  function paint() {
    const { geometry } = ribbon;
    cards.forEach((card, index) => {
      const offset = wrapPosition(index - ribbon.position, count);
      const pose = ribbonPose(offset, geometry.reach);
      card.style.setProperty('--o', offset.toFixed(4));
      card.style.setProperty('--card-x', `${cardCentre(offset, geometry).toFixed(2)}px`);
      card.style.setProperty('--card-opacity', pose.opacity);
      card.style.setProperty('--caption', pose.caption);
      if (card.hasAttribute('data-far') !== pose.far) card.toggleAttribute('data-far', pose.far);
    });
  }

  // ---- Motion: one rAF loop, alive only while the ribbon moves. ----
  function schedule() {
    if (!ribbon.frame) ribbon.frame = raf(frame);
  }
  function frame(time) {
    ribbon.frame = 0;
    const tween = ribbon.tween;
    if (tween) {
      const progress = (time - tween.start) / tween.duration;
      if (progress >= 1) { settle(); return; }
      ribbon.position = tween.from + (tween.to - tween.from) * easeOutExpo(Math.max(0, progress));
      schedule();
    }
    paint();
  }
  function settle() {
    ribbon.tween = null;
    if (ribbon.frame) { cancelRaf?.(ribbon.frame); ribbon.frame = 0; }
    ribbon.goal = state.index;
    ribbon.position = state.index;
    stage.classList.remove('is-moving');
    paint();
  }
  function travel(velocity = 0) {
    const distance = ribbon.goal - ribbon.position;
    // Reduced motion, offscreen, or no rAF: the selection changes at once.
    if (reduced() || !raf || !ribbon.onScreen || Math.abs(distance) < 0.0005) { settle(); return; }
    ribbon.tween = { from: ribbon.position, to: ribbon.goal, start: now(), duration: settleDuration({ distance, velocity }) };
    stage.classList.add('is-moving');
    schedule();
  }

  function announceCounter(direction) {
    if (typeof counter.animate !== 'function') return;
    const keyframes = reduced()
      ? [{ opacity: 0.35 }, { opacity: 1 }]
      : [{ opacity: 0, transform: `translate3d(${direction * 12}px, 0, 0)` }, { opacity: 1, transform: 'none' }];
    counter.animate(keyframes, { duration: reduced() ? 160 : 520, easing: 'cubic-bezier(.16, 1, .3, 1)' });
  }

  function renderGallery(direction = 0) {
    const focusedCard = document.activeElement?.closest?.('.project-card');
    if (focusedCard && focusedCard !== cards[state.index]) stage.focus();
    cards.forEach((card, index) => {
      card.setAttribute('aria-hidden', String(index !== state.index));
      card.querySelectorAll('a, button').forEach(link => { link.tabIndex = index === state.index ? 0 : -1; });
    });
    selectors.forEach((button, index) => button.setAttribute('aria-pressed', String(index === state.index)));
    const title = cards[state.index].querySelector('h3').textContent;
    const index = `${String(state.index + 1).padStart(2, '0')} / ${String(count).padStart(2, '0')}`;
    if (counterIndex && counterTitle) {
      counterIndex.textContent = index;
      counterTitle.textContent = ` — ${title}`;
    } else {
      counter.textContent = `${index} — ${title}`;
    }
    if (state.index !== shownIndex) announceCounter(direction || 1);
    shownIndex = state.index;
  }

  // Every input lands here: buttons, arrows, the title list, drags and taps.
  function select(goal, velocity = 0) {
    const direction = Math.sign(goal - ribbon.goal) || Math.sign(goal - ribbon.position);
    ribbon.goal = goal;
    state.select(((goal % count) + count) % count);
    renderGallery(direction);
    travel(velocity);
  }
  function step(delta) {
    select(ribbon.goal + delta);
  }

  gallery.querySelector('.gallery-prev').addEventListener('click', () => step(-1));
  gallery.querySelector('.gallery-next').addEventListener('click', () => step(1));
  selectors.forEach(button => button.addEventListener('click', () => {
    const target = Number(button.dataset.select);
    select(ribbon.goal + wrapOffset(target, state.index, count));
  }));
  stage.addEventListener('keydown', event => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    step(event.key === 'ArrowLeft' ? -1 : 1);
    // A focused card link must not remain inside a newly inactive panel.
    if (event.target !== stage) stage.focus();
  });

  // ---- Drag and touch: the ribbon follows the pointer, then settles. ----
  const timeOf = event => (Number.isFinite(event.timeStamp) && event.timeStamp > 0 ? event.timeStamp : now());
  function sample(time) {
    gesture.samples.push({ position: gesture.position, time });
    while (gesture.samples.length > 2 && time - gesture.samples[0].time > 100) gesture.samples.shift();
  }
  // Ribbon speed in cards per ms over the last ~100 ms.
  function velocityOf(current) {
    const first = current.samples[0];
    const last = current.samples[current.samples.length - 1];
    const elapsed = first && last ? last.time - first.time : 0;
    return elapsed >= 16 ? (last.position - first.position) / elapsed : 0;
  }
  stage.addEventListener('pointerdown', event => {
    if (event.button !== 0 || event.isPrimary === false) return;
    gesture = { x: event.clientX, y: event.clientY, id: event.pointerId, dragging: false, samples: [] };
    suppressClick = false;
    window.clearTimeout(suppressTimer);
  });
  stage.addEventListener('pointermove', event => {
    if (!gesture || gesture.id !== event.pointerId) return;
    const dx = event.clientX - gesture.x;
    const dy = event.clientY - gesture.y;
    if (!gesture.dragging && Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 9) { gesture = null; return; }
    if (!gesture.dragging && Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy)) {
      gesture.dragging = true;
      // Catch the ribbon where it is, even halfway through a settle.
      ribbon.tween = null;
      stage.classList.remove('is-moving');
      gesture.start = ribbon.position;
      gesture.origin = Math.round(ribbon.position);
      stage.classList.add('is-dragging');
      stage.setPointerCapture?.(event.pointerId);
    }
    if (!gesture.dragging) return;
    gesture.position = gesture.start - dx / ribbon.geometry.pitch;
    sample(timeOf(event));
    // Reduced motion: no live movement; the release still selects.
    if (reduced()) return;
    ribbon.position = gesture.position;
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
    if (!cancelled) {
      current.position = current.start - (event.clientX - current.x) / ribbon.geometry.pitch;
      current.samples.push({ position: current.position, time: timeOf(event) });
    }
    const speed = cancelled ? 0 : velocityOf(current);
    const goal = cancelled ? current.origin : releaseTarget({ origin: current.origin, position: current.position, velocity: speed, pitch: ribbon.geometry.pitch });
    // A drag is never also a click on the card under the pointer.
    suppressClick = true;
    suppressTimer = window.setTimeout(() => { suppressClick = false; }, 350);
    select(goal, speed);
  }
  stage.addEventListener('pointerup', event => finishGesture(event));
  stage.addEventListener('pointercancel', event => finishGesture(event, true));
  stage.addEventListener('dragstart', event => event.preventDefault());
  // Pressing a neighbour must not focus its hidden link (it is aria-hidden and
  // untabbable); the click below turns the press into a selection instead.
  stage.addEventListener('mousedown', event => {
    if (event.target.closest?.('.project-card[aria-hidden="true"]')) event.preventDefault();
  }, true);
  stage.addEventListener('click', event => {
    if (suppressClick) { event.preventDefault(); event.stopImmediatePropagation(); suppressClick = false; return; }
    // A visible neighbour is a shortcut to that project, not a link into it.
    const card = event.target.closest?.('.ribbon-strip')?.closest('.project-card');
    if (!card || card === cards[state.index]) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    select(ribbon.goal + wrapOffset(cards.indexOf(card), state.index, count));
  }, true);

  // Covers load once the gallery is about a screen away (keeps loading="lazy" meaningful).
  const showCovers = () => {
    ribbon.coversReady = true;
    gallery.querySelectorAll('.ribbon-strips[data-cover]').forEach(holder => holder.style.setProperty('--cover', `url("${holder.dataset.cover}")`));
  };
  if (typeof window.IntersectionObserver === 'function') {
    const coverWatch = new window.IntersectionObserver(entries => {
      if (!entries?.some(entry => entry.isIntersecting)) return;
      coverWatch.disconnect();
      showCovers();
    }, { rootMargin: '100% 0px' });
    coverWatch.observe(stage);
  } else showCovers();

  // Offscreen, a running settle finishes at once and no frames are drawn.
  if (typeof window.IntersectionObserver === 'function') {
    new window.IntersectionObserver(entries => {
      const entry = entries?.[entries.length - 1];
      if (!entry || entry.target !== stage) return;
      ribbon.onScreen = entry.isIntersecting;
      if (!ribbon.onScreen && ribbon.tween) settle();
    }).observe(stage);
  }
  if (typeof window.ResizeObserver === 'function') new window.ResizeObserver(measure).observe(stage);
  else window.addEventListener?.('resize', measure);

  if (canUseDialog) {
    document.addEventListener('click', event => {
      const link = event.target.closest('[data-open]');
      if (!link || event.defaultPrevented || event.button > 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const source = document.getElementById(link.dataset.open);
      if (!source) return;
      event.preventDefault();
      dialogOpener = link;
      const image = link.closest('.project-card').querySelector('img').cloneNode(true);
      image.loading = 'eager';
      const story = source.cloneNode(true);
      story.removeAttribute('id');
      const title = story.querySelector('h3');
      title.id = 'dialog-project-title';
      const content = document.createDocumentFragment();
      content.append(image, ...story.childNodes);
      dialogContent.replaceChildren(content);
      dialog.setAttribute('aria-labelledby', 'dialog-project-title');
      dialog.showModal();
      dialog.scrollTop = 0;
      document.body.classList.add('dialog-open');
    });
    dialog.querySelector('.dialog-close').addEventListener('click', () => dialog.close());
    dialog.addEventListener('click', event => {
      if (event.target !== dialog) return;
      const bounds = dialog.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close();
    });
    dialog.addEventListener('close', () => {
      document.body.classList.remove('dialog-open');
      dialogOpener?.focus();
    });
  } else {
    // Keep inline project details reachable in browsers without native dialogs.
    document.querySelector('.project-stories').style.display = 'grid';
  }

  initHeader(document, window);
  // The orbit accent tilts toward the pointer (the portrait itself never
  // rotates: only `.sculpture` reads --art-rotate).
  const art = document.querySelector('.hero-art');
  let tiltFrame = 0;
  let tilt = 0;
  const paintTilt = () => { tiltFrame = 0; art.style.setProperty('--art-rotate', `${tilt.toFixed(2)}deg`); };
  document.querySelector('.hero').addEventListener('pointermove', event => {
    if (!art || motion?.matches || event.pointerType === 'touch') return;
    // The entrance owns the hero while it assembles it.
    if (document.documentElement.classList.contains('agentic-running')) return;
    tilt = (event.clientX / Math.max(window.innerWidth, 1) - .5) * 6;
    if (!raf) paintTilt();
    else if (!tiltFrame) tiltFrame = raf(paintTilt);
  });
  document.querySelectorAll('[data-year]').forEach(element => { element.textContent = new Date().getFullYear(); });
  renderGallery();
  document.body.classList.add('js-enabled');
  measure();
  gallery.querySelectorAll('[hidden]').forEach(element => { element.hidden = false; });
  return { state };
}

// ---- build tour bootstrap -----------------------------------------------------
// The tour plays on every normal load (everyVisit). Deep links, back/forward and
// reduced motion skip it, so entrance.js is only fetched when it will play or when
// the visitor asks for a Replay.
const ENTRANCE_OPTIONS = { everyVisit: true };
// Same key prefix as entrance.js's storage probe.
const ENTRANCE_PROBE_KEY = 'cesar:portfolio:agentic-intro:v1:probe';
// If the tour script takes longer than this to arrive, the page shows as is and the
// tour is not started; Replay still loads it.
const ENTRANCE_WAIT_MS = 4000;
const PENDING_CLASS = 'agentic-pending';
// What motion.js sees before (or without) the real entrance handle.
const IDLE_ENTRANCE = Object.freeze({
  phase: 'ready', sectionsEligible: false, paused: false, touring: false, tour: null, speed: 1,
  stats: Object.freeze({ agents: 0, cursors: 0, targets: 0, done: 0, working: 0, visible: 0 }),
});

// Mirrors shouldPlayEntrance() in entrance.js with everyVisit (the "seen" flag is ignored).
export function entranceWillPlay({ reducedMotion, storageAvailable, hash, navigationType }) {
  return !reducedMotion && storageAvailable && (!hash || hash === '#home') && navigationType !== 'back_forward';
}

function tourConditions(window) {
  let storageAvailable = false;
  try {
    window.localStorage.setItem(ENTRANCE_PROBE_KEY, '1');
    window.localStorage.removeItem(ENTRANCE_PROBE_KEY);
    storageAvailable = true;
  } catch { storageAvailable = false; }
  return {
    reducedMotion: Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches),
    storageAvailable,
    hash: window.location?.hash || '',
    navigationType: window.performance?.getEntriesByType?.('navigation')?.[0]?.type,
  };
}

let entranceModule = null;
let entranceAttempts = 0;
function loadEntrance() {
  // A failed module fetch is remembered per URL, so a retry needs a fresh one
  // (safe: the failed module never ran).
  const url = entranceAttempts ? `./entrance.js?retry=${entranceAttempts}` : './entrance.js';
  entranceAttempts += 1;
  entranceModule ||= import(url).catch(error => { entranceModule = null; throw error; });
  return entranceModule;
}

// A handle with the entrance's API that forwards to the real one once it is loaded.
function lazyEntrance(document, window) {
  let real = null;
  let stub = null;
  let replaying = null;
  const media = window.matchMedia?.('(prefers-reduced-motion: reduce)');

  function start(module) {
    real = module.initAgenticEntrance(document, window, ENTRANCE_OPTIONS);
    return real;
  }

  function replay() {
    if (real) { real.replay(); return Promise.resolve(); }
    if (replaying) return replaying;
    stub?.setAttribute('aria-busy', 'true');
    replaying = loadEntrance().then(module => {
      const hadFocus = Boolean(stub && document.activeElement === stub);
      start(module);
      // A late init may already be touring (the URL lost its hash); otherwise replay.
      if (!real.touring) real.replay();
      // The real footer Replay is in place now (hidden while the tour runs).
      stub?.remove();
      stub = null;
      if (hadFocus && !real.touring) document.querySelector('[data-agentic-replay]')?.focus({ preventScroll: true });
    }).catch(() => { stub?.removeAttribute('aria-busy'); })
      .finally(() => { replaying = null; });
    return replaying;
  }

  // The footer "Replay build tour" link entrance.js would add, until it is loaded.
  function showReplay() {
    if (real || stub) return;
    stub = document.createElement('button');
    stub.type = 'button';
    stub.className = 'agentic-replay';
    stub.dataset.agenticReplay = '';
    stub.textContent = 'Replay build tour ↗';
    stub.disabled = Boolean(media?.matches);
    stub.addEventListener('click', replay);
    media?.addEventListener?.('change', () => { if (stub) stub.disabled = Boolean(media.matches); });
    const footerBottom = document.querySelector('.footer-bottom');
    if (footerBottom?.lastElementChild) footerBottom.insertBefore(stub, footerBottom.lastElementChild);
    else (document.querySelector('footer') || document.body).append(stub);
  }

  const handle = new Proxy({}, {
    get(_, key) {
      if (key === 'whenTourEnds') return callback => (real ? real.whenTourEnds(callback) : callback());
      if (key === 'skip') return () => real?.skip();
      if (key === 'replay') return replay;
      return real ? real[key] : IDLE_ENTRANCE[key];
    },
  });
  return { handle, start, showReplay };
}

// The tour opens on its own black veil (entrance.css .agentic-veil). Show the same
// veil while the script arrives so the finished hero never flashes first.
function placeholderVeil(document) {
  const stage = document.createElement('div');
  stage.className = 'agentic-stage is-hero';
  stage.setAttribute('aria-hidden', 'true');
  stage.dataset.entrancePlaceholder = '';
  stage.innerHTML = '<div class="agentic-decoration"><div class="agentic-veil"></div></div>';
  document.body.append(stage);
  return stage;
}

function bootEntrance(document, window) {
  const lazy = lazyEntrance(document, window);
  const startMotion = () => {
    try { initMotion(document, window, { entrance: lazy.handle }); }
    catch { document.querySelectorAll('[data-reveal]').forEach(element => element.removeAttribute('data-reveal')); }
  };
  // An optional inline <head> script may set this class (black cover before the
  // first paint); it is cleared as soon as the tour or the plain page takes over.
  const clearPending = () => document.documentElement.classList.remove(PENDING_CLASS);
  // The inline <head> script decides first (it also drew the black cover); app.js
  // only decides on its own when that script did not run.
  const decided = document.documentElement.dataset.tour;
  const willPlay = decided ? decided === 'play' : entranceWillPlay(tourConditions(window));
  // One wait budget counted from navigation start, shared with the CSS cover, so a
  // slow app.js never shows the finished page and then blacks it out again.
  const remaining = ENTRANCE_WAIT_MS - (window.performance?.now?.() ?? 0);
  if (!willPlay || remaining <= 0) {
    clearPending();
    lazy.showReplay();
    startMotion();
    return;
  }
  const veil = placeholderVeil(document);
  let settled = false;
  // Any input while the script is still arriving means the visitor wants the page now.
  const inputs = ['wheel', 'touchstart', 'pointerdown', 'keydown'];
  const settle = () => {
    settled = true;
    window.clearTimeout(timer);
    inputs.forEach(type => window.removeEventListener(type, withoutTour, true));
    veil.remove();
    clearPending();
  };
  const withoutTour = () => {
    if (settled) return;
    settle();
    lazy.showReplay();
    startMotion();
  };
  inputs.forEach(type => window.addEventListener(type, withoutTour, { capture: true, passive: true }));
  const timer = window.setTimeout(withoutTour, remaining);
  loadEntrance().then(module => {
    if (settled) return;
    settle();
    lazy.start(module);
    // As before: motion starts with the entrance already running.
    startMotion();
  }).catch(withoutTour);
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  initPortfolio(document, window);
  bootEntrance(document, window);
}

// entrance.js (the build tour, ~177 KB) is loaded on demand: see bootEntrance().
import { initMotion } from './motion.js';
import { initHeader } from './header.js';
import { initExperience } from './experience.js';
import { initExplorer } from './explorer.js';

// The page shell: header, hero tilt and the footer year. The one project
// gallery is the explorer (explorer.js); its covers link to the case studies.
export function initPortfolio(document, window) {
  const motion = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  const raf = window.requestAnimationFrame?.bind(window);

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
  deferAboutFlow(document, window);
  document.body.classList.add('js-enabled');
}

// The About flow field is the heaviest file on the page (about 311 KB) and sits
// right under the full-height hero, where loading="lazy" would still fetch it at
// once. It loads once the visitor heads for it: any scroll away from the top, a
// wheel, touch, pointer or key press, a deep link that lands lower down, the
// section entering the view, or, while the build tour plays, FLOW_TOUR_LEAD_MS
// after navigation start (the tour reaches About at about 8 s). Without scripts
// the <noscript> copy in index.html loads as usual.
export const FLOW_TOUR_LEAD_MS = 5000;
export function deferAboutFlow(document, window) {
  const image = document.querySelector('.about-flow img[data-src]');
  if (!image) return;
  const intents = ['wheel', 'touchstart', 'pointerdown', 'keydown'];
  let timer = 0;
  let observer = null;
  const onScroll = () => { if ((window.scrollY || 0) > 0) load(); };
  function load() {
    if (!image.dataset.src) return;
    image.src = image.dataset.src;
    image.removeAttribute('data-src');
    intents.forEach(type => window.removeEventListener(type, load, true));
    window.removeEventListener('scroll', onScroll);
    window.removeEventListener('beforeprint', load);
    window.clearTimeout(timer);
    observer?.disconnect();
  }
  if ((window.scrollY || 0) > 0) { load(); return; }
  intents.forEach(type => window.addEventListener(type, load, { capture: true, passive: true }));
  window.addEventListener('scroll', onScroll, { passive: true });
  if (typeof window.IntersectionObserver === 'function') {
    // Only a real overlap counts: the section starts exactly at the fold, which
    // already reports as an (edge-adjacent) intersection.
    observer = new window.IntersectionObserver(entries => { if (entries.some(entry => entry.intersectionRect.height > 0)) load(); });
    observer.observe(image.closest('section') || image);
  }
  // Printing from the top would otherwise leave the image without a source.
  window.addEventListener('beforeprint', load);
  if (document.documentElement.dataset.tour === 'play') timer = window.setTimeout(load, Math.max(0, FLOW_TOUR_LEAD_MS - (window.performance?.now?.() ?? 0)));
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
    stub.textContent = 'Replay build tour ';
    const icon = document.createElement('span');
    icon.className = 'icon icon-arrow-ne';
    icon.setAttribute('aria-hidden', 'true');
    stub.append(icon);
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
  try { initExperience(document, window); } catch (error) { console.error(error); }
  try { initExplorer(document, window); } catch (error) { console.error(error); }
  bootEntrance(document, window);
}

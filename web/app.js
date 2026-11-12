// entrance.js (the build tour, ~177 KB) is loaded on demand: see bootEntrance().
import { initMotion } from './motion.js';
import { initHeader } from './header.js';
import { initExperience } from './experience.js';
import { initExplorer } from './explorer.js';
import { initHomeCharts } from './home-charts.js';

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

// ---- live previews in "Open the work" (#lab) -----------------------------------
// work-previews.js turns each `.work-preview` summary into a live preview. It is
// fetched once the section is about a screen away (or at once without an
// observer), or as soon as the build tour starts (`start()`), and is optional:
// if it is missing or fails, the static summaries stay and nothing throws.
// Returns { done, settled, start }: `done` resolves true once the module is
// wired (false if it is missing or failed); `settled` resolves (never rejects)
// once every preview is live or kept its summary, or the module failed; the
// tour's Lab stop waits on it briefly (entrance.js stopGates).
export const PREVIEWS_URL = './work-previews.js';
export function loadWorkPreviews(document, window, load = () => import(PREVIEWS_URL)) {
  const section = document.querySelector('#lab');
  if (!section || !section.querySelector('.work-preview')) {
    const done = Promise.resolve(false);
    return { done, settled: Promise.resolve(), start: () => done };
  }
  let resolveDone;
  let resolveSettled;
  const done = new Promise(resolve => { resolveDone = resolve; });
  const settled = new Promise(resolve => { resolveSettled = resolve; });
  let started = null;
  let observer = null;
  const start = () => {
    if (started) return started;
    observer?.disconnect();
    started = Promise.resolve().then(load).then(async module => {
      if (typeof module?.initWorkPreviews !== 'function') return false;
      const handle = await module.initWorkPreviews(document, window);
      Promise.resolve(handle?.settled).catch(() => {}).then(() => resolveSettled());
      return true;
    }).catch(error => { window.console?.warn?.('work previews unavailable; keeping the summaries', error); return false; });
    // Without the module the summaries need no reserved room (styles.css).
    started.then(ok => { if (!ok) { section.classList.add('previews-off'); resolveSettled(); } resolveDone(ok); });
    return started;
  };
  if (typeof window.IntersectionObserver !== 'function') start();
  else {
    observer = new window.IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting)) start(); }, { rootMargin: '100% 0px 100% 0px' });
    observer.observe(section);
  }
  return { done, settled, start };
}
let previews = null;

// ---- build tour bootstrap -----------------------------------------------------
// The tour plays once, on a visitor's first normal home load: entrance.js marks
// the visit "seen" as the tour starts, so a reload mid-tour does not restart it.
// After that the hero's "Watch it get built" button and the footer Replay start it
// on request. Deep links, back/forward and reduced motion skip it, so entrance.js
// is only fetched when it will play or when the visitor asks for a replay.
// `stopGates`: the Lab stop waits briefly (entrance.js caps it) for the live
// previews, so they are not swapped in under the agents building the cards.
// Asking for the gate also starts the previews' import: entrance.js asks once
// as the tour starts.
const ENTRANCE_OPTIONS = { stopGates: { '#lab': () => { previews?.start(); return previews?.settled; } } };
// entrance.js's visit flag ('seen' once the tour has played) and its storage probe.
const ENTRANCE_SEEN_KEY = 'cesar:portfolio:agentic-intro:v1';
const ENTRANCE_PROBE_KEY = `${ENTRANCE_SEEN_KEY}:probe`;
// If the tour script takes longer than this to arrive, the page shows as is and the
// tour is not started; Replay still loads it.
const ENTRANCE_WAIT_MS = 4000;
const PENDING_CLASS = 'agentic-pending';
// What motion.js sees before (or without) the real entrance handle.
const IDLE_ENTRANCE = Object.freeze({
  phase: 'ready', sectionsEligible: false, paused: false, touring: false, tour: null, speed: 1,
  stats: Object.freeze({ agents: 0, cursors: 0, targets: 0, done: 0, working: 0, visible: 0 }),
});

// Mirrors shouldPlayEntrance() in entrance.js (and the inline <head> script).
export function entranceWillPlay({ seen, reducedMotion, storageAvailable, hash, navigationType }) {
  return !seen && !reducedMotion && storageAvailable && (!hash || hash === '#home') && navigationType !== 'back_forward';
}

function tourConditions(window) {
  let storageAvailable = false;
  let seen = false;
  try {
    seen = window.localStorage.getItem(ENTRANCE_SEEN_KEY) === 'seen';
    window.localStorage.setItem(ENTRANCE_PROBE_KEY, '1');
    window.localStorage.removeItem(ENTRANCE_PROBE_KEY);
    storageAvailable = true;
  } catch { storageAvailable = false; }
  return {
    seen,
    reducedMotion: Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches),
    storageAvailable,
    hash: window.location?.hash || '',
    navigationType: window.performance?.getEntriesByType?.('navigation')?.[0]?.type,
  };
}

// The hero's "Watch it get built" link (index.html). Without scripts or under
// reduced motion it simply opens the recorded run (lab/build-trace.html); with
// motion allowed a plain click replays the build tour instead. While the tour
// runs the link is hidden (styles.css), and a click then does nothing extra.
export const TOUR_BUTTON_LABELS = Object.freeze({
  replay: 'Watch it get built: a 55-second replay of the agents building this page',
  link: 'Watch it get built: the recorded agent run behind this page',
});
// `fallback` runs when the tour script cannot be loaded (replay resolves to false).
export function bindTourButton(button, { media, replay, touring, fallback }) {
  if (!button) return;
  const sync = () => {
    const mode = media?.matches ? 'link' : 'replay';
    button.dataset.tourMode = mode;
    button.setAttribute('aria-label', TOUR_BUTTON_LABELS[mode]);
  };
  sync();
  media?.addEventListener?.('change', sync);
  button.addEventListener('click', event => {
    // New tab/window, download and reduced motion: the link does what links do.
    if (media?.matches || event.defaultPrevented || event.button > 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    if (touring()) return;
    Promise.resolve(replay()).then(ok => { if (ok === false) fallback?.(); });
  });
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
// `load` is injectable for tests. start() is idempotent: on a first visit the boot
// and a hero-link replay can both be waiting on the same import, and only one may
// create the entrance (one set of listeners, one dock, one tour).
export function lazyEntrance(document, window, load = loadEntrance) {
  let real = null;
  let stub = null;
  let replaying = null;
  const media = window.matchMedia?.('(prefers-reduced-motion: reduce)');

  function start(module) {
    if (real) return real;
    real = module.initAgenticEntrance(document, window, ENTRANCE_OPTIONS);
    return real;
  }

  function replay() {
    if (real) { real.replay(); return Promise.resolve(); }
    if (replaying) return replaying;
    stub?.setAttribute('aria-busy', 'true');
    replaying = load().then(module => {
      const hadFocus = Boolean(stub && document.activeElement === stub);
      start(module);
      // The boot may have started the first-visit tour from the same import, or a
      // late init may already be touring (the URL lost its hash); otherwise replay.
      if (!real.touring) real.replay();
      // The real footer Replay is in place now (hidden while the tour runs).
      stub?.remove();
      stub = null;
      if (hadFocus && !real.touring) document.querySelector('[data-agentic-replay]')?.focus({ preventScroll: true });
    }).catch(() => { stub?.removeAttribute('aria-busy'); return false; })
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
  const tourButton = document.querySelector('[data-tour-replay]');
  bindTourButton(tourButton, {
    media: window.matchMedia?.('(prefers-reduced-motion: reduce)'),
    replay: () => lazy.handle.replay(),
    touring: () => Boolean(lazy.handle.touring),
    fallback: () => window.location.assign(tourButton.getAttribute('href')),
  });
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
  try { initHomeCharts(document, window); } catch (error) { console.error(error); }
  previews = loadWorkPreviews(document, window);
  bootEntrance(document, window);
}

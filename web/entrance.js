// First-visit "agent crew" entrance and guided build tour.
//
// One orchestrator dispatches role-coloured subagents that appear to assemble
// the real, prebuilt page. On an eligible first visit the crew builds the
// hero; then the page scrolls itself from section to section while smaller
// crews assemble each one, and a bottom dock reports how many agents are
// working where. Items are placed one by one (cards pop in, proof lines are
// written, tags cascade); tall sections keep scrolling while that happens.
// The dock also holds the orchestrator's task list, a 1x/2x speed toggle (one
// virtual clock, so 2x never jumps) and short decorative handoff notes; the
// final pill reports the agents that worked and the measured tour time.
// Everything is decorative choreography over existing content:
// no model, network or editor activity takes place, and the dock only counts
// the animated agents and real page sections.
//
// Any visitor input ends the tour where the visitor is, with every element
// visible. A single controller owns one stage, one rAF loop and one event
// timeline per run; the tour chains runs. Geometry is read in one batch (start,
// resize, foreign scroll); while the tour scrolls, cached bounds are shifted by
// the known scroll delta instead of being re-read. Per frame only transforms,
// opacity, clip paths and the tour's own scroll position are written.

const VISIT_KEY = 'cesar:portfolio:agentic-intro:v1';
const SPEED_KEY = 'cesar:portfolio:agentic-tour-speed:v1';
const NOTE_MS = 1800; // handoff notes stay up this long (real time)
const NAME_MAX = 30; // longest item name quoted in an action label
const HERO_BASE = 4600; // HERO_PLAN waves are authored against this
const BUILD_BASE = 2800; // tour section plans are authored against this
const PASS_BASE = 1000; // manual (post-cancel) tracing passes

// Real durations in ms. Hero ~1.6-1.8x the original 4.6 s so each agent's
// work stays readable; lower sections get ~2.3-3.2 s plus the scroll to them.
export const TIMING = {
  hero: { desktop: 8200, tablet: 8000, phone: 7200 },
  build: { desktop: 2200, tablet: 2200, phone: 2100 },
  pass: 1100,
  handoff: 1300,
  pillMs: 10000,
};

export const ROLES = {
  orchestrator: { label: 'orchestrator', color: '#1d1e1b' },
  layout: { label: 'layout', color: '#6f9bff' },
  nav: { label: 'nav', color: '#3ccbb4' },
  type: { label: 'type', color: '#ff6ea9' },
  copy: { label: 'copy', color: '#ffa04a' },
  art: { label: 'art', color: '#a98cff' },
  motion: { label: 'motion', color: '#55c4f5' },
  links: { label: 'links', color: '#72d27c' },
  a11y: { label: 'a11y', color: '#f1cf3a' },
  qa: { label: 'qa', color: '#ff6767' },
};

// Subagents per viewport class (the orchestrator is one extra cursor). The
// hero uses the whole roster; tour stops draw a crew from it, one agent per
// role instance with work, so busy desktop stops show ~15-19 cursors with the
// ride-along crew.
export const CREWS = {
  desktop: { layout: 2, nav: 2, type: 3, copy: 4, art: 2, motion: 1, links: 3, a11y: 1, qa: 2 },
  tablet: { layout: 1, nav: 1, type: 2, copy: 2, art: 1, links: 1, qa: 1 },
  phone: { layout: 1, type: 1, copy: 1, art: 1, qa: 1 },
};
const SECTION_CREW = { desktop: 5, tablet: 4, phone: 3 };
// When a viewport class has no agent for a role, the job goes to the next role.
const FALLBACK = { nav: 'layout', links: 'copy', motion: 'art', a11y: 'qa', type: 'copy', copy: 'layout', art: 'layout', qa: 'layout' };

export function crewTier(width) {
  return width >= 1100 ? 'desktop' : width >= 640 ? 'tablet' : 'phone';
}
export function crewSize(width) {
  return Object.values(CREWS[crewTier(width)]).reduce((sum, count) => sum + count, 0);
}

// Hero jobs, authored against a 4.6 s baseline. `wave` is the earliest dispatch.
// `each` jobs are individual on desktop and grouped under `group` elsewhere.
// `act` is the short action label shown on the working cursor.
const HERO_PLAN = [
  { sel: '.site-header', role: 'layout', kind: 'frame', wave: 420, act: 'framing header' },
  { sel: '#hero-title', role: 'layout', kind: 'frame', wave: 420, act: 'framing title' },
  { sel: '.hero-bottom', role: 'layout', kind: 'frame', wave: 420, act: 'framing intro row' },
  { sel: '.wordmark', role: 'nav', kind: 'reveal', wave: 470, act: 'placing wordmark' },
  { sel: '.main-nav a', role: 'nav', kind: 'reveal', wave: 470, each: true, group: '.main-nav', act: 'linking nav' },
  { sel: '.header-contact', role: 'nav', kind: 'reveal', wave: 470, act: 'placing résumé link' },
  { sel: '.hero-kicker', role: 'copy', kind: 'type', wave: 600, charMs: 24, act: 'writing location' },
  { sel: '.hero-line > span', role: 'type', kind: 'type', wave: 820, each: true, charMs: 66, act: 'setting headline' },
  { sel: '.hero-fade', role: 'type', kind: 'type', wave: 820, charMs: 66, act: 'setting headline' },
  { sel: '.sculpture', role: 'art', kind: 'reveal', wave: 760, work: 720, art: true, act: 'placing sculpture' },
  { sel: '.orbit-label', role: 'art', kind: 'reveal', wave: 760, act: 'labelling orbit' },
  { sel: '.art-coordinate', role: 'art', kind: 'reveal', wave: 760, act: 'marking coordinate' },
  { sel: '.hero-intro .small-label', role: 'copy', kind: 'type', wave: 1050, charMs: 22, act: 'writing greeting' },
  { sel: '.hero-intro > p:not(.hero-scope)', role: 'copy', kind: 'wipe', wave: 1050, act: 'writing intro' },
  { sel: '.hero-scope', role: 'copy', kind: 'wipe', wave: 1050, act: 'writing scope' },
  { sel: '.hero-rule > span', role: 'copy', kind: 'wipe', wave: 1180, each: true, group: '.hero-rule', act: 'writing footer rule' },
  { sel: '.scroll-cue', role: 'links', kind: 'reveal', wave: 1180, act: 'wiring scroll cue' },
  { sel: '.hero-actions .pill-button', role: 'links', kind: 'reveal', wave: 1180, act: 'wiring résumé' },
  { sel: '.hero-links a', role: 'links', kind: 'reveal', wave: 1180, each: true, group: '.hero-links', act: 'wiring links' },
  { sel: '.hero-art', role: 'motion', kind: 'orbit', wave: 1650, act: 'aligning orbit' },
  { sel: '.main-nav', role: 'a11y', kind: 'review', wave: 2150, size: true, act: 'checking targets' },
  { sel: '.hero-actions', role: 'a11y', kind: 'review', wave: 2150, size: true, act: 'checking hit areas' },
  { sel: '.hero-line', role: 'qa', kind: 'review', wave: 2250, act: 'checking contrast' },
  { sel: '.hero-intro', role: 'qa', kind: 'review', wave: 2250, act: 'checking spacing' },
];

// Guided tour stops after the hero. Each stop has its own crew: the jobs'
// roles decide how many agents work there. Build-stop job options:
// - `multi`: how many matching items get their own job (default 1); `rest`
//   cascades any further items in one quick extra job.
// - `roles`: cycled per item, so parallel agents alternate items.
// - `label`: append the item's name (`name` selector) to the action label.
// - kind `place`: the item pops in when the agent drops it; then its `sub`
//   line is written and its `kids` (tags) cascade in.
// `weight` scales the build budget; `span` keeps scrolling through a tall
// section (up to span x viewport height) while items are placed; `note` is the
// stop's decorative handoff line beside the dock.
export const TOUR_STOPS = [
  { sel: '#home', name: 'Hero', note: 'type → qa · headline ready' },
  { sel: '#about', name: 'About', weight: 0.9, align: 'start', note: 'motion → type · flow drawn', jobs: [
    { sel: '.about-flow', role: 'motion', kind: 'reveal', act: 'drawing flow field', work: 900 },
    { sel: '.about-transition-meta > span', roles: ['copy', 'layout'], kind: 'wipe', multi: 2, act: 'writing meta line' },
    { sel: '.about-panel-index', role: 'copy', kind: 'type', act: 'setting panel index', charMs: 40 },
    { sel: '#about-title', role: 'type', kind: 'type', act: 'setting title', charMs: 110 },
    { sel: '.about-discover', role: 'links', kind: 'place', act: 'placing arrow link' },
    { sel: '.about-transition-foot > span', roles: ['copy', 'links'], kind: 'wipe', multi: 2, act: 'writing footer line' },
    { sel: '.about-title-panel', role: 'art', kind: 'frame', act: 'framing panel' },
    { sel: '.about-transition-meta', role: 'qa', kind: 'review', act: 'checking alignment' },
    { sel: '.about-transition-foot', role: 'a11y', kind: 'review', act: 'checking contrast' },
  ] },
  // Its copy sits at the bottom of a tall scene: stop with the section's end in view.
  { sel: '#introduction', name: 'Introduction', weight: 1.0, align: 'end', note: 'art → copy · scene lit', jobs: [
    { sel: '.cinematic-art', role: 'art', kind: 'reveal', act: 'placing light sculpture', art: true, work: 820 },
    { sel: '.cinematic-topline > span', roles: ['layout', 'copy'], kind: 'wipe', multi: 2, act: 'setting topline' },
    { sel: '.cinematic-copy > .mono', role: 'type', kind: 'type', act: 'setting kicker', charMs: 26 },
    { sel: '#introduction-title', role: 'type', kind: 'type', act: 'setting headline', charMs: 40 },
    { sel: '.cinematic-copy > p:first-of-type', role: 'copy', kind: 'wipe', act: 'writing intro' },
    { sel: '.cinematic-copy > p:nth-of-type(2)', role: 'copy', kind: 'wipe', act: 'writing background' },
    { sel: '.currently', role: 'copy', kind: 'wipe', act: 'writing current study' },
    { sel: '.scene-pill', roles: ['links', 'links'], kind: 'place', multi: 2, label: true, act: 'wiring' },
    { sel: '.cinematic-caption > span', roles: ['a11y', 'qa'], kind: 'wipe', multi: 2, act: 'writing caption' },
  ] },
  { sel: '#capabilities', name: 'Capabilities', weight: 1.3, span: 0.9, note: 'copy → qa · cards placed', jobs: [
    { sel: '.section-top > span', roles: ['layout', 'layout'], kind: 'wipe', multi: 2, act: 'setting header row' },
    { sel: '#capabilities-title', role: 'type', kind: 'type', act: 'setting title', charMs: 70 },
    { sel: '.capabilities-heading > p', role: 'copy', kind: 'wipe', act: 'writing summary' },
    { sel: '.capability', roles: ['copy', 'type', 'links', 'copy', 'type', 'links', 'copy', 'qa'], kind: 'place', multi: 8, label: true, name: 'h3', act: 'placing', sub: '.capability-proof', kids: '.tag-list li' },
    { sel: '.capabilities-heading', role: 'qa', kind: 'review', act: 'checking alignment' },
  ] },
  { sel: '#experience', name: 'Experience', weight: 1.55, span: 1.25, note: 'layout → copy · roles framed', jobs: [
    { sel: '.section-top > span', roles: ['layout', 'layout'], kind: 'wipe', multi: 2, act: 'setting header row' },
    { sel: '#experience-title', role: 'type', kind: 'type', act: 'setting title', charMs: 70 },
    { sel: '.experience-heading > p', role: 'copy', kind: 'wipe', act: 'writing summary' },
    { sel: '.role-header', role: 'layout', kind: 'frame', multi: 2, act: 'framing role header' },
    { sel: '.role-group-head', role: 'nav', kind: 'place', multi: 4, label: true, name: 'h4', act: 'placing' },
    { sel: '.role-points > li', roles: ['copy', 'type', 'links', 'copy', 'type', 'qa', 'copy', 'links'], kind: 'wipe', multi: 8, rest: true, label: true, act: 'writing' },
    { sel: '.role-group > .tag-list', roles: ['art', 'a11y', 'art', 'links'], kind: 'place', multi: 4, act: 'tagging tools', kids: 'li' },
  ] },
  { sel: '#work', name: 'Projects', weight: 1, span: 0.45, note: 'art → qa · covers placed', jobs: [
    { sel: '.section-top > span', roles: ['layout', 'layout'], kind: 'wipe', multi: 2, act: 'setting header row' },
    { sel: '#work-title', role: 'type', kind: 'type', act: 'setting title', charMs: 70 },
    { sel: '.work-heading > p', role: 'copy', kind: 'wipe', act: 'writing summary' },
    { sel: '.project-card', role: 'art', kind: 'place', multi: 4, shown: true, byX: true, label: true, name: 'h3', act: 'placing' },
    { sel: '.gallery-controls', role: 'links', kind: 'place', act: 'wiring gallery controls', kids: 'button, .gallery-count' },
    { sel: '.work-end > *', roles: ['copy', 'links'], kind: 'wipe', multi: 2, act: 'writing footer line' },
    { sel: '.gallery-ground', role: 'motion', kind: 'reveal', act: 'drawing card shadows', work: 700 },
    { sel: '.gallery-stage', role: 'a11y', kind: 'review', act: 'checking arrow keys' },
    { sel: '.project-card:not([aria-hidden="true"]) .project-image-link', role: 'qa', kind: 'review', act: 'checking cover alt text', size: true },
  ] },
  { sel: '#skills', name: 'Skills', weight: 1.1, span: 0.75, note: 'copy → a11y · tags listed', jobs: [
    { sel: '.section-top > span', roles: ['layout', 'layout'], kind: 'wipe', multi: 2, act: 'setting header row' },
    { sel: '#skills-title', role: 'type', kind: 'type', act: 'setting title', charMs: 70 },
    { sel: '.skill-list > div', roles: ['copy', 'type', 'links', 'copy', 'type'], kind: 'place', multi: 5, label: true, name: 'dt', act: 'listing', kids: 'li' },
    { sel: '.education-layout > h3', role: 'nav', kind: 'type', multi: 2, act: 'setting heading', charMs: 50 },
    { sel: '.education-list > li', roles: ['copy', 'links'], kind: 'place', multi: 2, label: true, name: '.school', act: 'placing', kids: '.degree, .school-meta' },
    { sel: '.spoken-languages', role: 'copy', kind: 'wipe', act: 'writing languages' },
    { sel: '.skills-layout', role: 'a11y', kind: 'review', act: 'checking tag lists' },
  ] },
  { sel: '#approach', name: 'Approach', weight: 0.9, span: 0.3, note: 'type → copy · rows set', jobs: [
    { sel: '.section-top > span', roles: ['layout', 'layout'], kind: 'wipe', multi: 2, act: 'setting header row' },
    { sel: '#approach-title', role: 'type', kind: 'type', act: 'setting title', charMs: 70 },
    { sel: '.approach-heading > p', role: 'copy', kind: 'wipe', act: 'writing summary' },
    { sel: '.approach-list > details', roles: ['copy', 'type', 'links'], kind: 'place', multi: 3, label: true, name: 'summary > span:nth-child(2)', act: 'placing', sub: ':scope > p' },
    { sel: '.approach-list', role: 'a11y', kind: 'review', act: 'checking disclosures' },
    { sel: '.approach-heading', role: 'qa', kind: 'review', act: 'checking alignment' },
  ] },
  { sel: '#contact', name: 'Contact', weight: 1, handoff: '.contact-button', note: 'links → qa · links wired', jobs: [
    { sel: '.section-top > *', roles: ['layout', 'layout'], kind: 'wipe', multi: 2, act: 'setting header row' },
    { sel: '.contact-intro', role: 'copy', kind: 'type', act: 'writing intro line', charMs: 32 },
    { sel: '#contact-title', role: 'type', kind: 'type', act: 'setting headline', charMs: 80 },
    { sel: '.contact-button', role: 'links', kind: 'place', act: 'placing email button' },
    { sel: '.contact-links li', roles: ['links', 'links', 'links'], kind: 'place', multi: 3, label: true, act: 'wiring' },
    { sel: '.footer-bottom > span', roles: ['copy', 'nav', 'copy'], kind: 'wipe', multi: 3, act: 'writing footer' },
    { sel: '.contact-links', role: 'a11y', kind: 'review', act: 'checking link targets', size: true },
    { sel: '.footer-bottom', role: 'qa', kind: 'review', act: 'checking footer' },
  ] },
];

// Manual-scroll passes (after a cancelled tour) only trace content: nothing
// is hidden. Targets stay within elements that motion.js keeps still while
// such passes are possible (see SECTION_TARGETS).
const SECTION_PLAN = [
  { sel: 'h2:not(.cinematic-copy h2)', role: 'type', kind: 'caret', act: 'checking heading' },
  { sel: '.about-title-panel, .cinematic-art, .project-card:not([aria-hidden="true"]) .project-image-link', role: 'art', kind: 'frame', cross: true, act: 'framing artwork' },
  { sel: '.cinematic-copy, .approach-heading > p', role: 'copy', kind: 'review', act: 'reviewing copy' },
  { sel: '.section-top, .about-transition-meta, .cinematic-topline', role: 'layout', kind: 'frame', act: 'framing layout' },
  { sel: '.scene-actions, .contact-button', role: 'links', kind: 'review', size: true, act: 'checking links' },
  { sel: '.approach-list details, .capability-list, .role, .skill-list', role: 'qa', kind: 'review', multi: 2, act: 'checking spacing' },
];
// Everything a manual pass may frame; motion.js keeps these still meanwhile.
export const SECTION_TARGETS = SECTION_PLAN.map(spec => spec.sel).join(', ');

// The dock lifts itself above these so it never covers résumé/contact controls.
const PROTECTED = '.hero-actions .pill-button, .hero-links a, .contact-button, .contact-links a, .footer-bottom > *';

const HIDES = new Set(['reveal', 'type', 'wipe', 'place']);
const OPTIONAL = new Set(['frame', 'review', 'orbit', 'caret']);
const TEXT_KINDS = new Set(['type', 'wipe', 'caret']);
const DEMOTE = { reveal: 'frame', type: 'caret', wipe: 'review', place: 'review' };
const ZERO = { x: 0, y: 0, w: 0, h: 0 };
const SVG = '<svg viewBox="0 0 20 26" width="17" height="22" aria-hidden="true"><path d="M2.5 1.8v19.4l5.2-4.9 3.5 7.9 3.2-1.4-3.4-7.8h7.1z"/></svg>';

const clamp01 = value => (value < 0 ? 0 : value > 1 ? 1 : value);
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const easeInOut = p => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
const easeOut = p => 1 - Math.pow(1 - p, 4);
// Gentle glide for the tour's page scroll (lower peak speed than cubic).
const easeGlide = p => -(Math.cos(Math.PI * p) - 1) / 2;
const distance = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);
const positive = (value, fallback) => (Number.isFinite(value) && value > 0 ? value : fallback);

export function shouldPlayEntrance({ seen, reducedMotion, storageAvailable, hash, navigationType }) {
  return !seen && !reducedMotion && storageAvailable && (!hash || hash === '#home') && navigationType !== 'back_forward';
}

export function initAgenticEntrance(document, window, config = {}) {
  const hero = document.querySelector('#home');
  const idleStats = { agents: 0, cursors: 0, targets: 0, done: 0, working: 0, visible: 0 };
  const width = () => window.innerWidth || 1024;
  if (!hero) {
    return { phase: 'ready', sectionsEligible: false, paused: false, touring: false, tour: null, stats: idleStats, crewTier: crewTier(width()), crewSize: crewSize(width()), whenTourEnds: fn => fn(), skip() {}, replay() {} };
  }
  const heroDuration = tier => positive(config.heroDuration, TIMING.hero[tier]);
  const buildDuration = tier => positive(config.buildDuration, TIMING.build[tier]);
  const passDuration = positive(config.sectionDuration, TIMING.pass);
  const handoffDuration = positive(config.handoffDuration, TIMING.handoff);
  const pillMs = positive(config.pillDuration, TIMING.pillMs);
  const clock = typeof config.now === 'function' ? config.now : () => (window.performance?.now ? window.performance.now() : Date.now());
  let storage;
  let seen = false;
  try {
    storage = window.localStorage;
    seen = storage.getItem(VISIT_KEY) === 'seen';
    storage.setItem(`${VISIT_KEY}:probe`, '1');
    storage.removeItem(`${VISIT_KEY}:probe`);
  } catch { storage = null; }
  const media = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  const navigationType = window.performance?.getEntriesByType?.('navigation')?.[0]?.type;
  const root = document.documentElement;
  let phase = 'ready';
  let sectionsEligible = false;
  let run = null;
  let tour = null;
  let tourY = 0;
  let observer;
  let destroyed = false;
  let currentSection = null;
  let frameHandle = 0;
  let frameIsRaf = false;
  let paused = false;
  let pausedAt = 0;
  let dirty = false;
  let dock = null;
  let liftFrame = 0;
  let lastStats = { ...idleStats };
  let builtCount = 0;
  // Agents that stay on screen between tour stops: [{ role, label, x, y }].
  let carry = null;
  // Tour clock rate (1x or 2x). Runs integrate real time x speed, so changing
  // it mid-tour never jumps.
  let speed = 1;
  try { speed = window.localStorage?.getItem(SPEED_KEY) === '2' ? 2 : 1; } catch { speed = 1; }
  // The orchestrator's plan as shown in the dock's task list.
  let planSteps = [];
  let planOpen = false;
  const tourEndCallbacks = [];
  const visitedSections = new Set();

  const replayButton = document.createElement('button');
  replayButton.type = 'button';
  replayButton.className = 'agentic-replay';
  replayButton.dataset.agenticReplay = '';
  replayButton.textContent = 'Replay build tour ↗';
  replayButton.hidden = true;
  replayButton.disabled = Boolean(media?.matches);
  // Keep the footer's own last item last: its layout pins the final child.
  const footerBottom = document.querySelector('.footer-bottom');
  if (footerBottom?.lastElementChild) footerBottom.insertBefore(replayButton, footerBottom.lastElementChild);
  else (document.querySelector('footer') || document.body).append(replayButton);

  // ---- one loop -----------------------------------------------------------
  function schedule() {
    if (frameHandle || !run || paused) return;
    if (typeof window.requestAnimationFrame === 'function') {
      frameIsRaf = true;
      frameHandle = window.requestAnimationFrame(tick);
    } else {
      frameIsRaf = false;
      frameHandle = window.setTimeout(tick, 16);
    }
  }

  function cancelFrame() {
    if (!frameHandle) return;
    if (frameIsRaf) window.cancelAnimationFrame?.(frameHandle);
    else window.clearTimeout(frameHandle);
    frameHandle = 0;
  }

  function tick() {
    frameHandle = 0;
    const current = run;
    if (!current || paused) return;
    try {
      const t = runTime(current);
      if (current.scroll && !current.scroll.done) driveScroll(current, t);
      if (dirty) { dirty = false; measure(current); current.version++; }
      while (current.next < current.events.length && current.events[current.next].at <= t) {
        current.events[current.next++].fn(t);
        if (run !== current) return;
      }
      current.active.forEach(job => job.update(t));
      current.agents.forEach(agent => placeAgent(current, agent, t));
      if (t >= current.total) {
        // Hand the ride-along crew's positions to the next stop.
        carry = tour && current.stayers?.size
          ? [...current.stayers].filter(agent => agent.x !== undefined).map(agent => ({ role: agent.role, label: agent.label, x: agent.x, y: agent.y }))
          : null;
        const complete = current.onComplete;
        clearVisuals();
        complete();
        return;
      }
      schedule();
    } catch {
      stop(false);
    }
  }

  // CSS transition lengths follow the tour clock, so 2x stays in sync.
  const realMs = ms => Math.round(Math.max(0, ms) / speed);

  // Virtual run time: real time since the last frame, times the tour speed.
  function runTime(current) {
    const now = clock();
    current.vt += Math.max(0, now - current.last) * speed;
    current.last = now;
    return current.vt;
  }

  // ---- the tour's own scrolling -------------------------------------------
  function readScrollY() {
    const y = window.scrollY ?? window.pageYOffset ?? 0;
    return Number.isFinite(y) ? y : 0;
  }

  function scrollToY(y) {
    try { window.scrollTo({ top: y, left: 0, behavior: 'instant' }); }
    catch { try { window.scrollTo(0, y); } catch { /* no scrolling available */ } }
    tourY = readScrollY();
  }

  // A glide to the stop, then a slow creep while the crew works, so the page
  // never sits completely still between sections.
  function driveScroll(current, t) {
    const scroll = current.scroll;
    const p = clamp01(t / Math.max(1, scroll.ms));
    let y = scroll.from + (scroll.to - scroll.from) * easeGlide(p);
    const creepFrom = scroll.ms + (scroll.hold || 0);
    if (scroll.creep && t > creepFrom) y = scroll.to + scroll.creep * easeInOut(clamp01((t - creepFrom) / Math.max(1, scroll.creepMs)));
    y = Math.round(y);
    if (y !== Math.round(tourY)) scrollToY(y);
    if (tourY !== current.sy) {
      current.sy = tourY;
      current.dy = current.sy - current.sy0;
      current.view.clear();
      current.version++;
    }
    if (placeDock()) remeasureDots(current);
    if (p >= 1 && !scroll.settled) { scroll.settled = true; dirty = true; }
    if (p >= 1 && (!scroll.creep || t >= creepFrom + scroll.creepMs)) scroll.done = true;
  }

  // ---- cleanup ------------------------------------------------------------
  function cleanTarget(element) {
    element.removeAttribute('data-build-state');
    element.removeAttribute('data-build-kind');
    element.removeAttribute('data-agentic-job');
    element.classList.remove('agentic-target');
    element.style.removeProperty('clip-path');
    element.style.removeProperty('--agentic-d');
    element.style.removeProperty('transition-delay');
  }

  function clearVisuals() {
    cancelFrame();
    paused = false;
    if (run) {
      lastStats = statsOf(run);
      run.marked.forEach(cleanTarget);
      run.stage.remove();
      run.working.clear();
    }
    run = null;
    currentSection = null;
    root.classList.remove('agentic-running');
    if (dock) { setWorking(0); dock.root.classList.remove('is-busy'); }
  }

  function persist() {
    try { storage?.setItem(VISIT_KEY, 'seen'); }
    catch { sectionsEligible = false; observer?.disconnect(); }
  }

  function flushTourEnd() {
    root.classList.remove('agentic-touring');
    tourEndCallbacks.splice(0).forEach(callback => { try { callback(); } catch { /* motion settles itself */ } });
  }

  // Skip, Escape, Tab, navigation, errors: settle everything, no more passes.
  function stop(save = true, keepDock = save) {
    const focusInDock = Boolean(dock?.root.contains(document.activeElement));
    const focusInStage = Boolean(run?.stage.contains(document.activeElement));
    const wasTouring = Boolean(tour);
    tour = null;
    carry = null;
    settlePlan();
    sectionsEligible = false;
    observer?.disconnect();
    clearVisuals();
    phase = 'ready';
    replayButton.hidden = false;
    if (save) persist();
    if (wasTouring) {
      if (keepDock) collapseDock('Tour skipped. All content is visible.');
      else removeDock();
      flushTourEnd();
    } else if (!keepDock) {
      removeDock();
    }
    restoreFocus(focusInDock || focusInStage);
  }

  // Wheel, touch, keys, pointer or a scroll the tour did not cause: the
  // visitor takes over where they are. First visits may still trace sections
  // the tour had not reached.
  function cancelTour() {
    if (!tour) return;
    const focusInDock = Boolean(dock?.root.contains(document.activeElement));
    const allowPasses = tour.firstVisit;
    tour = null;
    carry = null;
    settlePlan();
    clearVisuals();
    phase = 'ready';
    replayButton.hidden = false;
    sectionsEligible = allowPasses;
    persist();
    collapseDock('Tour stopped. All content is visible.');
    flushTourEnd();
    if (sectionsEligible) watchSections();
    restoreFocus(focusInDock);
  }

  function restoreFocus(needed) {
    if (!needed) return;
    const target = dock && !dock.root.hidden && dock.replay;
    if (target) { target.focus({ preventScroll: true }); return; }
    const heading = hero.querySelector('h1');
    heading?.setAttribute('tabindex', '-1');
    heading?.focus({ preventScroll: true });
  }

  function statsOf(current) {
    const subagents = current.agents.filter(agent => agent.role !== 'orchestrator').length;
    const visible = current.agents.filter(agent => agent.cursor?.classList.contains('is-in') && !agent.cursor.classList.contains('is-docked')).length;
    return { agents: subagents, cursors: current.agents.length, targets: current.jobs.length, done: current.done, working: current.working.size, visible };
  }

  // ---- dock ---------------------------------------------------------------
  // [Plan] dots · N agents working · Section k / 9 [1x] [Skip tour]; above it
  // the orchestrator's task list (opened by Plan) and a decorative handoff
  // note. After the tour: [Plan] Built by N agents in X s · Replay · ×.
  function ensureDock() {
    if (dock) { dock.root.hidden = false; return dock; }
    const element = make('div', 'agentic-dock');
    element.setAttribute('role', 'region');
    element.setAttribute('aria-label', 'Page build tour');
    const live = make('p', 'agentic-dock-live', element);
    live.setAttribute('aria-live', 'polite');
    const planBox = make('div', 'agentic-plan', element);
    planBox.id = `agentic-plan-${Math.random().toString(36).slice(2, 8)}`;
    planBox.hidden = true;
    const planTitle = make('p', 'agentic-plan-title', planBox);
    planTitle.textContent = 'Orchestrator plan';
    const planList = make('ol', 'agentic-plan-list', planBox);
    planList.setAttribute('aria-label', 'Orchestrator plan');
    const note = make('p', 'agentic-note', element);
    note.setAttribute('aria-hidden', 'true');
    const toggle = make('button', 'agentic-dock-plan', element);
    toggle.type = 'button';
    toggle.dataset.agenticPlan = '';
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-controls', planBox.id);
    toggle.setAttribute('aria-label', 'Build plan');
    toggle.innerHTML = '<span class="agentic-plan-icon" aria-hidden="true"></span><span class="agentic-plan-word" aria-hidden="true">Plan</span>';
    toggle.addEventListener('click', () => setPlanOpen(!planOpen));
    const face = make('div', 'agentic-dock-face', element);
    face.setAttribute('aria-hidden', 'true');
    const dots = make('span', 'agentic-dock-dots', face);
    const status = make('span', 'agentic-dock-status', face);
    const count = make('b', 'agentic-dock-count', status);
    const unit = make('span', 'agentic-dock-unit', status);
    make('span', 'agentic-dock-sep', status).textContent = '·';
    const where = make('span', 'agentic-dock-where', status);
    const progress = make('span', 'agentic-dock-progress', status);
    const summary = make('span', 'agentic-dock-summary', face);
    const speedButton = make('button', 'agentic-dock-speed', element);
    speedButton.type = 'button';
    speedButton.dataset.agenticSpeed = '';
    speedButton.addEventListener('click', () => setSpeed(speed === 2 ? 1 : 2));
    const skip = make('button', 'agentic-dock-skip', element);
    skip.type = 'button';
    skip.dataset.agenticSkip = '';
    skip.innerHTML = 'Skip<span class="agentic-dock-skip-more"> tour</span>';
    skip.setAttribute('aria-label', 'Skip tour');
    skip.addEventListener('click', () => stop());
    const replay = make('button', 'agentic-dock-replay', element);
    replay.type = 'button';
    replay.dataset.agenticDockReplay = '';
    replay.textContent = 'Replay';
    replay.setAttribute('aria-label', 'Replay the build tour from the top');
    replay.addEventListener('click', () => startTour(true));
    const close = make('button', 'agentic-dock-close', element);
    close.type = 'button';
    close.setAttribute('aria-label', 'Dismiss build tour summary');
    close.innerHTML = '<span aria-hidden="true">×</span>';
    close.addEventListener('click', () => removeDock());
    document.body.append(element);
    dock = { root: element, live, plan: planBox, planList, note, toggle, dots, count, unit, where, progress, summary, speed: speedButton, skip, replay, close, working: -1, timer: 0, noteTimer: 0, lift: 0, announced: '' };
    planOpen = false;
    setWorking(0);
    renderSpeed();
    renderPlan();
    return dock;
  }

  function setWorking(n) {
    if (!dock || dock.working === n) return;
    dock.working = n;
    dock.count.textContent = String(n);
    dock.unit.innerHTML = `<span class="agentic-dock-agents">${n === 1 ? 'agent' : 'agents'} </span>working`;
    if (tour && planSteps[tour.index]?.state === 'building') { planSteps[tour.index].agents = n; renderPlan(); }
  }

  function announce(text) {
    if (!dock || dock.announced === text) return;
    dock.announced = text;
    dock.live.textContent = text;
  }

  // ---- the orchestrator's plan (task list) ---------------------------------
  const planName = name => `Build ${name === 'Hero' ? 'hero' : name}`;
  const planState = step => (step.state === 'building' ? `building · ${step.agents} ${step.agents === 1 ? 'agent' : 'agents'}` : step.state);
  function renderPlan() {
    if (!dock) return;
    const list = dock.planList;
    if (list.children.length !== planSteps.length) {
      list.textContent = '';
      planSteps.forEach(() => {
        const item = make('li', 'agentic-plan-item', list);
        make('span', 'agentic-plan-mark', item).setAttribute('aria-hidden', 'true');
        make('span', 'agentic-plan-name', item);
        make('span', 'agentic-plan-state', item);
      });
    }
    planSteps.forEach((step, index) => {
      const item = list.children[index];
      if (item.dataset.state !== step.state) {
        item.dataset.state = step.state;
        item.children[0].textContent = step.state === 'done' ? '✓' : step.state === 'building' ? '●' : '○';
      }
      if (item.children[1].textContent !== step.label) item.children[1].textContent = step.label;
      const text = planState(step);
      if (item.children[2].textContent !== text) item.children[2].textContent = text;
    });
  }
  function setPlanStep(index, state) {
    planSteps.forEach((step, k) => {
      if (k < index && state === 'building') { step.state = 'done'; step.agents = 0; }
    });
    if (planSteps[index]) { planSteps[index].state = state; planSteps[index].agents = 0; }
    renderPlan();
  }
  function setPlanOpen(open) {
    planOpen = Boolean(open && dock);
    if (!dock) return;
    dock.plan.hidden = !planOpen;
    dock.toggle.setAttribute('aria-expanded', String(planOpen));
    dock.root.classList.toggle('is-plan-open', planOpen);
    if (planOpen) { renderPlan(); placeDock(); }
    else if (dock.plan.contains(document.activeElement)) dock.toggle.focus({ preventScroll: true });
    if (!planOpen && !run && !tour) armPill();
  }

  // ---- speed ----------------------------------------------------------------
  function renderSpeed() {
    if (!dock) return;
    dock.speed.textContent = `${speed}×`;
    dock.speed.setAttribute('aria-pressed', String(speed === 2));
    dock.speed.setAttribute('aria-label', 'Double tour speed');
  }
  function setSpeed(next) {
    // Bank the time so far at the old rate; the clock changes from now on.
    if (run && !paused) runTime(run);
    speed = next === 2 ? 2 : 1;
    try { storage?.setItem(SPEED_KEY, String(speed)); } catch { /* the setting just isn't kept */ }
    renderSpeed();
  }

  // ---- handoff notes (decorative, one at a time) -----------------------------
  function showNote(text) {
    if (!dock || !text) return;
    window.clearTimeout(dock.noteTimer);
    dock.note.textContent = text;
    dock.note.classList.add('is-on');
    dock.noteTimer = window.setTimeout(() => dock?.note.classList.remove('is-on'), NOTE_MS);
  }
  function hideNote() {
    if (!dock) return;
    window.clearTimeout(dock.noteTimer);
    dock.note.classList.remove('is-on');
  }

  function showTourDock(stopIndex) {
    const d = ensureDock();
    clearTimeout(d.timer);
    d.root.dataset.state = 'tour';
    d.root.classList.remove('is-busy');
    const stopInfo = tour.stops[stopIndex];
    d.where.textContent = stopInfo.name;
    d.progress.textContent = `${stopIndex + 1} / ${tour.stops.length}`;
    setPlanStep(stopIndex, 'building');
    announce(stopIndex === 0
      ? `Build tour: agents are assembling the page, starting with the ${stopInfo.name.toLowerCase()}. Skip tour is available.`
      : `Building ${stopInfo.name}, section ${stopIndex + 1} of ${tour.stops.length}.`);
  }

  function collapseDock(message, summary) {
    if (!dock) return;
    dock.root.dataset.state = 'pill';
    dock.root.classList.remove('is-busy');
    dock.summary.textContent = summary || `${builtCount || crewSize(width())} agents built this page`;
    dock.dots.textContent = '';
    setWorking(0);
    hideNote();
    renderPlan();
    announce(message);
    armPill();
    placeDock();
  }

  function armPill() {
    if (!dock) return;
    clearTimeout(dock.timer);
    dock.timer = window.setTimeout(() => {
      if (run || tour || !dock) return;
      // Keep it while the visitor is reading the plan or using the pill.
      if (planOpen || dock.root.contains(document.activeElement)) { armPill(); return; }
      removeDock();
    }, pillMs);
  }

  function removeDock() {
    if (!dock) return;
    const hadFocus = dock.root.contains(document.activeElement);
    clearTimeout(dock.timer);
    clearTimeout(dock.noteTimer);
    dock.root.remove();
    dock = null;
    planOpen = false;
    if (hadFocus) { replayButton.hidden = false; replayButton.focus({ preventScroll: true }); }
  }

  // Cursors launch from and return to their dot in the dock (or an invisible
  // home row when the dock was dismissed).
  function setDockCrew(current, fallback) {
    const parent = dock ? dock.dots : make('span', 'agentic-home', fallback);
    parent.textContent = '';
    current.agents.forEach(agent => {
      agent.dot = make('i', `agentic-dot${agent.role === 'orchestrator' ? ' is-orchestrator' : ''}`, parent);
      agent.dot.style.setProperty('--agent-color', ROLES[agent.role].color);
      current.dots.push(agent.dot);
    });
  }

  // Keep the dock clear of résumé and contact controls near the bottom edge.
  function placeDock() {
    if (!dock || dock.root.hidden) return false;
    const vh = window.innerHeight || 768;
    const rect = dock.root.getBoundingClientRect();
    if (!rect.height) return false;
    const base = (parseFloat(window.getComputedStyle?.(dock.root).bottom) || 14) - dock.lift;
    let lift = 0;
    const boxes = [...document.querySelectorAll(PROTECTED)].map(element => element.getBoundingClientRect())
      .filter(r => r.height > 0 && r.top < vh && r.bottom > 0 && r.right > rect.left - 8 && r.left < rect.right + 8);
    for (let pass = 0; pass < 6; pass++) {
      const bottom = vh - base - lift;
      const top = bottom - rect.height;
      const hit = boxes.find(r => r.top < bottom + 6 && r.bottom > top - 6);
      if (!hit) break;
      lift = vh - base - hit.top + 10;
    }
    lift = Math.round(clamp(lift, 0, vh * 0.5));
    if (Math.abs(lift - dock.lift) < 1) return false;
    dock.lift = lift;
    dock.root.style.setProperty('--agentic-dock-lift', `${lift}px`);
    return true;
  }

  function schedulePlaceDock() {
    if (!dock || liftFrame) return;
    const raf = typeof window.requestAnimationFrame === 'function' ? window.requestAnimationFrame.bind(window) : callback => window.setTimeout(callback, 16);
    liftFrame = raf(() => {
      liftFrame = 0;
      if (placeDock() && run) remeasureDots(run);
    });
  }

  // ---- geometry -----------------------------------------------------------
  function readRect(element) {
    const rect = element.getBoundingClientRect();
    return { x: rect.left, y: rect.top, w: rect.width, h: rect.height };
  }

  // Text bounds per rendered line, from text nodes only (blockified children
  // would otherwise add multi-line boxes).
  function readText(element) {
    if (typeof document.createRange !== 'function' || typeof document.createTreeWalker !== 'function') return null;
    const range = document.createRange();
    if (typeof range.getClientRects !== 'function') return null;
    const walker = document.createTreeWalker(element, 4);
    const lines = [];
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (!node.nodeValue.trim()) continue;
      range.selectNodeContents(node);
      for (const r of range.getClientRects()) {
        if (r.width < 2 || r.height < 2) continue;
        const mid = r.top + r.height / 2;
        const line = lines.find(l => mid > l.y && mid < l.y + l.h);
        if (line) {
          const right = Math.max(line.x + line.w, r.right);
          const bottom = Math.max(line.y + line.h, r.bottom);
          line.x = Math.min(line.x, r.left);
          line.y = Math.min(line.y, r.top);
          line.w = right - line.x;
          line.h = bottom - line.y;
        } else {
          lines.push({ x: r.left, y: r.top, w: r.width, h: r.height });
        }
      }
    }
    if (!lines.length) return null;
    lines.sort((a, b) => a.y - b.y);
    const x = Math.min(...lines.map(l => l.x));
    const right = Math.max(...lines.map(l => l.x + l.w));
    const last = lines[lines.length - 1];
    return { x, y: lines[0].y, w: right - x, h: last.y + last.h - lines[0].y, lines, last };
  }

  // One batch of reads; nothing is written between them.
  function measure(current) {
    current.vw = window.innerWidth || 1024;
    current.vh = window.innerHeight || 768;
    current.sy0 = current.sy = readScrollY();
    current.dy = 0;
    current.view.clear();
    current.live.clear();
    current.watch.forEach(element => {
      const entry = readRect(element);
      if (current.textTargets.has(element)) entry.text = readText(element);
      current.cache.set(element, entry);
      // Sticky elements do not move with the scroll: re-read them instead.
      if (window.getComputedStyle?.(element).position === 'sticky') current.live.add(element);
    });
    remeasureDots(current);
  }

  function remeasureDots(current) {
    current.dots.forEach(dot => current.cache.set(dot, { ...readRect(dot), fixed: true }));
  }

  const shiftRect = (r, dy) => ({ x: r.x, y: r.y - dy, w: r.w, h: r.h });
  function box(current, element) {
    const raw = current.cache.get(element);
    if (!raw) return ZERO;
    if (!current.dy || raw.fixed) return raw;
    let view = current.view.get(element);
    if (!view && current.live.has(element)) {
      view = readRect(element);
      current.view.set(element, view);
    }
    if (!view) {
      view = shiftRect(raw, current.dy);
      if (raw.text) view.text = { ...shiftRect(raw.text, current.dy), lines: raw.text.lines.map(l => shiftRect(l, current.dy)), last: shiftRect(raw.text.last, current.dy) };
      current.view.set(element, view);
    }
    return view;
  }
  const textBox = (current, element) => box(current, element).text || box(current, element);
  const isMeasurable = (current, elements) => elements.some(element => { const r = box(current, element); return r.w > 0 || r.h > 0; });
  const inView = (current, element) => { const r = box(current, element); return r.w > 0 && r.h > 0 && r.y < current.vh && r.y + r.h > 0; };
  // In view once the tour has scrolled by `dyFinal`, below the fixed header.
  // Stops that `span` a tall section keep scrolling by `current.span`; an
  // item qualifies if its top is well inside the view by the end of it.
  const willShow = (current, element) => {
    if (!current.measurable) return true;
    const r = box(current, element);
    const y = r.y - current.dyFinal;
    const reach = current.span ? current.vh * 0.8 + current.span : current.vh * 0.94;
    return r.w > 0 && r.h > 0 && y < reach && y + r.h > Math.min(90, current.vh * 0.1);
  };
  // When a spanning stop has scrolled an item's top into the lower view.
  function readyAt(current, element) {
    if (!current.span || !current.measurable) return 0;
    const need = box(current, element).y - current.dyFinal - current.vh * 0.9;
    if (need <= 0) return 0;
    const f = clamp01(need / current.span);
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < 18; i++) { const mid = (lo + hi) / 2; if (easeInOut(mid) < f) lo = mid; else hi = mid; }
    return current.lead + current.spanHold + hi * current.spanMs;
  }
  // Hidden assembly only for content the visitor cannot see yet.
  const belowFold = (current, element) => !current.measurable || box(current, element).y >= current.vh;
  const dotPoint = (current, agent) => { const r = box(current, agent.dot); return { x: r.x + r.w / 2, y: r.y + r.h / 2 }; };
  const visible = (current, element) => {
    const r = box(current, element);
    const y = Math.max(r.y, 0);
    const bottom = Math.min(r.y + r.h, current.vh);
    return bottom > y ? { x: r.x, y, w: r.w, h: bottom - y } : r;
  };

  // ---- stage --------------------------------------------------------------
  function make(tag, className, parent) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    parent?.append(element);
    return element;
  }

  function buildStage(current) {
    const stage = make('div', `agentic-stage is-${current.kind}`);
    const decoration = make('div', 'agentic-decoration', stage);
    decoration.setAttribute('aria-hidden', 'true');
    if (current.kind === 'hero') make('div', 'agentic-veil', decoration);
    current.layer = make('div', 'agentic-layer', decoration);
    current.cursorLayer = make('div', 'agentic-cursors', decoration);
    current.agents.forEach(agent => {
      const info = ROLES[agent.role];
      const cursor = make('div', `agentic-cursor${agent.role === 'orchestrator' ? ' is-orchestrator' : ''}`, current.cursorLayer);
      cursor.style.setProperty('--agent-color', info.color);
      const body = make('div', 'agentic-cursor-body', cursor);
      body.innerHTML = SVG;
      agent.badge = make('span', 'agentic-role', body);
      agent.badge.textContent = agent.label;
      agent.cursor = cursor;
    });
    setDockCrew(current, decoration);
    current.stage = stage;
    document.body.append(stage);
  }

  function say(agent, text) {
    const value = text ? `${ROLES[agent.role].label} · ${text}` : agent.label;
    if (agent.badge.textContent !== value) {
      agent.badge.textContent = value;
      // Rough label width (11px mono) so long labels flip before the edge.
      agent.labelW = Math.max(150, value.length * (width() < 640 ? 6.2 : 7) + 40);
    }
  }

  // ---- crew ---------------------------------------------------------------
  function resolveRole(role, counts) {
    let resolved = role;
    for (let hops = 0; hops < 6 && !counts[resolved]; hops++) resolved = FALLBACK[resolved] || 'layout';
    return counts[resolved] ? resolved : Object.keys(counts)[0];
  }

  function makeAgent(role, n, count, index) {
    const label = count > 1 ? `${ROLES[role].label}·${n}` : ROLES[role].label;
    return { role, label, index, queue: [], segs: [], si: 0, last: null, bend: (((index * 37) % 7) - 3) / 22, phase: index * 1.7 };
  }

  // ---- ride-along crew between tour stops ----------------------------------
  const nextStop = () => (tour ? tour.stops[tour.index + 1] : null);
  // Agents whose role the next stop needs stay on screen and fly straight in.
  function pickStayers(current, candidates) {
    const next = nextStop();
    if (!next) return new Set();
    const counts = CREWS[current.tier];
    const roles = new Set((next.jobs || []).map(job => resolveRole(job.role, counts)));
    const cap = current.tier === 'phone' ? 1 : current.tier === 'tablet' ? 2 : 3;
    const stayers = new Set();
    ['layout', 'qa', 'type', 'copy', 'art', 'links', 'motion', 'a11y', 'nav'].forEach(role => {
      if (stayers.size >= cap || !roles.has(role)) return;
      const agent = candidates.find(a => a.role === role && a.queue.length);
      if (agent) stayers.add(agent);
    });
    return stayers;
  }
  // Waiting spots near the bottom edge, where the next section comes in.
  function standby(current, k, n) {
    return () => ({ x: current.vw * (n > 1 ? 0.24 + (0.52 * k) / (n - 1) : 0.5), y: current.vh * (0.8 - (k % 2) * 0.05) });
  }
  // Send a finished agent to wait for the next stop instead of docking.
  function rideAlong(current, agent, at, k, n) {
    const s = current.scale;
    const name = nextStop()?.name.toLowerCase() || 'next';
    const arrive = at + 560 * s;
    travelSeg(agent, at, arrive, standby(current, k, n));
    addEvent(current, at, () => say(agent, `heading to ${name}`));
    return arrive;
  }
  // Match the previous stop's ride-along crew to this stop's roster; the rest
  // peel off to the dock.
  function adoptCarry(current) {
    if (!carry) return;
    carry.forEach(entry => {
      const match = current.agents.find(agent => agent.role === entry.role && !agent.carry);
      const agent = match || makeAgent(entry.role, 1, 1, current.agents.length);
      agent.carry = { x: entry.x, y: entry.y };
      agent.label = entry.label;
      if (!match) { agent.peel = true; current.agents.push(agent); }
    });
    carry = null;
  }
  // Carried cursors appear exactly where they were, already working.
  function holdCarried(current, agent, name) {
    holdSeg(agent, 0, () => agent.carry);
    addEvent(current, 0, () => {
      agent.cursor.classList.add('is-in', 'is-carried');
      if (agent.peel) { say(agent, ''); return; }
      agent.cursor.classList.add('is-working');
      if (agent.role !== 'orchestrator') startWorking(current, agent);
      say(agent, `moving to ${name}`);
    });
    addEvent(current, 140 * current.scale, () => agent.cursor.classList.remove('is-carried'));
  }

  function startWorking(current, agent) {
    if (agent.role === 'orchestrator' || current.working.has(agent)) return;
    tour?.workers.add(agent.label);
    current.working.add(agent);
    agent.dot?.classList.add('is-active');
    setWorking(current.working.size);
  }

  function dockAgent(current, agent) {
    agent.cursor.classList.add('is-docked');
    agent.dot.classList.remove('is-active');
    agent.dot.classList.add('is-done');
    if (current.working.delete(agent)) setWorking(current.working.size);
  }

  // ---- jobs ---------------------------------------------------------------
  function createJob(current, spec, target, reveals) {
    const job = { ...spec, target, reveals, agent: null, ui: [] };
    const s = current.scale;
    const kind = current.kind;
    const r = () => box(current, target);
    const text = () => textBox(current, target);
    const chars = Math.max(1, (target.textContent || '').trim().length);
    const build = kind === 'build';
    const typeMs = build ? clamp(chars * (spec.charMs || 46), 420, 1250) : Math.min(760, Math.max(300, chars * (spec.charMs || 40)));
    // `place`: pop the item, write its sub line, then cascade its kids. The
    // phases are fractions of the job's work so compression keeps them.
    const parts = spec.parts || {};
    const pops = parts.pops || [];
    const sub = parts.sub || null;
    const kids = parts.kids || [];
    let phases = null;
    if (spec.kind === 'place') {
      const popMs = 380;
      const subStart = popMs * 0.7;
      const subMs = sub ? clamp((sub.textContent || '').trim().length * 5, 450, 950) : 0;
      const kidsStart = (sub ? subStart + subMs : popMs * 0.75) + 60;
      const kidTimes = kids.map((_, i) => kidsStart + (i < 8 ? i * 90 : 8 * 90 + (i - 8) * 35));
      const end = Math.max(popMs + 220, sub ? subStart + subMs + 120 : 0, kids.length ? kidTimes[kidTimes.length - 1] + 280 : 0);
      phases = { end, pop: popMs / end, subStart: subStart / end, subEnd: (subStart + subMs) / end, kids: kidTimes.map(at => at / end) };
    }
    const workMs = {
      place: phases ? phases.end : 600,
      frame: build ? 640 : kind === 'pass' ? 280 : 430,
      reveal: spec.work || (build ? 620 : 380),
      type: typeMs + (build ? 240 : 200),
      wipe: build ? clamp(chars * 6, 650, 1250) : 580,
      orbit: build ? 1000 : 1050,
      review: build ? 620 : kind === 'pass' ? 280 : 440,
      caret: build ? 480 : 300,
    }[spec.kind];
    job.baseWork = workMs * s;
    job.baseType = typeMs * s;
    job.work = job.baseWork;
    job.typeMs = job.baseType;
    job.chars = chars;
    job.entry = () => {
      const b = r();
      if (spec.kind === 'frame' || spec.kind === 'review') { const v = visible(current, target); return { x: v.x + 2, y: v.y + 2 }; }
      if (spec.kind === 'type') { const t = text(); const l = t.lines?.[0] || t; return { x: l.x, y: l.y + l.h * 0.92 }; }
      if (spec.kind === 'wipe') { const t = text(); const l = t.lines?.[0] || t; return { x: l.x, y: l.y + l.h * 0.5 }; }
      if (spec.kind === 'orbit') return { x: b.x + b.w * 0.5 + b.w * 0.42, y: b.y + b.h * 0.42 };
      if (spec.kind === 'caret') { const l = text().last || text(); return { x: l.x + l.w + 6, y: l.y + l.h * 0.8 }; }
      if (spec.kind === 'place') return { x: b.x + Math.min(18, b.w * 0.25), y: b.y + Math.min(b.h * 0.4, 34) };
      return { x: b.x + Math.min(18, b.w * 0.25), y: b.y + Math.min(b.h * 0.58, 120) };
    };
    // Where the cursor sits while placing: the drop, the sub line's caret,
    // then from tag to tag as each one lands.
    const lineStart = element => { const t = textBox(current, element); const l = t.lines?.[0] || t; return { x: l.x, y: l.y, h: l.h }; };
    const lineEnd = element => { const t = textBox(current, element); const l = t.last || t; return { x: l.x + l.w, y: l.y, h: l.h }; };
    const kidPoint = index => { const k = box(current, kids[index]); return { x: k.x + k.w * 0.55, y: k.y + k.h * 0.8 }; };
    const lerp = (a, b, p) => ({ x: a.x + (b.x - a.x) * p, y: a.y + (b.y - a.y) * p });
    function placeAt(p) {
      const start = job.entry();
      const dropped = { x: start.x + 14, y: start.y + 9 };
      if (p <= phases.pop) return lerp(start, dropped, easeOut(clamp01(p / phases.pop)));
      let from = dropped;
      let t0 = phases.pop;
      if (sub) {
        const s0 = lineStart(sub);
        if (p <= phases.subStart) return lerp(dropped, { x: s0.x + 4, y: s0.y + s0.h * 0.5 }, easeInOut(clamp01((p - phases.pop) / Math.max(1e-6, phases.subStart - phases.pop))));
        if (p <= phases.subEnd) {
          const point = p < 1 && job.caretPoint ? job.caretPoint : s0;
          return { x: point.x + 4, y: point.y + point.h * 0.5 };
        }
        const s1 = lineEnd(sub);
        from = { x: s1.x + 4, y: s1.y + s1.h * 0.5 };
        t0 = phases.subEnd;
      }
      if (!kids.length) return from;
      const next = phases.kids.findIndex(at => at >= p);
      if (next < 0) return kidPoint(kids.length - 1);
      if (next > 0) { from = kidPoint(next - 1); t0 = phases.kids[next - 1]; }
      return lerp(from, kidPoint(next), easeInOut(clamp01((p - t0) / Math.max(1e-6, phases.kids[next] - t0))));
    }
    job.cursorAt = p => {
      const b = r();
      if (spec.kind === 'frame' || spec.kind === 'review') {
        const v = visible(current, target);
        const e = spec.kind === 'frame' ? easeInOut(p) : easeOut(p);
        return { x: v.x + 2 + (v.w - 4) * e, y: v.y + 2 + (v.h - 4) * e };
      }
      if (spec.kind === 'type' || spec.kind === 'wipe') {
        // Ride the caret while working; plan with the first/last line ends.
        const t = text();
        const first = t.lines?.[0] || t;
        const last = t.last || t;
        const point = p > 0 && p < 1 && job.caretPoint ? job.caretPoint : p >= 1 ? { x: last.x + last.w, y: last.y, h: last.h } : { x: first.x, y: first.y, h: first.h };
        return { x: point.x + 4, y: point.y + point.h * (spec.kind === 'type' ? 0.92 : 0.5) + (spec.kind === 'type' ? 6 : 0) };
      }
      if (spec.kind === 'orbit') {
        const angle = easeInOut(p) * Math.PI * 2;
        return { x: b.x + b.w * 0.5 + Math.cos(angle) * b.w * 0.42, y: b.y + b.h * 0.42 + Math.sin(angle) * b.h * 0.3 };
      }
      if (spec.kind === 'caret') { const start = job.entry(); return { x: start.x + 10 * easeOut(p), y: start.y + 6 * easeOut(p) }; }
      if (spec.kind === 'place') return placeAt(p);
      const start = job.entry();
      return { x: start.x + Math.min(b.w * 0.42, 360) * easeInOut(p), y: start.y + Math.min(b.h * 0.06, 24) * easeInOut(p) };
    };
    job.exit = () => job.cursorAt(1);

    const color = () => spec.color || ROLES[job.agent.role].color;
    const frame = variant => {
      const element = make('div', `agentic-frame ${variant}`, current.layer);
      element.style.setProperty('--agent-color', color());
      element.innerHTML = '<i></i><i></i><i></i><i></i><b class="agentic-size"></b><s class="agentic-cross"></s>';
      job.ui.push(element);
      return element;
    };
    const place = (element, b) => {
      element.style.translate = `${b.x}px ${b.y}px`;
      element.style.width = `${Math.max(0, b.w)}px`;
      element.style.height = `${Math.max(0, b.h)}px`;
    };
    const sizeLabel = b => `${Math.round(b.w)} × ${Math.round(b.h)}`;
    let version = -1;
    let lastStep = -1;

    job.begin = () => {
      const k = spec.kind;
      if (k === 'frame') {
        job.frame = frame(`is-drag${spec.cross ? ' has-cross' : ''}`);
        job.frame.style.scale = '0.001';
      } else if (k === 'review') {
        job.frame = frame('is-review');
      } else if (k === 'orbit') {
        job.frame = frame('is-orbit has-cross is-coord is-set');
      } else {
        job.frame = frame(TEXT_KINDS.has(k) ? 'is-text is-set' : 'is-set has-size');
      }
      if (k === 'type' || k === 'caret' || (k === 'wipe' && build) || (k === 'place' && sub)) {
        job.caret = make('div', `agentic-caret${k === 'caret' ? ' is-idle' : ''}`, current.layer);
        job.caret.style.setProperty('--agent-color', color());
        job.ui.push(job.caret);
        if (k === 'place') job.caret.style.opacity = '0';
      }
      if (k === 'place') {
        // Only the item pops now; its sub line and kids wait for their turn.
        job.kidIndex = 0;
        pops.forEach(element => {
          element.style.setProperty('--agentic-d', `${realMs(job.work * phases.pop)}ms`);
          element.dataset.buildState = 'placing';
        });
        version = -1;
        job.update(job.arrive);
        return;
      }
      reveals.forEach((element, index) => {
        if (k === 'reveal') {
          element.style.setProperty('--agentic-d', `${realMs(Math.max(60, job.work * (reveals.length > 1 ? 0.7 : 1)))}ms`);
          if (reveals.length > 1) element.style.transitionDelay = `${realMs(index * (job.work * 0.3) / (reveals.length - 1))}ms`;
          element.dataset.buildState = 'placing';
        } else {
          element.dataset.buildState = 'typing';
        }
      });
      if (k === 'type' || k === 'wipe') { lastStep = -1; job.typeProgress = 0; job.caretPoint = writeClip(0); }
      version = -1;
      job.update(job.arrive);
    };

    // Reveal text line by line: everything above the current line, plus the
    // current line up to the caret. Returns the caret position.
    function writeClip(progress) { return writeClipOn(target, progress); }
    function writeClipOn(element, progress) {
      const b = box(current, element);
      const t = textBox(current, element);
      const lines = t.lines;
      if (!lines || lines.length < 2) {
        const left = t.x - b.x;
        const right = Math.max(0, b.w - (left + t.w * progress));
        element.style.clipPath = `inset(-0.32em ${right.toFixed(1)}px -0.32em -0.12em)`;
        return { x: t.x + t.w * progress, y: t.y, h: t.h };
      }
      const total = lines.reduce((sum, line) => sum + line.w, 0);
      let remaining = total * progress;
      let k = 0;
      while (k < lines.length - 1 && remaining >= lines[k].w) { remaining -= lines[k].w; k++; }
      const line = lines[k];
      const x = line.x + Math.min(line.w, remaining);
      const pad = Math.max(4, line.h * 0.3);
      // Tight display leading makes glyph boxes overlap: split neighbours at
      // the midpoint, which is where their line boxes meet.
      const prev = lines[k - 1];
      const next = lines[k + 1];
      const top = prev ? (prev.y + prev.h + line.y) / 2 - b.y : -pad;
      const bottom = next ? (line.y + line.h + next.y) / 2 - b.y : line.y + line.h - b.y + pad;
      const cx = x - b.x;
      const W = b.w + pad;
      element.style.clipPath = `polygon(${-pad}px ${-pad}px, ${W.toFixed(1)}px ${-pad}px, ${W.toFixed(1)}px ${top.toFixed(1)}px, ${cx.toFixed(1)}px ${top.toFixed(1)}px, ${cx.toFixed(1)}px ${bottom.toFixed(1)}px, ${-pad}px ${bottom.toFixed(1)}px)`;
      return { x, y: line.y, h: line.h };
    }

    function placeCaret(point) {
      if (!job.caret || !point) return;
      job.caret.style.translate = `${point.x}px ${point.y + point.h * 0.08}px`;
      job.caret.style.height = `${point.h * 0.84}px`;
    }

    job.update = now => {
      const p = clamp01((now - job.arrive) / Math.max(1, job.work));
      const geometryChanged = version !== current.version;
      version = current.version;
      const b = spec.kind === 'frame' || spec.kind === 'review' ? visible(current, target) : r();
      if (geometryChanged) {
        if (spec.kind === 'orbit') {
          place(job.frame, { x: b.x + b.w * 0.08, y: b.y + b.h * 0.12, w: b.w * 0.84, h: b.h * 0.6 });
          job.frame.querySelector('b').textContent = `x ${Math.round(b.x + b.w / 2)} · y ${Math.round(b.y + b.h * 0.42)}`;
        } else if (TEXT_KINDS.has(spec.kind)) {
          const t = text();
          place(job.frame, { x: t.x - 4, y: t.y - 3, w: t.w + 8, h: t.h + 6 });
        } else {
          place(job.frame, b);
          job.frame.querySelector('b').textContent = sizeLabel(b);
        }
      }
      if (spec.kind === 'frame') {
        const e = easeInOut(p);
        job.frame.style.scale = `${Math.max(e, 0.001)} ${Math.max(e, 0.001)}`;
        if (p >= 1 && !job.frame.classList.contains('is-set')) job.frame.classList.add('is-set');
      } else if (spec.kind === 'review' && p > 0.05 && !job.frame.classList.contains('is-set')) {
        job.frame.classList.add('is-set');
        if (spec.size) job.frame.classList.add('has-size');
      } else if (spec.kind === 'type') {
        const progress = clamp01((now - job.arrive) / Math.max(1, job.typeMs));
        const step = Math.floor(progress * job.chars);
        job.typeProgress = progress;
        if (step !== lastStep || geometryChanged) {
          lastStep = step;
          job.caretPoint = writeClip(step / job.chars);
          placeCaret(job.caretPoint);
        }
        if (progress >= 1 && !job.caret.classList.contains('is-idle')) job.caret.classList.add('is-idle');
      } else if (spec.kind === 'wipe') {
        job.caretPoint = writeClip(easeInOut(p));
        placeCaret(job.caretPoint);
        if (p >= 1 && job.caret && !job.caret.classList.contains('is-idle')) job.caret.classList.add('is-idle');
      } else if (spec.kind === 'place') {
        if (sub && p >= phases.subStart) {
          const q = clamp01((p - phases.subStart) / Math.max(1e-6, phases.subEnd - phases.subStart));
          job.caretPoint = writeClipOn(sub, easeInOut(q));
          if (sub.dataset.buildState !== 'typing') { sub.dataset.buildState = 'typing'; job.caret.style.removeProperty('opacity'); }
          placeCaret(job.caretPoint);
          if (q >= 1 && !job.caret.classList.contains('is-idle')) job.caret.classList.add('is-idle');
        }
        while (job.kidIndex < kids.length && p >= phases.kids[job.kidIndex]) {
          const kid = kids[job.kidIndex++];
          kid.style.setProperty('--agentic-d', `${realMs(260)}ms`);
          kid.dataset.buildState = 'placing';
        }
      } else if (spec.kind === 'caret' && geometryChanged) {
        const l = text().last || text();
        placeCaret({ x: l.x + l.w + 3, y: l.y, h: l.h });
      }
    };

    job.finish = () => {
      reveals.forEach(element => cleanTarget(element));
      if (current.kind === 'pass') target.dataset.buildState = 'tracing';
      job.ui.forEach(element => { if (element !== job.frame) element.remove(); });
      if (spec.kind !== 'frame') job.frame?.classList.add('is-out');
    };
    return job;
  }

  // ---- planning -----------------------------------------------------------
  function travelMs(current, from, to) {
    const d = distance(from, to);
    if (current.kind === 'pass') return clamp(230 + d * 0.3, 200, 260) * current.scale;
    if (current.kind === 'build') return clamp(320 + d * 0.38, 380, 760) * current.scale;
    return clamp(230 + d * 0.3, 240, 560) * current.scale;
  }

  function addEvent(current, at, fn) { current.events.push({ at, fn }); }

  function travelSeg(agent, t0, t1, to) {
    const from = agent.last;
    agent.segs.push({ t0, t1, kind: 'travel', point: p => curve(from(), to(), agent.bend, easeInOut(p)) });
    agent.last = to;
  }
  function holdSeg(agent, t0, at) {
    agent.segs.push({ t0, t1: t0, kind: 'hold', point: () => at() });
    agent.last = at;
  }
  function workSeg(agent, job) {
    agent.segs.push({ t0: job.arrive, t1: job.end, kind: 'work', point: p => job.cursorAt(p) });
    agent.last = job.exit;
  }

  function curve(a, b, bend, p) {
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    const cx = mx - (b.y - a.y) * bend;
    const cy = my + (b.x - a.x) * bend;
    const q = 1 - p;
    return { x: q * q * a.x + 2 * q * p * cx + p * p * b.x, y: q * q * a.y + 2 * q * p * cy + p * p * b.y };
  }

  // Lay out one agent's queue; returns the time it becomes free.
  function simulate(current, agent, startAt, from, factor) {
    let t = startAt;
    let position = from;
    agent.queue.forEach((job, index) => {
      const entry = job.entry();
      if (index > 0 && job.wave) t = Math.max(t, job.wave * current.scale);
      const travel = travelMs(current, position, entry) * factor;
      // On spanning stops, arrive as the item scrolls into view.
      if (job.readyAt) t = Math.max(t, job.readyAt - travel);
      job.start = t;
      job.arrive = t + travel;
      job.work = job.baseWork * factor;
      job.typeMs = job.baseType * factor;
      job.end = job.arrive + job.work;
      t = job.end + current.jobGap;
      position = job.exit();
    });
    return t;
  }

  // Compress travel and work, then drop optional jobs, to meet a deadline.
  function fitQueue(current, agent, firstStart, from, deadline) {
    const gaps = () => agent.queue.length * current.jobGap;
    let factor = 1;
    let free = simulate(current, agent, firstStart, from, factor);
    if (free > deadline) {
      factor = Math.max(0.55, (deadline - firstStart - gaps()) / Math.max(1, free - firstStart - gaps()));
      free = simulate(current, agent, firstStart, from, factor);
    }
    while (free > deadline && agent.queue.length > 1 && agent.queue.some(job => OPTIONAL.has(job.kind))) {
      const drop = [...agent.queue].reverse().find(job => OPTIONAL.has(job.kind));
      agent.queue.splice(agent.queue.indexOf(drop), 1);
      current.jobs.splice(current.jobs.indexOf(drop), 1);
      free = simulate(current, agent, firstStart, from, factor);
    }
    if (free > deadline) {
      factor *= Math.max(0.1, (deadline - firstStart - gaps()) / Math.max(1, free - firstStart - gaps()));
      free = simulate(current, agent, firstStart, from, factor);
    }
    return free;
  }

  // Shared per-job events: dispatch line, label, begin, complete, frame fade.
  function scheduleQueue(current, orchestrator, agent, lineEvery) {
    const s = current.scale;
    agent.queue.forEach((job, jobIndex) => {
      travelSeg(agent, job.start, job.arrive, job.entry);
      workSeg(agent, job);
      if (orchestrator && (lineEvery || jobIndex === 0)) addEvent(current, job.start, now => dispatchLine(current, orchestrator, agent, job, now));
      addEvent(current, job.start, () => { startWorking(current, agent); agent.cursor.classList.add('is-working'); say(agent, job.act); });
      addEvent(current, job.arrive, now => { job.begin(now); current.active.add(job); });
      addEvent(current, job.end, () => completeJob(current, job));
      if (job.kind === 'frame') addEvent(current, job.end + (current.kind === 'build' ? 520 : 620) * s, () => job.frame?.classList.add('is-out'));
    });
  }

  function planHero(current) {
    const s = current.scale;
    current.jobGap = 100 * s;
    const counts = CREWS[current.tier];
    const orchestrator = current.agents[0];
    const subagents = current.agents.slice(1);
    const spawn = () => ({ x: current.vw / 2, y: current.vh * 0.45 });
    const kicker = document.querySelector('.hero-kicker');
    const command = () => {
      const k = kicker && current.cache.get(kicker);
      if (k && k.w) {
        const t = k.text || k;
        return { x: Math.min(current.vw - 120, t.x + t.w + 26), y: t.y + t.h * 0.2 };
      }
      return { x: current.vw / 2 + 60, y: Math.max(90, current.vh * 0.14) };
    };
    const orchPoint = () => orchestrator.position || spawn();

    // Assign jobs round-robin within each resolved role.
    const byRole = new Map();
    subagents.forEach(agent => { if (!byRole.has(agent.role)) byRole.set(agent.role, []); byRole.get(agent.role).push(agent); });
    const turn = new Map();
    const load = agent => agent.queue.reduce((sum, job) => sum + job.baseWork + 320 * s, 0);
    current.jobs.forEach(job => {
      let agent;
      if (counts[job.role]) {
        const pool = byRole.get(job.role);
        const index = turn.get(job.role) || 0;
        turn.set(job.role, index + 1);
        agent = pool[index % pool.length];
      } else {
        // No specialist in this viewport class: hand it to the least-busy
        // agent along the role's fallback chain.
        const chain = [];
        for (let role = FALLBACK[job.role]; role && chain.length < 6; role = FALLBACK[role]) if (counts[role] && !chain.includes(role)) chain.push(role);
        const pool = (chain.length ? chain : Object.keys(counts)).flatMap(role => byRole.get(role) || []);
        agent = pool.reduce((best, next) => (load(next) < load(best) ? next : best), pool[0]);
      }
      job.agent = agent;
      agent.queue.push(job);
    });

    // Orchestrator: present from frame one, moves to its command spot.
    const orchArrive = 760 * s;
    holdSeg(orchestrator, 0, spawn);
    travelSeg(orchestrator, 300 * s, orchArrive, command);
    addEvent(current, 0, () => { orchestrator.cursor.classList.add('is-in', 'is-working'); say(orchestrator, 'planning hero'); });

    // One dispatch at a time: the eye can follow each agent leaving.
    const dispatchGap = 85 * s;
    const ordered = subagents.filter(agent => agent.queue.length).map(agent => {
      agent.queue.sort((a, b) => a.wave - b.wave);
      const roleIndex = byRole.get(agent.role).indexOf(agent);
      const popAt = (40 + agent.index * 20) * s;
      agent.natural = Math.max(popAt + 400 * s, agent.queue[0].wave * s + roleIndex * 70 * s);
      return agent;
    }).sort((a, b) => a.natural - b.natural);
    let previous = -Infinity;
    ordered.forEach(agent => { agent.firstStart = Math.max(agent.natural, previous + dispatchGap); previous = agent.firstStart; });

    const builderDeadline = 2750 * s;
    const reviewDeadline = 3750 * s;
    const stayers = pickStayers(current, subagents);
    const stayList = [...stayers];
    let latestDock = orchArrive;
    let queued = 0;
    subagents.forEach((agent, index) => {
      const popAt = (40 + index * 20) * s;
      const angle = index * 2.39996;
      const radius = 30 + 15 * Math.sqrt(index + 1);
      const ring = () => { const c = spawn(); return { x: c.x + Math.cos(angle) * radius, y: c.y + Math.sin(angle) * radius * 0.8 }; };
      addEvent(current, popAt, () => agent.cursor.classList.add('is-in'));
      holdSeg(agent, 0, spawn);
      travelSeg(agent, popAt, popAt + 380 * s, ring);
      if (!agent.queue.length) {
        agent.dockAt = (1200 + index * 30) * s;
        travelSeg(agent, agent.dockAt - 420 * s, agent.dockAt, () => dotPoint(current, agent));
      } else {
        let firstStart = agent.firstStart;
        let from = ring();
        if (firstStart > 1150 * s) {
          // Wait beside the orchestrator until dispatched; phones use the
          // right margin so idle cursors stay clear of the copy.
          const k = queued++;
          const slot = current.tier === 'phone'
            ? () => { const o = orchPoint(); return { x: current.vw - 26, y: o.y + 34 + k * 30 }; }
            : () => { const o = orchPoint(); return { x: o.x + 34 + k * 30, y: o.y - 30 - (k % 2) * 12 }; };
          travelSeg(agent, 780 * s, 1150 * s, slot);
          from = slot();
          firstStart = Math.max(firstStart, 1160 * s);
        }
        const mustFinish = agent.queue.some(job => HIDES.has(job.kind));
        const free = fitQueue(current, agent, firstStart, from, mustFinish ? builderDeadline : reviewDeadline);
        scheduleQueue(current, orchestrator, agent, false);
        if (stayers.has(agent)) {
          agent.dockAt = rideAlong(current, agent, free + 80 * s, stayList.indexOf(agent), stayList.length + 1);
        } else {
          agent.dockAt = free + 80 * s + travelMs(current, agent.queue[agent.queue.length - 1].exit(), dotPoint(current, agent));
          travelSeg(agent, free + 80 * s, agent.dockAt, () => dotPoint(current, agent));
          addEvent(current, free + 80 * s, () => { agent.cursor.classList.remove('is-working'); say(agent, ''); });
        }
      }
      if (!stayers.has(agent)) addEvent(current, agent.dockAt, () => dockAgent(current, agent));
      latestDock = Math.max(latestDock, agent.dockAt);
    });
    // Orchestrator reports last, then the hero stage clears; on the tour it
    // leads the ride-along crew down to the next section instead.
    const orchDock = Math.min(current.total * 0.9, latestDock + 160 * s);
    if (nextStop()) {
      stayers.add(orchestrator);
      const name = nextStop().name.toLowerCase();
      travelSeg(orchestrator, Math.max(orchArrive, orchDock - 520 * s), orchDock, standby(current, stayList.length, stayList.length + 1));
      addEvent(current, Math.max(latestDock - 200 * s, 0), () => say(orchestrator, `leading crew to ${name}`));
    } else {
      travelSeg(orchestrator, Math.max(orchArrive, orchDock - 520 * s), orchDock, () => dotPoint(current, orchestrator));
      addEvent(current, orchDock, () => dockAgent(current, orchestrator));
      addEvent(current, Math.max(latestDock - 200 * s, 0), () => say(orchestrator, 'handing off'));
      addEvent(current, orchDock - 300 * s, () => orchestrator.cursor.classList.remove('is-working'));
    }
    current.stayers = stayers;
    addEvent(current, 330 * s, () => { current.stage.classList.add('is-assembling'); say(orchestrator, 'dispatching'); });
    const firstReview = Math.min(...current.jobs.filter(job => job.kind === 'review').map(job => job.start), Infinity);
    if (Number.isFinite(firstReview)) addEvent(current, firstReview, () => say(orchestrator, 'reviewing'));
    // End as soon as the crew has reported back (never later than the budget).
    const leaveAt = orchDock + 80 * s;
    current.total = Math.min(current.total, leaveAt + 360 * s);
    addEvent(current, leaveAt, () => current.stage.classList.add('is-leaving'));
  }

  // A tour stop: the page scrolls for `lead` ms while the orchestrator moves
  // to the section and the crew lifts off the dock; agents are dispatched one
  // at a time, work, and fly home.
  function planBuild(current, stopInfo) {
    const s = current.scale;
    current.jobGap = 130 * s;
    const lead = current.lead;
    const [orchestrator] = current.agents;
    const crew = current.agents.filter(agent => agent.role !== 'orchestrator' && !agent.peel);
    const home = agent => () => dotPoint(current, agent);
    const name = stopInfo.name.toLowerCase();
    const heading = current.heading;
    const command = () => {
      const h = heading ? box(current, heading) : null;
      if (h && h.w) return { x: clamp(h.x + Math.min(h.w, 420) + 30, 40, current.vw - 150), y: clamp(h.y + 8, 90, current.vh - 140) };
      return { x: current.vw * 0.62, y: Math.max(110, current.vh * 0.22) };
    };
    if (orchestrator.carry) holdCarried(current, orchestrator, name);
    else holdSeg(orchestrator, 0, home(orchestrator));
    const commandAt = lead > 0 ? Math.max(lead * 0.9, 300 * s) : 420 * s;
    travelSeg(orchestrator, lead > 0 ? lead * 0.2 : 60 * s, commandAt, command);
    addEvent(current, 0, () => {
      orchestrator.cursor.classList.add('is-in', 'is-working');
      say(orchestrator, lead > 0 ? `moving to ${name}` : 'planning');
    });
    addEvent(current, commandAt, () => say(orchestrator, 'dispatching'));

    // Agents that did not come along this time head back to the dock.
    current.agents.filter(agent => agent.peel).forEach(agent => {
      holdCarried(current, agent, name);
      const at = 160 * s;
      agent.dockAt = at + 520 * s;
      travelSeg(agent, at, agent.dockAt, home(agent));
      addEvent(current, agent.dockAt, () => dockAgent(current, agent));
    });

    // Ride-along agents start right away, while the next section is still
    // sliding in; fresh agents leave the dock while the page settles.
    const dispatchFrom = lead > 0 ? lead * 0.72 : 220 * s;
    const deadline = Math.max(lead + current.budget - 560 * s, current.span ? lead + current.spanHold + current.spanMs + 900 * s : 0);
    const gap = Math.min(240 * s, (current.budget * 0.3) / Math.max(1, crew.length));
    // Work top to bottom: on spanning stops items arrive as the page scrolls.
    crew.forEach(agent => agent.queue.sort((a, b) => (a.readyAt || 0) - (b.readyAt || 0)));
    const stayers = pickStayers(current, crew);
    const stayList = [...stayers];
    let latest = commandAt;
    let fresh = 0;
    let carried = 0;
    crew.forEach(agent => {
      let firstStart;
      let from;
      if (agent.carry) {
        holdCarried(current, agent, name);
        firstStart = (lead > 0 ? lead * 0.32 : 80 * s) + carried++ * 110 * s;
        from = agent.carry;
      } else {
        firstStart = dispatchFrom + fresh++ * gap;
        addEvent(current, Math.max(0, firstStart - 360 * s), () => agent.cursor.classList.add('is-in'));
        holdSeg(agent, 0, home(agent));
        from = home(agent)();
      }
      const free = fitQueue(current, agent, firstStart, from, deadline);
      scheduleQueue(current, orchestrator, agent, !agent.carry);
      const back = free + 40 * s;
      if (stayers.has(agent)) {
        agent.dockAt = rideAlong(current, agent, back, stayList.indexOf(agent), stayList.length + 1);
      } else {
        agent.dockAt = back + clamp(travelMs(current, agent.queue[agent.queue.length - 1].exit(), home(agent)()), 300 * s, 520 * s);
        travelSeg(agent, back, agent.dockAt, home(agent));
        addEvent(current, back, () => { agent.cursor.classList.remove('is-working'); say(agent, ''); });
        addEvent(current, agent.dockAt, () => dockAgent(current, agent));
      }
      latest = Math.max(latest, agent.dockAt);
    });

    let end = Math.max(latest + 120 * s, commandAt + 300 * s);
    if (current.handoffJob) {
      // Final handoff: the orchestrator frames the contact button.
      const job = current.handoffJob;
      const h = current.handoffMs;
      job.agent = orchestrator;
      job.start = end;
      job.arrive = end + h * 0.3;
      job.work = job.baseWork = h * 0.45;
      job.end = job.arrive + job.work;
      orchestrator.queue.push(job);
      travelSeg(orchestrator, job.start, job.arrive, job.entry);
      workSeg(orchestrator, job);
      addEvent(current, job.start, () => {
        say(orchestrator, 'handing off');
        if (dock) { dock.where.textContent = 'Handoff'; }
        announce(`Handoff: ${builtCount} agents built this page.`);
      });
      addEvent(current, job.arrive, now => { job.begin(now); current.active.add(job); });
      addEvent(current, job.end, () => completeJob(current, job));
      end = job.end + 80 * s;
    }
    const continues = Boolean(nextStop()) && !current.handoffJob;
    const floor = crew.length ? lead + current.budget * (current.handoffJob ? 0.6 : continues ? 0.7 : 0.8) : lead + 700 * s;
    let orchHome;
    if (continues) {
      // Lead the ride-along crew down to the next section.
      stayers.add(orchestrator);
      orchHome = rideAlong(current, orchestrator, Math.max(commandAt, end - 420 * s), stayList.length, stayList.length + 1);
    } else {
      // The last stop ends as the orchestrator docks, so no frame is empty.
      const leave = Math.max(end, floor - 360 * s);
      orchHome = leave + 360 * s;
      travelSeg(orchestrator, leave, orchHome, home(orchestrator));
      current.lastStop = true;
      addEvent(current, leave, () => orchestrator.cursor.classList.remove('is-working'));
      addEvent(current, orchHome, () => dockAgent(current, orchestrator));
    }
    current.stayers = stayers;
    current.total = Math.max(orchHome + (current.lastStop ? 0 : 160 * s), floor);
    addEvent(current, current.total - 180 * s, () => current.stage.classList.add('is-leaving'));
  }

  function planSection(current) {
    const s = current.scale;
    current.agents.forEach((agent, index) => {
      const job = agent.queue[0];
      const popAt = index * 25 * s;
      const start = (80 + index * 30) * s;
      const home = () => dotPoint(current, agent);
      addEvent(current, popAt, () => agent.cursor.classList.add('is-in'));
      holdSeg(agent, 0, home);
      job.start = start;
      job.arrive = start + travelMs(current, home(), job.entry());
      job.end = job.arrive + job.work;
      travelSeg(agent, job.start, job.arrive, job.entry);
      workSeg(agent, job);
      addEvent(current, job.start, () => { startWorking(current, agent); agent.cursor.classList.add('is-working'); say(agent, job.act); });
      addEvent(current, job.arrive, now => { job.begin(now); current.active.add(job); });
      addEvent(current, job.end, () => completeJob(current, job));
      addEvent(current, job.end + 90 * s, () => job.frame?.classList.add('is-out'));
      addEvent(current, job.end + 30 * s, () => agent.cursor.classList.remove('is-working'));
      agent.dockAt = Math.min(current.total - 70 * s, job.end + 30 * s + 210 * s);
      travelSeg(agent, job.end + 30 * s, agent.dockAt, home);
      addEvent(current, agent.dockAt, () => dockAgent(current, agent));
    });
    addEvent(current, current.total - 90 * s, () => current.stage.classList.add('is-leaving'));
  }

  function completeJob(current, job) {
    if (current.active.has(job)) job.update(job.end);
    current.active.delete(job);
    job.finish();
    current.done++;
  }

  function dispatchLine(current, orchestrator, agent, job, now) {
    const from = orchestrator.position || segPoint(orchestrator, now);
    const to = job.entry();
    const length = distance(from, to);
    if (length < 24) return;
    const line = make('div', 'agentic-dispatch', current.layer);
    line.style.setProperty('--agent-color', ROLES[agent.role].color);
    line.style.width = `${length}px`;
    line.style.translate = `${from.x}px ${from.y}px`;
    line.style.rotate = `${Math.atan2(to.y - from.y, to.x - from.x)}rad`;
    // Insert in time order; every processed event is earlier than `now`.
    const at = now + 700 * current.scale;
    let index = current.events.length;
    while (index > current.next && current.events[index - 1].at > at) index--;
    current.events.splice(index, 0, { at, fn: () => line.remove() });
  }

  // ---- cursors ------------------------------------------------------------
  function segPoint(agent, t) {
    const segs = agent.segs;
    while (agent.si < segs.length - 1 && t >= segs[agent.si + 1].t0) agent.si++;
    const seg = segs[agent.si];
    const p = clamp01((t - seg.t0) / Math.max(1e-6, seg.t1 - seg.t0));
    const point = seg.point(p);
    if (seg.kind === 'work' || (seg.kind === 'travel' && p < 1)) return point;
    return { x: point.x + Math.sin(t * 0.0042 + agent.phase) * 1.4, y: point.y + Math.cos(t * 0.0037 + agent.phase) * 1.2 };
  }

  function placeAgent(current, agent, t) {
    const point = segPoint(agent, t);
    agent.position = point;
    const x = Math.max(2, Math.min(current.vw - 14, point.x));
    const y = Math.max(2, Math.min(current.vh - 20, point.y));
    if (agent.x !== undefined && Math.abs(agent.x - x) < 0.05 && Math.abs(agent.y - y) < 0.05) return;
    agent.x = x;
    agent.y = y;
    // Flip the label to the cursor's left when it would overflow on the right
    // and there is more room on the left.
    const flip = x > current.vw - (agent.labelW || 190) && x > current.vw * 0.5;
    if (flip !== agent.flip) { agent.flip = flip; agent.cursor.classList.toggle('is-flip', flip); }
    agent.cursor.style.transform = `translate3d(${(x - 2).toFixed(1)}px,${(y - 1.5).toFixed(1)}px,0)`;
  }

  // ---- runs ---------------------------------------------------------------
  function collect(current, plan, rootNode, cap) {
    const jobs = [];
    const used = new Set();
    const push = (spec, target, reveals) => {
      if (!target || used.has(target)) return;
      used.add(target);
      jobs.push(createJob(current, spec, target, reveals));
    };
    plan.forEach(spec => {
      const nodes = [...rootNode.querySelectorAll(spec.sel)];
      if (!nodes.length) return;
      if (current.kind === 'pass') {
        nodes.filter(node => !used.has(node) && (!current.measurable || inView(current, node)))
          .slice(0, spec.multi || 1)
          .forEach(node => push(spec, node, []));
      } else if (current.kind === 'build') {
        if (spec.group) {
          const container = rootNode.querySelector(spec.group);
          const shown = nodes.filter(node => willShow(current, node)).slice(0, spec.max || 6);
          if (!container || !shown.length) return;
          const hidden = shown.filter(node => belowFold(current, node));
          push(hidden.length ? spec : { ...spec, kind: DEMOTE[spec.kind] || spec.kind }, container, hidden);
        } else {
          // One job per item, up to `multi`; `rest` cascades the others.
          let shown = nodes.filter(node => !used.has(node) && willShow(current, node) && (!spec.shown || isShown(node)));
          if (spec.byX) shown = shown.sort((a, b) => box(current, a).x - box(current, b).x);
          const own = shown.slice(0, spec.multi || 1);
          own.forEach((node, index) => {
            const item = itemSpec(current, spec, node, index);
            if (!HIDES.has(item.kind)) push(item, node, []);
            else if (belowFold(current, node)) push(item, node, item.parts ? item.parts.all : [node]);
            else push({ ...item, kind: DEMOTE[item.kind], parts: null }, node, []);
          });
          const rest = spec.rest ? shown.slice(own.length).filter(node => belowFold(current, node)) : [];
          if (rest.length) push({ ...spec, role: spec.role || spec.roles[0], kind: 'reveal', act: `placing ${rest.length} more` }, rest[0], rest);
        }
      } else if (spec.each && spec.group && current.tier !== 'desktop') {
        const container = document.querySelector(spec.group);
        const shown = current.measurable ? nodes.filter(node => inView(current, node)) : nodes;
        if (container && shown.length && (!current.measurable || inView(current, container))) push(spec, container, shown);
      } else {
        (spec.each ? nodes : nodes.slice(0, 1))
          .filter(node => !current.measurable || inView(current, node))
          .forEach(node => push(spec, node, HIDES.has(spec.kind) ? [node] : []));
      }
    });
    return cap ? jobs.slice(0, cap) : jobs;
  }

  // Rendered at all (the gallery keeps back cards transparent or hidden).
  function isShown(element) {
    const style = window.getComputedStyle?.(element);
    return !style || (style.visibility !== 'hidden' && style.opacity !== '0');
  }

  const cleanName = text => (text || '').replace(/[↗↓↑→←]/g, '').replace(/\s+/g, ' ').trim();
  // One item's job spec: its role (cycled), its label and its parts.
  function itemSpec(current, spec, node, index) {
    const item = { ...spec, role: spec.roles ? spec.roles[index % spec.roles.length] : spec.role };
    if (spec.label) {
      let name = cleanName((spec.name && node.querySelector(spec.name)) ? node.querySelector(spec.name).textContent : node.textContent);
      // Narrow screens get shorter names so labels stay on screen.
      const max = current.tier === 'phone' ? 16 : current.tier === 'tablet' ? 22 : NAME_MAX;
      if (name.length > max) name = `${name.slice(0, max - 1).trimEnd()}…`;
      item.act = `${spec.act} '${name}'`;
    }
    if (spec.kind === 'place') {
      const pops = spec.pop ? [...node.querySelectorAll(spec.pop)] : [node];
      let sub = spec.sub ? node.querySelector(spec.sub) : null;
      if (sub && current.measurable) { const r = box(current, sub); if (!(r.w > 0 && r.h > 0)) sub = null; }
      const kids = spec.kids ? [...node.querySelectorAll(spec.kids)] : [];
      item.parts = { pops, sub, kids, all: [...pops, ...(sub ? [sub] : []), ...kids] };
    }
    return item;
  }

  function prepare(kind, duration) {
    const tier = crewTier(width());
    const base = kind === 'hero' ? HERO_BASE : kind === 'build' ? BUILD_BASE : PASS_BASE;
    return {
      kind,
      tier,
      total: duration,
      budget: duration,
      scale: duration / base,
      cache: new Map(),
      view: new Map(),
      version: 0,
      sy: 0,
      sy0: 0,
      dy: 0,
      dyFinal: 0,
      lead: 0,
      span: 0,
      spanMs: 0,
      spanHold: 0,
      vt: 0,
      last: 0,
      jobGap: 70,
      events: [],
      next: 0,
      active: new Set(),
      marked: new Set(),
      working: new Set(),
      agents: [],
      jobs: [],
      dots: [],
      watch: new Set(),
      live: new Set(),
      textTargets: new Set(),
      done: 0,
      measurable: true,
    };
  }

  function watchElements(current, elements) {
    elements.forEach(element => { if (element) current.watch.add(element); });
  }

  function gather(current, plan, rootNode) {
    const candidates = new Set();
    plan.forEach(spec => {
      rootNode.querySelectorAll(spec.sel).forEach(node => {
        candidates.add(node);
        if (TEXT_KINDS.has(spec.kind)) current.textTargets.add(node);
        const sub = spec.sub ? node.querySelector(spec.sub) : null;
        if (sub) { candidates.add(sub); current.textTargets.add(sub); }
        if (spec.kids) node.querySelectorAll(spec.kids).forEach(kid => candidates.add(kid));
      });
      if (spec.group) candidates.add(rootNode.querySelector(spec.group));
    });
    return candidates;
  }

  function launch(current, onComplete) {
    current.onComplete = onComplete;
    // A bad timestamp must never stall a run with content still hidden.
    current.events.forEach(event => { if (!Number.isFinite(event.at)) event.at = 0; });
    if (!Number.isFinite(current.total) || current.total <= 0) current.total = current.budget;
    current.events.sort((a, b) => a.at - b.at);
    current.jobs.forEach(job => {
      current.marked.add(job.target);
      job.target.dataset.agenticJob = job.kind;
      const parts = job.parts;
      job.reveals.forEach(element => {
        current.marked.add(element);
        element.classList.add('agentic-target');
        if (parts) element.dataset.buildKind = parts.kids.includes(element) ? 'kid' : element === parts.sub ? 'text' : 'pop';
        else if (job.art) element.dataset.buildKind = 'art';
        element.dataset.buildState = 'pending';
      });
      if (current.kind === 'pass') job.target.dataset.buildState = 'tracing';
    });
    lastStats = statsOf(current);
    run = current;
    root.classList.add('agentic-running');
    current.vt = 0;
    current.last = clock();
    // Events due at once (carried cursors, the orchestrator) apply before the
    // first paint, so the crew never blinks out between stops.
    while (current.next < current.events.length && current.events[current.next].at <= 0) current.events[current.next++].fn(0);
    current.agents.forEach(agent => placeAgent(current, agent, 0));
    schedule();
  }

  // ---- the tour -----------------------------------------------------------
  function startTour(replay = false) {
    if (destroyed || media?.matches) { stop(false, false); return; }
    // A first visit that already sits mid-page (restored position) is not
    // pulled back to the top.
    if (!replay && readScrollY() > 80) { stop(false, false); return; }
    observer?.disconnect();
    clearVisuals();
    const stops = TOUR_STOPS.map(stopInfo => ({ ...stopInfo, section: document.querySelector(stopInfo.sel) })).filter(stopInfo => stopInfo.section);
    tour = { stops, index: 0, firstVisit: !replay, realStart: clock(), hiddenMs: 0, workers: new Set() };
    planSteps = stops.map(stopInfo => ({ label: planName(stopInfo.name), state: 'planned', agents: 0 }));
    carry = null;
    sectionsEligible = false;
    replayButton.hidden = true;
    builtCount = crewSize(width());
    // A keyboard Replay hides the focused control: keep focus in the dock.
    const focusOnReplay = Boolean(document.activeElement?.closest?.('[data-agentic-replay], [data-agentic-dock-replay]'));
    if (replay) scrollToY(0);
    tourY = readScrollY();
    root.classList.add('agentic-touring');
    ensureDock();
    renderPlan();
    showTourDock(0);
    placeDock();
    if (focusOnReplay) dock.skip.focus({ preventScroll: true });
    startHero();
  }

  function advanceTour() {
    if (!tour) return;
    tour.index++;
    if (tour.index >= tour.stops.length) { finishTour(); return; }
    startBuild(tour.stops[tour.index]);
  }

  // The pill reports what really happened: distinct agents that worked and
  // the measured tour time (hidden-tab pauses excluded).
  function finishTour() {
    const agents = tour.workers.size || builtCount;
    const seconds = Math.max(1, Math.round((clock() - tour.realStart - tour.hiddenMs) / 1000));
    tour = null;
    carry = null;
    phase = 'ready';
    sectionsEligible = false;
    persist();
    replayButton.hidden = false;
    planSteps.forEach(step => { step.state = 'done'; step.agents = 0; });
    collapseDock(`Build tour finished. ${agents} agents built this page in ${seconds} seconds.`, `Built by ${agents} agents in ${seconds} s`);
    flushTourEnd();
  }

  // A stopped tour: the section in progress goes back to planned.
  function settlePlan() {
    planSteps.forEach(step => { if (step.state === 'building') { step.state = 'planned'; step.agents = 0; } });
  }

  function startHero() {
    phase = 'hero';
    visitedSections.add(hero);
    const current = prepare('hero', heroDuration(crewTier(width())));
    const candidates = gather(current, HERO_PLAN, document);
    watchElements(current, [...candidates, document.querySelector('.hero-kicker')]);
    measure(current);
    current.measurable = isMeasurable(current, [...current.watch]);
    current.jobs = collect(current, HERO_PLAN, document);
    const counts = CREWS[current.tier];
    current.agents.push(makeAgent('orchestrator', 1, 1, 0));
    Object.keys(ROLES).forEach(role => {
      const count = counts[role] || 0;
      for (let n = 1; n <= count; n++) current.agents.push(makeAgent(role, n, count, current.agents.length));
    });
    buildStage(current);
    remeasureDots(current);
    planHero(current);
    if (tour) addEvent(current, current.total * 0.55, () => showNote(tour?.stops[0]?.note));
    launch(current, () => {
      if (tour) { advanceTour(); return; }
      phase = 'ready';
    });
  }

  function startBuild(stopInfo) {
    const section = stopInfo.section;
    phase = 'tour';
    visitedSections.add(section);
    showTourDock(tour.index);
    const tier = crewTier(width());
    const current = prepare('build', buildDuration(tier) * (stopInfo.weight || 1));
    const candidates = gather(current, stopInfo.jobs || [], section);
    current.heading = section.querySelector('h2');
    const handoff = stopInfo.handoff ? section.querySelector(stopInfo.handoff) : null;
    watchElements(current, [section, current.heading, handoff, ...candidates]);
    measure(current);
    current.measurable = isMeasurable(current, [...current.watch]);
    // Scroll target: the section's top, clamped to the scrollable range.
    const y0 = current.sy0;
    const maxY = Math.max(0, (root.scrollHeight || 0) - current.vh);
    const sectionBox = box(current, section);
    // Stop where an anchor link would (clear of the fixed header), unless the
    // stop is a full-bleed scene or should show the section's end.
    const headerPad = stopInfo.align ? 0 : parseFloat(window.getComputedStyle?.(root).scrollPaddingTop) || 0;
    const offset = stopInfo.align === 'end' ? Math.max(0, sectionBox.h - current.vh) : -headerPad;
    const to = current.measurable ? Math.round(clamp(y0 + sectionBox.y + offset, 0, maxY)) : y0;
    current.dyFinal = to - y0;
    const travel = Math.abs(to - y0);
    current.lead = travel < 2 ? 0 : positive(config.scrollDuration, clamp(700 + travel * 0.35, 900, 2200) * (tier === 'phone' ? 0.92 : 1));
    if (current.lead) current.scroll = { from: y0, to, ms: current.lead, done: false };
    // Tall sections: keep scrolling through them while items are placed.
    if (stopInfo.span && current.measurable) {
      const sectionEnd = y0 + sectionBox.y + sectionBox.h;
      const span = Math.min(sectionEnd - current.vh - to, current.vh * stopInfo.span, maxY - to);
      // Hold briefly first so the heading is built while still in view.
      if (span > 40) { current.span = Math.round(span); current.spanHold = current.budget * 0.2; current.spanMs = current.budget * 0.8; }
    }
    current.jobs = collect(current, stopInfo.jobs || [], section);
    current.jobs.forEach(job => { job.readyAt = readyAt(current, job.target); });
    // Crew: real roster members for each job's role, round-robin per role.
    const counts = CREWS[tier];
    current.agents.push(makeAgent('orchestrator', 1, 1, 0));
    const roster = new Map();
    const turn = {};
    current.jobs.forEach(job => {
      const role = resolveRole(job.role, counts);
      const n = turn[role] = (turn[role] || 0) + 1;
      const slot = ((n - 1) % counts[role]) + 1;
      const key = `${role}#${slot}`;
      let agent = roster.get(key);
      if (!agent) { agent = makeAgent(role, slot, counts[role], current.agents.length); roster.set(key, agent); current.agents.push(agent); }
      job.agent = agent;
      agent.queue.push(job);
    });
    if (handoff && (!current.measurable || willShow(current, handoff))) {
      current.handoffJob = createJob(current, { kind: 'review', role: 'orchestrator', act: 'handing off', size: true, color: '#e6eed6' }, handoff, []);
      current.handoffMs = handoffDuration;
      current.jobs.push(current.handoffJob);
    }
    adoptCarry(current);
    buildStage(current);
    remeasureDots(current);
    planBuild(current, stopInfo);
    // Keep the page drifting slowly while the crew works (not on the last
    // stop); spanning stops scroll on through the section instead.
    const creep = current.span || (tour && tour.index < tour.stops.length - 1 && current.measurable
      ? Math.min(positive(config.creep, 64), Math.max(0, maxY - to))
      : 0);
    if (creep > 2) {
      current.scroll = current.scroll || { from: y0, to: y0, ms: 0, done: false };
      current.scroll.creep = creep;
      current.scroll.creepMs = current.span ? current.spanMs : Math.max(400, current.total - current.scroll.ms);
      current.scroll.hold = current.span ? current.spanHold : 0;
    }
    if (stopInfo.note) addEvent(current, current.lead + Math.max(0, current.total - current.lead) * 0.5, () => showNote(stopInfo.note));
    launch(current, advanceTour);
  }

  // ---- manual passes (after a cancelled first-visit tour) -----------------
  function startSection(section) {
    const current = prepare('pass', passDuration);
    const candidates = gather(current, SECTION_PLAN, section);
    if (!candidates.size) return false;
    watchElements(current, [...candidates]);
    measure(current);
    current.measurable = isMeasurable(current, [...current.watch]);
    current.jobs = collect(current, SECTION_PLAN, section, SECTION_CREW[current.tier]);
    if (!current.jobs.length) return false;
    clearVisuals();
    const roleTotals = {};
    current.jobs.forEach(job => { job.role = resolveRole(job.role, CREWS[current.tier]); roleTotals[job.role] = (roleTotals[job.role] || 0) + 1; });
    const roleSeen = {};
    current.jobs.forEach(job => {
      roleSeen[job.role] = (roleSeen[job.role] || 0) + 1;
      const agent = makeAgent(job.role, roleSeen[job.role], roleTotals[job.role], current.agents.length + 1);
      agent.queue.push(job);
      job.agent = agent;
      current.agents.push(agent);
    });
    if (dock) {
      clearTimeout(dock.timer);
      dock.root.classList.add('is-busy');
      const name = TOUR_STOPS.find(stopInfo => section.matches(stopInfo.sel))?.name || section.id || 'section';
      dock.where.textContent = name;
      announce(`Tracing ${name}.`);
    }
    buildStage(current);
    remeasureDots(current);
    planSection(current);
    phase = 'section';
    launch(current, () => { phase = 'ready'; endPass(); });
    currentSection = section;
    return true;
  }

  function endPass() {
    if (!dock) return;
    dock.root.classList.remove('is-busy');
    dock.dots.textContent = '';
    armPill();
  }

  function watchSections() {
    if (!sectionsEligible || !window.IntersectionObserver) return;
    observer?.disconnect();
    observer = new window.IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!sectionsEligible || tour) return;
        if (!entry.isIntersecting) {
          if (entry.target === currentSection) { clearVisuals(); phase = 'ready'; endPass(); }
          return;
        }
        if (visitedSections.has(entry.target)) return;
        visitedSections.add(entry.target);
        try { startSection(entry.target); }
        catch { clearVisuals(); phase = 'ready'; endPass(); }
      });
    }, { threshold: 0.18 });
    document.querySelectorAll('main > section[id]:not(#home), footer[id]').forEach(section => observer.observe(section));
  }

  // ---- visitor input ------------------------------------------------------
  const inDock = event => Boolean(dock && event.target?.closest?.('.agentic-dock'));
  const onKey = event => {
    // Escape first closes the plan list; the tour keeps going.
    if (event.key === 'Escape' && planOpen) { setPlanOpen(false); if (dock?.root.contains(document.activeElement)) dock.toggle.focus({ preventScroll: true }); return; }
    // Tab between the dock's own controls is not the visitor leaving the tour.
    if (event.key === 'Tab' && inDock(event)) return;
    if ((event.key === 'Escape' || event.key === 'Tab') && (tour || phase !== 'ready' || sectionsEligible)) { stop(); return; }
    // Enter/Space on the dock's own buttons activate them; any other key is
    // the visitor taking over.
    if (tour && !inDock(event)) cancelTour();
  };
  const onTakeover = event => { if (tour && !inDock(event)) cancelTour(); };
  // Keyboard focus leaving the dock for the page ends the tour like Tab does.
  const onFocusIn = event => {
    if (!tour || inDock(event) || run?.stage.contains(event.target)) return;
    if (event.target === document.body || event.target === root || event.target === document) return;
    stop();
  };
  const onNavigate = event => {
    if (event.target.closest?.('[data-agentic-skip], [data-agentic-replay], .agentic-dock')) return;
    if ((tour || phase !== 'ready' || sectionsEligible) && event.target.closest?.('a, button, summary, input, select, textarea')) stop();
  };
  const onScroll = () => {
    if (tour) {
      // Our own frames set tourY; anything else is the visitor (scrollbar
      // drag, keyboard, find-in-page, restored position).
      if (Math.abs(readScrollY() - tourY) > 4) cancelTour();
      return;
    }
    if (run) dirty = true;
    schedulePlaceDock();
  };
  const onResize = () => {
    if (tour) tourY = readScrollY();
    if (run) dirty = true;
    schedulePlaceDock();
  };
  const onVisibility = () => {
    if (!run) return;
    if (document.hidden) {
      if (paused) return;
      paused = true;
      pausedAt = clock();
      cancelFrame();
    } else if (paused) {
      const now = clock();
      run.last = now;
      if (tour) tour.hiddenMs += now - pausedAt;
      paused = false;
      dirty = true;
      schedule();
    }
  };
  const onMotion = () => { replayButton.disabled = Boolean(media?.matches); if (media?.matches) stop(true, false); };
  const takeover = ['wheel', 'touchstart', 'touchmove', 'pointerdown'];
  const onPageHide = event => {
    stop(false, false);
    if (event.persisted) return;
    destroyed = true;
    document.removeEventListener('keydown', onKey, true);
    document.removeEventListener('click', onNavigate, true);
    document.removeEventListener('focusin', onFocusIn, true);
    document.removeEventListener('visibilitychange', onVisibility);
    takeover.forEach(type => window.removeEventListener(type, onTakeover, { capture: true }));
    window.removeEventListener('scroll', onScroll);
    window.removeEventListener('resize', onResize);
    window.removeEventListener('pagehide', onPageHide);
    media?.removeEventListener?.('change', onMotion);
  };
  document.addEventListener('keydown', onKey, true);
  document.addEventListener('click', onNavigate, true);
  document.addEventListener('focusin', onFocusIn, true);
  document.addEventListener('visibilitychange', onVisibility);
  takeover.forEach(type => window.addEventListener(type, onTakeover, { capture: true, passive: true }));
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onResize);
  window.addEventListener('pagehide', onPageHide);
  media?.addEventListener?.('change', onMotion);
  replayButton.addEventListener('click', () => startTour(true));
  // `everyVisit`: play on every load (reloads included), not only the first.
  const everyVisit = Boolean(config.everyVisit);
  const eligible = shouldPlayEntrance({ seen: everyVisit ? false : seen, reducedMotion: Boolean(media?.matches), storageAvailable: Boolean(storage), hash: window.location.hash, navigationType });
  if (eligible && everyVisit) {
    // A reload would restore the old scroll position; start from the top instead.
    try { if ('scrollRestoration' in window.history) window.history.scrollRestoration = 'manual'; } catch { /* not available */ }
    if (readScrollY() > 0) scrollToY(0);
  }
  try { if (eligible) startTour(); else replayButton.hidden = false; }
  catch { stop(false, false); }
  return {
    get phase() { return phase; },
    get sectionsEligible() { return sectionsEligible; },
    get paused() { return paused; },
    get touring() { return Boolean(tour); },
    get tour() { return tour ? { index: tour.index, total: tour.stops.length, name: tour.stops[tour.index]?.name } : null; },
    get stats() { return run ? statsOf(run) : { ...lastStats, working: 0, visible: 0 }; },
    get speed() { return speed; },
    get crewTier() { return crewTier(width()); },
    get crewSize() { return crewSize(width()); },
    whenTourEnds(callback) { if (tour) tourEndCallbacks.push(callback); else callback(); },
    skip: () => stop(),
    replay: () => startTour(true),
  };
}

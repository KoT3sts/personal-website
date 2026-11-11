import { SECTION_PLAN, SECTION_TARGETS } from './section-plan.js';
import { HOLD_SHARE, travelPlan, trackAt } from './experience.js';
export { SECTION_TARGETS };
// First-visit "agent crew" entrance and guided build tour.
//
// One orchestrator dispatches role-coloured subagents that appear to assemble
// the real, prebuilt page. On an eligible first visit the crew builds the
// hero from a black screen (measured layout guides, a paint wipe that clears
// the black, then the build); then the page scrolls itself from section to section while smaller
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
// The pill's text after Skip or any input stopped the tour (Replay follows it).
const SKIPPED = 'Tour skipped ·';
const NAME_MAX = 30; // longest item name quoted in an action label
const HERO_BASE = 4600; // HERO_PLAN waves are authored against this
const BUILD_BASE = 3200; // tour section plans are authored against this
const PASS_BASE = 1000; // manual (post-cancel) tracing passes
// The hero opens on a black screen: the orchestrator plans alone, the crew
// pops in, agents draw measured layout guides (each label shows briefly, over
// the black only) and a paint agent wipes the black away. The build starts at
// `end` and follows the wipe: each item is built once the paint has passed
// it, the name and the headline first, so the headline reads by ~2.5 s.
// Real ms at the desktop hero pace; scaled with the hero run (so short test
// timings and 2x both hold). `label`: how long a guide's label stays up.
const INTRO = { crew: 100, crewEnd: 300, guides: 340, guidesEnd: 1150, paint: 1050, paintEnd: 1650, end: 800, fade: 500, label: 520 };
// The most labels and badges on screen at once while the hero is built
// (cursor labels and guide labels): the rest of the crew works unlabelled.
const HERO_BADGES = 6;
// Lower sections still wholly below the fold when their stop is planned start
// as a wireframe (near-black fill, margin guides, outline, skeleton blocks).
// Virtual ms, scaled with the stop's animation pace except `grace`: the most
// the fill may stay on screen after the section's top enters, unpainted.
// `focus`: the guides fade once the section's top is this high in the view.
const WIRE = { paint: 800, skeleton: 250, guides: 500, grace: 250, focus: 0.35, lines: 8 };

// Real durations in ms. Hero ~1.8x the original 4.6 s so each agent's work
// stays readable; each lower section gets a ~3-5 s work budget (x `weight`),
// overlapping the scroll into it.
export const TIMING = {
  hero: { desktop: 8400, tablet: 8200, phone: 7400 },
  build: { desktop: 3200, tablet: 3000, phone: 2600 },
  pass: 1100,
  handoff: 1300,
  pillMs: 10000,
};

// The tour's page scroll is one continuous velocity model (px, px/s, px/s²):
// each stop sets a target and a cruise speed, and the scroll accelerates or
// brakes toward them within `accel`, so it never stops before Contact.
export const SCROLL = {
  desktop: { accel: 900, max: 760, creep: 62, floor: 24 },
  tablet: { accel: 800, max: 680, creep: 54, floor: 22 },
  phone: { accel: 700, max: 680, creep: 52, floor: 20 },
};
// Agents that stay on screen between stops (plus the orchestrator), the most
// agents one stop may have out, and how many rotate back to the dock per stop.
const RIDE_ALONG = { desktop: 13, tablet: 6, phone: 4 };
const MAX_CREW = { desktop: 16, tablet: 8, phone: 5 };
const MIN_CREW = { desktop: 12, tablet: 6, phone: 4 };
const ROTATE = { desktop: 2, tablet: 1, phone: 1 };
// Spare roster agents each stop keeps in the dock for rescues (on top of
// its builders), and on narrow screens the most agents out idling or
// rescuing at once.
const RESERVE = { desktop: 0, tablet: 2, phone: 3 };
const NARROW_SPARE = 4;
// Idle agents kept on screen when the side margins are too narrow (phones).
const NARROW_IDLE = 3;
// Rescues (virtual ms): content whose planned agent would be late, or that no
// planned job covers, waits hidden for the nearest idle margin agent, which
// flies in and builds it. `cap`: the longest it may sit hidden on screen;
// `lead`: how early an agent is reserved before the item comes into view;
// travel is quicker than a planned move (`travel` min/max).
export const RESCUE = { cap: 450, lead: 420, travel: [200, 420], spare: 120 };

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
  // Phones: five builders plus three spare hands for rescues.
  phone: { layout: 1, type: 2, copy: 2, art: 1, links: 1, qa: 1 },
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
// Name and role first: the wordmark and the headline go out at once.
const HERO_PLAN = [
  // `label`: each word's agent names it, so the three labels differ.
  { sel: '.hero-line > span', role: 'type', kind: 'type', wave: 0, each: true, charMs: 44, label: true, act: 'setting' },
  { sel: '.hero-fade', role: 'type', kind: 'type', wave: 0, charMs: 44, label: true, act: 'setting' },
  { sel: '.wordmark', role: 'nav', kind: 'reveal', wave: 0, act: 'placing wordmark' },
  { sel: '.site-header', role: 'layout', kind: 'frame', wave: 420, act: 'framing header' },
  { sel: '#hero-title', role: 'layout', kind: 'frame', wave: 420, act: 'framing title' },
  { sel: '.hero-bottom', role: 'layout', kind: 'frame', wave: 420, act: 'framing intro row' },
  // One agent links the whole nav (no stack of identical labels).
  { sel: '.main-nav a', role: 'nav', kind: 'reveal', wave: 470, each: true, group: '.main-nav', grouped: true, act: 'linking nav' },
  { sel: '.header-contact', role: 'nav', kind: 'reveal', wave: 470, act: 'placing résumé link' },
  { sel: '.hero-kicker', role: 'copy', kind: 'type', wave: 600, charMs: 24, act: 'writing location' },
  // The portrait develops from the hair down as ENGINEER is being set
  // (portrait.css styles the reveal); the small orbit accent follows.
  { sel: '.hero-portrait', role: 'art', kind: 'reveal', wave: 760, work: 1100, art: true, act: 'placing portrait' },
  { sel: '.sculpture', role: 'art', kind: 'reveal', wave: 980, work: 620, art: true, act: 'placing orbit accent' },
  { sel: '.orbit-label', role: 'art', kind: 'reveal', wave: 980, act: 'labelling orbit' },
  { sel: '.art-coordinate', role: 'art', kind: 'reveal', wave: 980, act: 'marking coordinate' },
  { sel: '.hero-intro .small-label', role: 'copy', kind: 'type', wave: 300, charMs: 22, act: 'writing greeting' },
  { sel: '.hero-intro > p:not(.hero-scope)', role: 'copy', kind: 'wipe', wave: 1050, act: 'writing intro' },
  { sel: '.hero-scope', role: 'copy', kind: 'wipe', wave: 1050, act: 'writing scope' },
  { sel: '.hero-rule > span', role: 'copy', kind: 'wipe', wave: 1180, each: true, group: '.hero-rule', act: 'writing footer rule' },
  { sel: '.scroll-cue', role: 'links', kind: 'reveal', wave: 1180, act: 'wiring scroll cue' },
  { sel: '.hero-actions .pill-button', role: 'links', kind: 'reveal', wave: 1180, act: 'wiring résumé' },
  { sel: '.hero-links a', role: 'links', kind: 'reveal', wave: 1180, each: true, group: '.hero-links', act: 'wiring links' },
  { sel: '.hero-orbit', role: 'motion', kind: 'orbit', wave: 1650, act: 'aligning orbit' },
  { sel: '.main-nav', role: 'a11y', kind: 'review', wave: 2150, act: 'checking targets' },
  { sel: '.hero-actions', role: 'a11y', kind: 'review', wave: 2150, act: 'checking hit areas' },
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
// - kind `copy` outlines an item and shows a small ⌘C tag; kind `paste` drags
//   a ghost of the item before it (`from: 'prev'`, or a selector) onto its
//   item and drops it with ⌘V. `holes` leaves placeholder bars where the
//   later jobs inside that item will write (they wait for it: `after`).
// - kind `pin` leaves a QA comment pin (`note`); a later `resolve` job
//   (`after` the pin) turns it into a check mark.
// - `key` / `after`: a job waits for the keyed job inside the same item (or
//   the first keyed job); work passes between them with a thin handoff line.
//   `afterAt`: the share of that job to wait for; `after: '*'`: every builder
//   inside the item, or with `afterOf` every builder of the stop's items
//   matching that selector (`overlap`: ms before the last one ends).
// - kind `pick` presses a real control (see PICK).
// - `stagger`: ms between the items of one spec waiting on the same job.
// - `only`: 'wide' (desktop and tablet) or 'phone'; with the stop's
//   `columns` set, 'wide' means its grid really has two or more columns.
// - `slide`: the item is carried in sideways by a pinned stage (Experience),
//   so it is checked for visibility when its agent sets off, not when planned.
//   `shown`: only items on the stage when the stop is planned (chapters still
//   off to the right are left to the stops that bring them in).
// Every job follows the visible-target rule (see perceivable).
// `weight` scales the build budget; `span` keeps scrolling through a tall
// section (up to span x viewport height, to its end with `untilEnd`, or until
// the `spanTo` element sits below the header) while items are placed; `note` is the
// stop's decorative handoff line beside the dock; `pace` quickens its
// animation (the pasted Experience chapters); `frameMs` fades its tinted
// placement frames that soon (the item itself keeps building). `sub` stops continue the
// previous stop's section (same plan step in the dock) and only run while
// their section matches `when` (checked as they come up); `chapter` aims the
// scroll at that Experience chapter when its stage travels sideways, and
// `dwell` is the creep (px/s) while the stage holds on it.
// Where a pasted chapter lands: its left edge at this share of the view.
const XP_LAND = 0.46;
const chapterJobs = n => {
  const ch = `.xp-chapter:nth-child(${n})`;
  // Editors set off as the ghost drops (the last fifth of its drag).
  const at = { slide: true, after: 'paste', afterAt: 0.8 };
  return [
    { sel: ch, role: 'copy', kind: 'paste', from: 'prev', holes: true, slide: true, key: 'paste', act: `pasting chapter 0${n}`, work: 1100 },
    { sel: `${ch} .xp-title`, role: 'type', kind: 'type', label: true, act: 'setting', charMs: 42, ...at },
    { sel: `${ch} .xp-org, ${ch} .xp-when`, roles: ['copy', 'links'], kind: 'type', multi: 2, label: true, act: 'writing', charMs: 32, ...at },
    { sel: `${ch} .xp-year`, role: 'art', kind: 'reveal', act: 'setting year marker', work: 700, ...at },
    { sel: `${ch} .xp-marks`, role: 'nav', kind: 'place', act: 'marking milestones', kids: 'li', ...at },
    { sel: `${ch} .xp-group-head`, role: 'nav', kind: 'place', label: true, name: 'h4', act: 'placing', ...at },
    { sel: `${ch} .xp-points > li`, roles: ['copy', 'type', 'links'], kind: 'wipe', multi: 3, label: true, act: 'writing', ...at },
    { sel: `${ch} .xp-group > .tag-list`, role: 'art', kind: 'place', act: 'swapping tags', kids: 'li', ...at },
    { sel: ch, role: 'qa', kind: 'review', act: 'checking chapter', ...at },
  ];
};

export const TOUR_STOPS = [
  { sel: '#home', name: 'Hero', note: 'type → qa · headline ready' },
  { sel: '#about', name: 'About', weight: 0.9, align: 'start', note: 'motion → type · flow drawn', jobs: [
    { sel: '.about-flow', role: 'motion', kind: 'reveal', act: 'drawing flow field', work: 900 },
    { sel: '.about-transition-meta > span', roles: ['copy', 'layout'], kind: 'wipe', multi: 2, act: 'writing meta line' },
    { sel: '.about-panel-index', role: 'copy', kind: 'type', act: 'setting panel index', charMs: 40 },
    { sel: '#about-title', role: 'type', kind: 'type', act: 'setting title', charMs: 110 },
    { sel: '.about-transition-foot > span', roles: ['copy', 'links'], kind: 'wipe', multi: 2, act: 'writing footer line' },
    { sel: '.about-title-panel', role: 'art', kind: 'frame', act: 'framing panel' },
    { sel: '.about-transition-meta', role: 'qa', kind: 'review', act: 'checking alignment' },
    { sel: '.about-transition-foot', role: 'a11y', kind: 'review', act: 'checking contrast' },
  ] },
  // Its copy sits at the bottom of a tall scene: stop with the section's end in view
  // (`untilEnd`: on short screens too).
  // The figure gets about a second longer: the stop opens on the scene's top
  // (the falling figure) and only then cruises down to the copy. The whole art
  // (figure, halo, feathers) is placed together, once the drawing has loaded.
  { sel: '#introduction', name: 'Introduction', weight: 0.8, span: 0.45, untilEnd: true, note: 'art → copy · scene lit', jobs: [
    { sel: '.cinematic-art', role: 'art', kind: 'reveal', act: 'placing figure in the light', art: true, work: 1100 },
    { sel: '.cinematic-topline > span', roles: ['layout', 'copy'], kind: 'wipe', multi: 2, act: 'setting topline' },
    { sel: '.cinematic-copy > .mono', role: 'type', kind: 'type', act: 'setting kicker', charMs: 26 },
    { sel: '#introduction-title', role: 'type', kind: 'type', act: 'setting headline', charMs: 40 },
    { sel: '.cinematic-copy > p:first-of-type', role: 'copy', kind: 'wipe', act: 'writing intro' },
    { sel: '.cinematic-copy > p:nth-of-type(2)', role: 'copy', kind: 'wipe', act: 'writing background' },
    { sel: '.currently', role: 'copy', kind: 'wipe', act: 'writing current study' },
    { sel: '.scene-pill', roles: ['links', 'links'], kind: 'place', multi: 2, label: true, act: 'wiring' },
    { sel: '.cinematic-caption > span', roles: ['a11y', 'qa'], kind: 'wipe', multi: 2, act: 'writing caption' },
  ] },
  // Two-column grids: the first card is placed and copied, and pasted into the
  // rest of the first rows; editors write each pasted card's name and proof
  // over its placeholders and a tag agent swaps its tags. The cards further
  // down (and every card in a single-column list, `columns`) are placed directly.
  { sel: '#capabilities', name: 'Capabilities', weight: 0.9, span: 1.0, frameMs: 750, columns: '.capability-list', note: 'copy → type · cards pasted', jobs: [
    { sel: '.section-top > span', roles: ['layout', 'layout'], kind: 'wipe', multi: 2, act: 'setting header row' },
    { sel: '#capabilities-title', role: 'type', kind: 'type', act: 'setting title', charMs: 70 },
    { sel: '.capabilities-heading > p', role: 'a11y', kind: 'wipe', act: 'writing summary' },
    { sel: '.capability', roles: ['copy', 'type', 'links', 'copy', 'type', 'links', 'qa'], kind: 'place', multi: 7, label: true, name: 'h3', act: 'placing', sub: '.capability-proof', kids: '.tag-list li', only: 'phone' },
    { sel: '.capability:first-child', role: 'nav', kind: 'place', label: true, name: 'h3', act: 'placing', sub: '.capability-proof', key: 'first', only: 'wide' },
    { sel: '.capability:first-child > .tag-list', role: 'art', kind: 'place', act: 'tagging tools', kids: 'li', after: 'first', afterAt: 0.3, only: 'wide' },
    { sel: '.capability:first-child', role: 'copy', kind: 'copy', act: 'copying card', key: 'copy', after: 'first', only: 'wide' },
    { sel: '.capability:nth-child(-n+4):not(:first-child)', roles: ['copy', 'copy', 'copy'], kind: 'paste', multi: 3, from: '.capability:first-child', stagger: 140, holes: true, act: 'pasting card', key: 'paste', after: 'copy', work: 480, only: 'wide' },
    // The third name goes to the agent that placed the first card (free by
    // then), so one type agent never holds up two cards.
    { sel: '.capability:nth-child(-n+4):not(:first-child) > h3', roles: ['type', 'type', 'nav'], kind: 'type', multi: 3, label: true, act: 'writing', charMs: 36, after: 'paste', afterAt: 0.6, only: 'wide' },
    { sel: '.capability:nth-child(-n+4):not(:first-child) > .capability-proof', roles: ['links', 'links', 'links'], kind: 'wipe', multi: 3, act: 'writing proof', after: 'paste', afterAt: 0.6, only: 'wide' },
    { sel: '.capability:nth-child(-n+4):not(:first-child) > .tag-list', roles: ['art', 'a11y', 'art'], kind: 'place', multi: 3, act: 'swapping tags', kids: 'li', after: 'paste', afterAt: 0.6, only: 'wide' },
    { sel: '.capability:nth-child(n+5)', roles: ['nav', 'motion', 'qa'], kind: 'place', multi: 3, label: true, name: 'h3', act: 'placing', sub: '.capability-proof', kids: '.tag-list li', only: 'wide' },
    { sel: '.capability-list', role: 'qa', kind: 'pin', note: 'tighten spacing', key: 'pin', act: 'leaving a note', only: 'wide' },
    { sel: '.capability-list', role: 'layout', kind: 'resolve', act: 'tightening spacing', after: 'pin', only: 'wide' },
    { sel: '.capabilities-heading', role: 'qa', kind: 'review', act: 'checking alignment' },
  ] },
  // Wide screens pin the chapter stage and the scroll carries its track
  // sideways (experience.js). The first stop builds chapter 1 (laid out as a
  // frame with placeholder fields, then filled) and the stage pins on it; two
  // `sub` stops then hold the stage on chapters 2 and 3 in turn: a copy agent
  // copies chapter 1, drags a ghost of it in as the page slides and drops it
  // as the next chapter; editors write over its placeholders, a tag agent
  // swaps its tags and QA checks it. Chapters still off to the right wait
  // unseen (experience.css). Phones and tablets stack the chapters and every
  // item is built in place on the first stop (`span` cruises through them).
  { sel: '#experience', name: 'Experience', weight: 0.9, stackWeight: 1.4, pace: 0.78, span: 2.4, chapter: 0, dwell: 16, note: 'layout → copy · first chapter set', jobs: [
    { sel: '.section-top > span', roles: ['copy', 'nav'], kind: 'wipe', multi: 2, act: 'setting header row' },
    { sel: '#experience-title', role: 'type', kind: 'type', act: 'setting title', charMs: 70 },
    { sel: '.experience-heading > p', role: 'copy', kind: 'wipe', act: 'writing summary' },
    { sel: '[data-xp="travel"] .xp-chapter:first-child', role: 'layout', kind: 'frame', holes: true, key: 'frame', act: 'drawing chapter frame' },
    { sel: '.xp-year', role: 'art', kind: 'reveal', multi: 3, act: 'setting year marker', work: 700, after: 'frame', afterAt: 0.4, shown: true },
    { sel: '.xp-title', roles: ['type', 'type', 'type'], kind: 'type', multi: 3, label: true, act: 'setting', charMs: 45, after: 'frame', afterAt: 0.4, shown: true },
    { sel: '.xp-org, .xp-when', roles: ['copy', 'links'], kind: 'type', multi: 6, label: true, act: 'writing', charMs: 35, after: 'frame', afterAt: 0.4, shown: true },
    { sel: '.xp-marks', role: 'nav', kind: 'place', multi: 3, act: 'marking milestones', kids: 'li', after: 'frame', afterAt: 0.4, shown: true },
    { sel: '.xp-group-head', role: 'nav', kind: 'place', multi: 4, label: true, name: 'h4', act: 'placing', after: 'frame', afterAt: 0.4, shown: true },
    { sel: '.xp-points > li', roles: ['copy', 'type', 'links', 'copy', 'type', 'qa', 'copy', 'links'], kind: 'wipe', multi: 8, rest: true, label: true, act: 'writing', after: 'frame', afterAt: 0.4, shown: true },
    { sel: '.xp-group > .tag-list', roles: ['a11y', 'links', 'a11y', 'links'], kind: 'place', multi: 4, act: 'tagging tools', kids: 'li', after: 'frame', afterAt: 0.4, shown: true },
    { sel: '.xp-controls', role: 'links', kind: 'place', act: 'wiring chapter controls', kids: 'button, .xp-count', shown: true },
    { sel: '.xp-stage', role: 'a11y', kind: 'review', act: 'checking chapter keys' },
    // Once chapter 1 is written, it is copied for the next two.
    { sel: '[data-xp="travel"] .xp-chapter:first-child', role: 'copy', kind: 'copy', after: '*', overlap: 1100, act: 'copying chapter 01' },
  ] },
  { sel: '#experience', when: '[data-xp="travel"]', name: 'Experience', sub: true, chapter: 1, dwell: 16, weight: 0.6, pace: 0.72, note: 'copy → type · second chapter pasted', jobs: chapterJobs(2) },
  { sel: '#experience', when: '[data-xp="travel"]', name: 'Experience', sub: true, chapter: 2, dwell: 16, weight: 0.6, pace: 0.72, note: 'copy → type · third chapter pasted', jobs: chapterJobs(3) },
  // The explorer (explorer.js), the one project gallery. It holds still while
  // the tour builds it, so its rotated card names and the hidden caption are
  // never written: art agents place the six covers round the ring one at a
  // time, a links agent fills in the index list, and QA leaves a contrast pin
  // that a11y resolves. Then a links agent presses the first project in the
  // index (a real click, as a visitor would): the ring turns into the drum and
  // the project's title and "Case study" chip come up before the tour moves on.
  // It is pressed only while it is still the selected project (first visit),
  // so after the tour the page is as it was and a Replay keeps a visitor's pick.
  { sel: '#work', name: 'Projects', weight: 1.0, span: 0.8, spanTo: '.explorer-stage', creep: 24, note: 'art → links · ring placed', jobs: [
    { sel: '.section-top > span', roles: ['layout', 'layout'], kind: 'wipe', multi: 2, act: 'setting header row' },
    { sel: '#work-title', role: 'type', kind: 'type', act: 'setting title', charMs: 70 },
    { sel: '.work-heading > p', role: 'copy', kind: 'wipe', act: 'writing summary' },
    { sel: '#explorer-title', role: 'type', kind: 'type', act: 'setting label', charMs: 50 },
    { sel: '.explorer-item', roles: ['art', 'art', 'art', 'art', 'art', 'art'], kind: 'place', multi: 6, label: true, name: '.explorer-card-name', act: 'placing cover', pop: '.explorer-cover' },
    { sel: '.explorer-index-label', role: 'links', kind: 'type', act: 'writing index label', charMs: 35 },
    { sel: '.explorer-pick', roles: ['links', 'links', 'links', 'links', 'links', 'links'], kind: 'place', multi: 6, label: true, name: '.explorer-pick-name', act: 'listing', sub: '.explorer-pick-name' },
    { sel: '.explorer-hint', role: 'motion', kind: 'wipe', act: 'writing drag hint' },
    { sel: '.work-end > *', roles: ['copy', 'links'], kind: 'wipe', multi: 2, act: 'writing footer line' },
    { sel: '.explorer-index', role: 'qa', kind: 'pin', note: 'check contrast', key: 'pin', act: 'leaving a note' },
    { sel: '.explorer-index', role: 'a11y', kind: 'resolve', act: 'fixing contrast', after: 'pin' },
    { sel: '.explorer-covers', role: 'a11y', kind: 'review', act: 'checking keys and labels', size: true },
    { sel: '.explorer-pick[data-explorer-pick="0"]', role: 'links', kind: 'pick', label: true, name: '.explorer-pick-name', act: 'opening', after: '*', afterOf: '.explorer-item, .explorer-pick', work: 2300, only: 'wide' },
  ] },
  { sel: '#skills', name: 'Skills', weight: 0.7, pace: 0.85, span: 0.6, note: 'copy → a11y · tags listed', jobs: [
    { sel: '.section-top > span', roles: ['layout', 'layout'], kind: 'wipe', multi: 2, act: 'setting header row' },
    { sel: '#skills-title', role: 'type', kind: 'type', act: 'setting title', charMs: 70 },
    { sel: '.skill-list > div', roles: ['copy', 'type', 'links', 'copy', 'type'], kind: 'place', multi: 5, label: true, name: 'dt', act: 'listing', kids: 'li' },
    { sel: '.education-layout > h3', role: 'nav', kind: 'type', multi: 2, act: 'setting heading', charMs: 50 },
    // Each school: its name typed, then its degree and dates written.
    { sel: '.education-list .school', roles: ['type', 'type'], kind: 'type', multi: 2, label: true, act: 'writing', charMs: 45 },
    { sel: '.education-list .degree', roles: ['copy', 'copy'], kind: 'wipe', multi: 2, label: true, act: 'writing' },
    { sel: '.education-list .school-meta', roles: ['links', 'links'], kind: 'type', multi: 2, label: true, act: 'writing dates', charMs: 40 },
    { sel: '.spoken-languages', role: 'copy', kind: 'wipe', act: 'writing languages' },
    { sel: '.skills-layout', role: 'a11y', kind: 'review', act: 'checking tag lists' },
  ] },
  // The closing note between Approach and Contact is built on the Approach
  // stop (`within` looks outside the stop's own section).
  { sel: '#approach', name: 'Approach', weight: 0.45, pace: 0.8, span: 0.3, note: 'type → copy · rows set', jobs: [
    { sel: '.section-top > span', roles: ['layout', 'layout'], kind: 'wipe', multi: 2, act: 'setting header row' },
    { sel: '#approach-title', role: 'type', kind: 'type', act: 'setting title', charMs: 70 },
    { sel: '.approach-heading > p', role: 'copy', kind: 'wipe', act: 'writing summary' },
    { sel: '.approach-list > details', roles: ['copy', 'type', 'links'], kind: 'place', multi: 3, label: true, name: 'summary > span:nth-child(2)', act: 'placing', sub: ':scope > p', kids: '.approach-focus li, .approach-link' },
    { sel: '.closing-note > .mono', within: '#notes', role: 'copy', kind: 'type', act: 'writing note line', charMs: 35 },
    { sel: '.closing-note > p', within: '#notes', role: 'type', kind: 'type', act: 'setting closing line', charMs: 80 },
    { sel: '.approach-list', role: 'a11y', kind: 'review', act: 'checking disclosures' },
    { sel: '.approach-heading', role: 'qa', kind: 'review', act: 'checking alignment' },
  ] },
  { sel: '#contact', name: 'Contact', weight: 0.8, handoff: '.contact-button', note: 'links → qa · links wired', jobs: [
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


// The dock lifts itself above these so it never covers in-page controls near
// the bottom edge: résumé/contact links, the introduction's scene pills and
// the Experience chapter bar (year index, previous/next).
const PROTECTED = '.hero-actions .pill-button, .hero-links a, .scene-pill, .xp-index-button, .xp-step, .contact-button, .contact-copy, .contact-links a, .footer-bottom > *';

const HIDES = new Set(['reveal', 'type', 'wipe', 'place']);
const OPTIONAL = new Set(['frame', 'review', 'orbit', 'caret', 'pin', 'resolve']);
const TEXT_KINDS = new Set(['type', 'wipe', 'caret']);
const DEMOTE = { reveal: 'frame', type: 'caret', wipe: 'review', place: 'review' };
// Decorative kinds that may share an element with its builder (`pick`
// presses a real control once it is built: see PICK).
const SHARED = new Set(['copy', 'paste', 'pin', 'resolve', 'pick']);
// Kinds whose agent shows its label only while it works (not on the way).
const QUIET = new Set(['copy', 'paste', 'pin', 'resolve']);
// The longest an art reveal waits for its image to load (virtual ms).
const IMAGE_WAIT = 260;
// Kind `pick`: an agent presses a real control (a click on it, exactly as a
// visitor's would, so the page is left in a state a visitor can reach) at
// `at` of its work and stays on it while the page responds.
const PICK = { at: 0.22 };
// Handoff lines: at most this share of the view width long, gone in `ms` (virtual).
const HANDOFF = { reach: 0.45, ms: 500 };
// The visible-target rule: below this opacity (the product along the
// element's ancestors) content counts as invisible.
const OPACITY_MIN = 0.05;
// Content waiting under a placeholder bar (after a paste or a chapter frame)
// may wait this long for its editor (virtual ms) before it is rescued.
export const HOLE_CAP = 2600;
// Occasional typos while typing: about one word in TYPO_EVERY is mistyped and
// fixed with a backspace (only plain lowercase words; see typoFor).
const TYPO_EVERY = 8;
const KEY_ROWS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'];
const ZERO = { x: 0, y: 0, w: 0, h: 0 };
const SVG = '<svg viewBox="0 0 20 26" width="17" height="22" aria-hidden="true"><path d="M2.5 1.8v19.4l5.2-4.9 3.5 7.9 3.2-1.4-3.4-7.8h7.1z"/></svg>';

const clamp01 = value => (value < 0 ? 0 : value > 1 ? 1 : value);
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const easeInOut = p => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
const easeOut = p => 1 - Math.pow(1 - p, 4);
// The progress at which easeInOut reaches `e`.
const easeInverse = e => {
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 16; i++) { const mid = (lo + hi) / 2; if (easeInOut(mid) < e) lo = mid; else hi = mid; }
  return hi;
};
const distance = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);
const positive = (value, fallback) => (Number.isFinite(value) && value > 0 ? value : fallback);

// ---- swarm motion for idle cursors -----------------------------------------
// Each agent loops on its own path (seeded by its label, so it carries over
// between tour stops without a jump) while the whole crew shares a slow flock
// drift, like birds or bees hanging around a spot. `amp` scales it down for
// cursors that should stay closer to their spot.
const seedCache = new Map();
function seedOf(label) {
  let seed = seedCache.get(label);
  if (seed) return seed;
  let h = 2166136261;
  for (let i = 0; i < label.length; i++) h = Math.imul(h ^ label.charCodeAt(i), 16777619);
  const u = k => (((h >>> (k * 5)) & 1023) / 1023);
  seed = { phase: u(0) * Math.PI * 2, fx: 0.00105 + u(1) * 0.0005, fy: 0.0013 + u(2) * 0.0005, ax: 26 + u(3) * 18, ay: 15 + u(4) * 10 };
  seedCache.set(label, seed);
  return seed;
}
export function swarm(anchor, g, agent, amp = 1) {
  const k = seedOf(agent.label || agent.role || 'agent');
  const ox = Math.sin(g * k.fx + k.phase) * k.ax + Math.sin(g * k.fx * 2.3 + k.phase * 1.7) * k.ax * 0.35;
  const oy = Math.cos(g * k.fy + k.phase * 0.8) * k.ay + Math.sin(g * k.fy * 1.9 + k.phase) * k.ay * 0.4;
  const flockX = Math.sin(g * 0.00042) * 40 + Math.sin(g * 0.00093 + 1.3) * 12;
  const flockY = Math.cos(g * 0.00056) * 16 + Math.sin(g * 0.0011 + 0.4) * 6;
  return { x: anchor.x + (ox + flockX) * amp, y: anchor.y + (oy + flockY) * amp };
}

export function shouldPlayEntrance({ seen, reducedMotion, storageAvailable, hash, navigationType }) {
  return !seen && !reducedMotion && storageAvailable && (!hash || hash === '#home') && navigationType !== 'back_forward';
}

// The one typo (if any) an agent makes while typing `text`: { at, ch }, the
// index of the mistyped character and the wrong key (a neighbour on the
// keyboard). Deterministic (seeded by the text), about one plain word in
// TYPO_EVERY. Conservative: never in text with digits, an @, a capitalised
// word after the first (names, acronyms, proper nouns), or a CSS text
// transform; only in lowercase words of four letters or more.
export function typoFor(text, { transform = 'none' } = {}) {
  const value = String(text || '');
  if (!value.trim() || (transform && transform !== 'none') || /[\d@#/]/.test(value)) return null;
  const words = [...value.matchAll(/[A-Za-zÀ-ÿ'’-]+/g)];
  // A capital is fine only where a sentence starts.
  const sentenceStart = match => match.index === words[0].index || /[.!?]\s*$/.test(value.slice(0, match.index));
  if (words.some(match => /^[A-ZÀ-Þ]/.test(match[0]) && !sentenceStart(match))) return null;
  // About one typo per TYPO_EVERY words typed, always in a plain word.
  const plain = words.filter(match => /^[a-z]{4,}$/.test(match[0]));
  if (!plain.length) return null;
  let h = 2166136261;
  for (const char of value) h = Math.imul(h ^ char.charCodeAt(0), 16777619) >>> 0;
  if (h % TYPO_EVERY >= words.length) return null;
  const match = plain[(h >>> 4) % plain.length];
  const word = match[0];
  const offset = 1 + ((h >>> 9) % (word.length - 2));
  const right = word[offset];
  const row = KEY_ROWS.find(keys => keys.includes(right)) || KEY_ROWS[0];
  const k = row.indexOf(right);
  const ch = row[k + 1] || row[k - 1] || 'e';
  return { at: match.index + offset, ch };
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
  // The tour's scroll position and velocity (px/s), carried across runs.
  const tourScroll = { y: 0, v: 0 };
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
  // The visitor's last kind of input: 'key' keeps the pill while focus is in it.
  let lastInput = '';
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
      current.now = t;
      if (current.traj) driveScroll(current, t);
      if (dirty) { dirty = false; measure(current); current.version++; }
      while (current.next < current.events.length && current.events[current.next].at <= t) {
        current.events[current.next++].fn(t);
        if (run !== current) return;
      }
      if (current.kind === 'build') { guardBlanks(current, t); rescueTick(current, t); }
      if (current.wire) updateWire(current, t);
      if (current.guides) updateIntro(current, t);
      current.active.forEach(job => job.update(t));
      updateHoles(current);
      updatePins(current, t);
      current.agents.forEach(agent => placeAgent(current, agent, t));
      if (current.kind === 'hero') hushLabels(current);
      // A rescue still under way finishes first (briefly), so nothing pops in.
      if (t >= current.total && !(current.rescuing.size && t < current.total + 2500)) {
        // Hand the ride-along crew's positions (and the tour clock) to the
        // next stop, so nothing jumps between runs.
        carry = tour && current.stayers?.size
          ? [...current.stayers].filter(agent => agent.x !== undefined && !agent.cursor.classList.contains('is-docked')).map(agent => ({
            role: agent.role, label: agent.label, x: agent.x, y: agent.y, anchor: agent.anchor || null, goal: agent.goal || null,
          }))
          : null;
        if (tour) {
          tour.vt += t;
          // Pool items still waiting stay hidden into the next stop, which
          // re-marks them in this same task (nothing is painted between) and
          // keeps counting how long they have been in view.
          const waiting = current.pool.filter(job => !job.agent && !job.late && job.reveals.length);
          tour.pending = new Map(waiting.map(job => [job.target, job.seenAt === undefined ? undefined : job.seenAt - t]));
          tour.wasHidden = new Set(waiting.flatMap(job => [job.target, ...job.reveals]));
        }
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

  // The page scroll follows one velocity model across the whole tour.
  // `tourScroll` ({ y, v }) persists between runs, so a run starts with the
  // speed the previous one ended with. Each run lays out its trajectory in
  // advance (fixed steps of virtual time, so plans and frames agree and 2x
  // stays in sync): accelerate toward the stop within the limit, arrive at
  // cruise speed instead of stopping, keep cruising or creeping while the
  // crew works, and only settle at the last stop.
  const STEP = 1000 / 120;
  function scrollStep(p, state, dt) {
    const { y, v } = state;
    const s = dt / 1000;
    let target;
    if (p.settle) {
      target = Math.sqrt(2 * p.brake * Math.max(0, p.to - y));
    } else {
      if (state.arrived < 0 && y >= p.to - 0.5) state.arrived = state.t;
      if (state.arrived < 0) target = Math.sqrt(p.cruise * p.cruise + 2 * p.brake * (p.to - y));
      else if (state.t - state.arrived >= p.cruiseAfter && y < p.until) target = p.cruise;
      else target = p.creep;
      // Ease toward the next stop's mark, but never all the way to a stop.
      target = Math.min(target, Math.max(p.floor, Math.sqrt(p.floor * p.floor + 2 * p.brake * Math.max(0, p.soft - y))));
      target = Math.min(target, Math.sqrt(2 * p.brake * Math.max(0, p.maxY - y)));
    }
    target = Math.min(target, p.max);
    const dv = clamp(target - v, -p.accel * s, p.accel * s);
    const next = v + dv;
    return { y: Math.min(p.maxY, y + (v + next) / 2 * s), v: next, t: state.t + dt, arrived: state.arrived };
  }
  function makeTraj(params, from) {
    const traj = { params, ys: [from.y], vs: [from.v], state: { y: from.y, v: from.v, t: 0, arrived: -1 } };
    extendTraj(traj, 6000);
    return traj;
  }
  function extendTraj(traj, until) {
    while ((traj.ys.length - 1) * STEP < until) {
      traj.state = scrollStep(traj.params, traj.state, STEP);
      traj.ys.push(traj.state.y);
      traj.vs.push(traj.state.v);
    }
  }
  function sampleTraj(traj, t) {
    const at = Math.max(0, t) / STEP;
    if (at + 2 > traj.ys.length) extendTraj(traj, (at + 240) * STEP);
    const i = Math.floor(at);
    const f = at - i;
    return { y: traj.ys[i] + (traj.ys[i + 1] - traj.ys[i]) * f, v: traj.vs[i] + (traj.vs[i + 1] - traj.vs[i]) * f };
  }
  // First planned time at which `test(y)` holds (searching up to `limit` ms).
  function trajTime(traj, test, limit = 30000) {
    for (let i = 0; i * STEP <= limit; i++) {
      if (i >= traj.ys.length - 1) extendTraj(traj, (i + 240) * STEP);
      if (test(traj.ys[i])) return i * STEP;
    }
    return Infinity;
  }

  function driveScroll(current, t) {
    const point = sampleTraj(current.traj, t);
    tourScroll.y = point.y;
    tourScroll.v = point.v;
    const y = Math.round(point.y);
    if (y !== Math.round(tourY)) scrollToY(y);
    if (tourY !== current.sy) {
      current.sy = tourY;
      current.dy = current.sy - current.sy0;
      current.view.clear();
      current.version++;
    }
    if (placeDock()) remeasureDots(current);
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
      if (keepDock) collapseDock('Tour skipped. All content is visible.', SKIPPED);
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
    collapseDock('Tour stopped. All content is visible.', SKIPPED);
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
    return { agents: subagents, cursors: current.agents.length, targets: current.jobs.length + current.rescues.length, done: current.done, working: current.working.size, visible };
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
    const step = tour ? tour.stops[tour.index]?.step : -1;
    if (tour && planSteps[step]?.state === 'building') { planSteps[step].agents = n; renderPlan(); }
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
    const step = stopInfo.step ?? stopIndex;
    d.where.textContent = stopInfo.name;
    d.progress.textContent = `${step + 1} / ${planSteps.length}`;
    if (planSteps[step]?.state !== 'building') setPlanStep(step, 'building');
    // A `sub` stop continues its section: it is not announced again.
    if (stopInfo.sub && stopIndex > 0) return;
    announce(stopIndex === 0
      ? `Build tour: agents are assembling the page, starting with the ${stopInfo.name.toLowerCase()}. Skip tour is available.`
      : `Building ${stopInfo.name}, section ${step + 1} of ${planSteps.length}.`);
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

  // The pill goes on its own after `pillMs` on every screen. It stays while
  // the plan is open, while the pointer is on it, or while focus is in it
  // after keyboard use (focus moved there after a click or tap does not hold it).
  function armPill() {
    if (!dock) return;
    clearTimeout(dock.timer);
    dock.timer = window.setTimeout(() => {
      if (run || tour || !dock) return;
      if (planOpen || hovered(dock.root) || (lastInput === 'key' && dock.root.contains(document.activeElement))) { armPill(); return; }
      removeDock();
    }, pillMs);
  }
  // Touch browsers keep :hover on the last tapped element, so only a real
  // hover-capable pointer holds the pill open.
  const hovered = element => { try { return !!window.matchMedia?.('(hover: hover)').matches && element.matches(':hover'); } catch { return false; } };

  function removeDock() {
    if (!dock) return;
    const hadFocus = dock.root.contains(document.activeElement);
    clearTimeout(dock.timer);
    clearTimeout(dock.noteTimer);
    clearTimeout(dock.liftTimer);
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

  // Keep the dock clear of in-page controls near the bottom edge. The lift is
  // a translate (entrance.css eases it), so `bottom` stays the resting base.
  function placeDock() {
    if (!dock || dock.root.hidden) return false;
    const vh = window.innerHeight || 768;
    const rect = dock.root.getBoundingClientRect();
    if (!rect.height) return false;
    const base = parseFloat(window.getComputedStyle?.(dock.root).bottom) || 14;
    // Horizontal extent at rest (the lift only moves it up).
    const boxes = [...document.querySelectorAll(PROTECTED)].map(element => element.getBoundingClientRect())
      .filter(r => r.height > 0 && r.top < vh && r.bottom > 0 && r.right > rect.left - 8 && r.left < rect.right + 8);
    let lift = 0;
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
    // The dots move with the eased lift: read them again once it has settled.
    window.clearTimeout(dock.liftTimer);
    dock.liftTimer = window.setTimeout(() => { if (run) remeasureDots(run); }, 400);
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
    // The layout viewport (without a classic scrollbar), for edge distances.
    current.cw = root.clientWidth || current.vw;
    current.sy0 = current.sy = readScrollY();
    current.dy = 0;
    current.measures = (current.measures || 0) + 1;
    current.view.clear();
    current.live.clear();
    // Sticky elements (and their contents) do not move with the scroll:
    // re-read them instead.
    const sticky = new Map();
    const inSticky = element => {
      for (let node = element; node && node !== document.body; node = node.parentElement) {
        if (!sticky.has(node)) sticky.set(node, window.getComputedStyle?.(node).position === 'sticky');
        if (sticky.get(node)) return true;
      }
      return false;
    };
    current.watch.forEach(element => {
      const entry = readRect(element);
      if (current.textTargets.has(element)) entry.text = readText(element);
      current.cache.set(element, entry);
      if (inSticky(element)) current.live.add(element);
    });
    measureColumn(current);
    if (current.gapProbe) {
      const gap = parseFloat(window.getComputedStyle?.(current.gapProbe).columnGap);
      current.gap = Number.isFinite(gap) && gap > 0 ? gap : 0;
    }
    remeasureDots(current);
  }

  // The content column's left/right edges (the header's bounds, the hero's
  // inner box or the first section header), so idle cursors can wait in the
  // side margins. Unmeasurable: 6% of the viewport width on each side.
  function measureColumn(current) {
    const vw = current.vw;
    const edges = element => {
      if (!element) return null;
      const rect = element.getBoundingClientRect();
      let left = rect.left;
      let right = rect.right;
      if (element === hero) {
        const style = window.getComputedStyle?.(element);
        left += parseFloat(style?.paddingLeft) || 0;
        right -= parseFloat(style?.paddingRight) || 0;
      }
      return rect.width > 0 && right - left > vw * 0.3 ? { left, right } : null;
    };
    const found = edges(document.querySelector('.site-header')) || edges(hero) || edges(document.querySelector('.section-top'));
    const left = clamp(found ? found.left : vw * 0.06, 0, vw * 0.45);
    const right = clamp(found ? found.right : vw * 0.94, vw * 0.55, vw);
    current.column = { left, right, narrow: Math.min(left, vw - right) < 40 };
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
      if (raw.text) view.text = readText(element) || undefined;
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
  // In view at some point during the stop's planned scroll (from now to
  // `dyFinal`), below the fixed header. Items the scroll carries past (a
  // section's header row on a tall stop) count too: they are seen on the way.
  const willShow = (current, element) => {
    if (!current.measurable) return true;
    const r = box(current, element);
    return r.w > 0 && r.h > 0 && r.y - current.dyFinal < current.vh * 0.92 && r.y + r.h > Math.min(90, current.vh * 0.1);
  };
  // When the planned scroll brings an item's top just inside the bottom edge:
  // its agent arrives then, so content is built as it slides in.
  // On a travelling Experience stage, an item off to the right is ready when
  // the planned scroll has carried it in far enough (`edge`: a share of the
  // view its left edge must pass; by default half the item, up to 30% of the view).
  function readyAt(current, element, edge = null) {
    if (!current.traj || !current.measurable) return 0;
    const b = box(current, element);
    const need = b.y + current.sy0 - current.vh * 0.97;
    let ready = current.traj.ys[0] >= need ? 0 : trajTime(current.traj, y => y >= need);
    // Inside a motion.js reveal still waiting (it fades in once its top is
    // 8% above the bottom edge, after a short stagger): arrive as it shows.
    const reveal = element.closest?.('[data-reveal="pending"]');
    if (reveal) {
      const top = reveal.getBoundingClientRect().top + current.sy0 - current.vh * 0.92 + 2;
      const shows = current.traj.ys[0] >= top ? 0 : trajTime(current.traj, y => y >= top);
      if (Number.isFinite(shows)) ready = Math.max(Number.isFinite(ready) ? ready : 0, shows + 380 * current.anim);
    }
    const xp = current.xp;
    if (xp && xp.track.contains(element)) {
      const line = edge ? current.vw * edge : current.vw - Math.min(b.w * 0.5, current.vw * 0.3);
      if (b.x > line) {
        // The track's position at a scroll position (it rests on each chapter
        // for part of the pinned stretch: experience.js's own map).
        const track = y => trackAt(xp.plan, clamp01((y - xp.top) / xp.distance));
        const p0 = track(current.sy0);
        let side = trajTime(current.traj, y => b.x - (track(y) - p0) * xp.shift <= line);
        if (!Number.isFinite(side)) side = (current.lead || 0) + current.budget;
        ready = Math.max(Number.isFinite(ready) ? ready : 0, side);
      }
    }
    return ready;
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

  // A rect clipped to the viewport.
  const clipView = (current, r) => {
    const x = Math.max(r.x, 0);
    const y = Math.max(r.y, 0);
    const right = Math.min(r.x + r.w, current.vw);
    const bottom = Math.min(r.y + r.h, current.vh);
    return right > x && bottom > y ? { x, y, w: right - x, h: bottom - y } : { x: clamp(r.x, 0, current.vw), y: clamp(r.y, 0, current.vh), w: 0, h: 0 };
  };

  // ---- the visible-target rule ----------------------------------------------
  // An agent only works on content a visitor could actually see: connected,
  // not inside [hidden] or [inert], not display:none or visibility:hidden,
  // with a real box, an opacity chain above OPACITY_MIN (our own pending
  // state and motion.js's pending reveals do not count), and not clipped
  // away by an overflow ancestor. `slide` content (chapters a pinned stage
  // carries in sideways) is not judged on visibility or clipping until its
  // agent sets off; `view` also requires part of it on screen. Everything is
  // read live (a handful of reads per job), so it is right wherever the
  // element is now.
  const ownPending = (current, node) => node.classList?.contains('agentic-target') || node.hasAttribute?.('data-reveal') || current.wasHidden.has(node);
  function perceivable(current, element, { slide = false, view = false } = {}) {
    if (!element?.isConnected) return false;
    if (element.closest?.('[hidden], [inert]')) return false;
    const read = node => window.getComputedStyle?.(node) || null;
    const style = read(element);
    if (!style) return true;
    if (!slide && (style.visibility === 'hidden' || style.visibility === 'collapse')) return false;
    let opacity = 1;
    for (let node = element; node && node !== root; node = node.parentElement) {
      const s = node === element ? style : read(node);
      if (!s) break;
      if (s.display === 'none') return false;
      if (ownPending(current, node)) continue;
      const value = parseFloat(s.opacity);
      if (Number.isFinite(value)) opacity *= value;
    }
    // A slide chapter fades in as it arrives (experience.css).
    if (opacity < OPACITY_MIN && !slide) return false;
    if (!current.measurable) return true;
    const r = element.getBoundingClientRect();
    if (!(r.width >= 1 && r.height >= 1)) return false;
    if (slide && !view) return true;
    let x0 = r.left;
    let y0 = r.top;
    let x1 = r.right;
    let y1 = r.bottom;
    for (let node = element.parentElement; node && node !== root && node !== document.body; node = node.parentElement) {
      const s = read(node);
      if (!s) break;
      const clipX = s.overflowX !== 'visible';
      const clipY = s.overflowY !== 'visible';
      if (clipX || clipY) {
        const c = node.getBoundingClientRect();
        if (clipX) { x0 = Math.max(x0, c.left); x1 = Math.min(x1, c.right); }
        if (clipY) { y0 = Math.max(y0, c.top); y1 = Math.min(y1, c.bottom); }
      }
      if (s.position === 'fixed') break;
    }
    if (view) {
      x0 = Math.max(x0, 0);
      y0 = Math.max(y0, 0);
      x1 = Math.min(x1, current.vw);
      y1 = Math.min(y1, current.vh);
    }
    const w = x1 - x0;
    const h = y1 - y0;
    if (!(w >= Math.min(4, r.width) && h >= Math.min(4, r.height))) return false;
    // A meaningful part of it: a quarter, or a few lines' worth of a big block.
    return w * h >= Math.min(r.width * r.height * 0.25, 1200);
  }
  // At plan time: everything but the viewport (the scroll brings it in).
  const plannable = (current, element, spec) => perceivable(current, element, { slide: Boolean(spec?.slide) && !spec?.shown });
  // When the agent sets off and when it arrives. On arrival the item must be
  // in view, or entering it (the planned scroll brings items to the bottom
  // edge as their agents arrive).
  function targetReady(current, job, phase) {
    const target = job.target;
    if (phase === 'start') return perceivable(current, target, { slide: Boolean(job.spec?.slide) });
    // A pasted ghost is drawn by the agent itself, as its chapter slides in.
    if (job.kind === 'paste') return perceivable(current, target, { slide: true });
    // Content the stage carries in sideways: some of it inside the stage and
    // the view (it may still be fading in as it arrives).
    if (job.spec?.slide) return perceivable(current, target, { slide: true, view: true });
    if (!perceivable(current, target)) return false;
    if (!current.measurable) return true;
    const r = target.getBoundingClientRect();
    return r.bottom > 0 && r.top < current.vh + 24 && r.right > 0 && r.left < current.vw;
  }

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
    if (current.kind === 'hero') {
      current.veil = make('div', 'agentic-veil', decoration);
      current.guideLayer = make('div', 'agentic-guides', decoration);
    }
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
  // A `when` stop only runs if its section matches it by the time it comes up.
  const stopActive = stopInfo => !stopInfo.when || Boolean(stopInfo.section.matches?.(stopInfo.when));
  const nextStop = () => (tour ? tour.stops.slice(tour.index + 1).find(stopActive) || null : null);
  // The hero keeps most of its crew on screen for About: agents whose role
  // About needs first, then the rest, up to the ride-along cap.
  // `first` (agents still busy when the hero hands over) ride along before
  // anyone else; narrow screens keep at most two idle agents out.
  function pickStayers(current, candidates, first = []) {
    const next = nextStop();
    if (!next) return new Set();
    const counts = CREWS[current.tier];
    const roles = new Set((next.jobs || []).flatMap(job => job.roles || [job.role]).map(role => resolveRole(role, counts)));
    const worked = candidates.filter(agent => agent.queue.length);
    const ranked = new Set([...first, ...worked.filter(agent => roles.has(agent.role)), ...worked.filter(agent => !roles.has(agent.role))]);
    return new Set([...ranked].slice(0, idleCap(current)));
  }
  const idleCap = current => (current.column?.narrow ? NARROW_IDLE : RIDE_ALONG[current.tier]);
  // Standby spots clear of the content column: two loose flocks in the side
  // margins, spread between 25% and 85% of the view height (even k left, odd
  // k right). Margins under 40 px (phones): at most two spots along the
  // bottom edge, above the dock. Each spot carries the horizontal band its
  // swarm must stay in (`lo`/`hi`) and how far the swarm may sway (`fx`/`fy`).
  function standby(current, k, n) {
    return () => {
      const { vw, vh } = current;
      const column = current.column || { left: vw * 0.06, right: vw * 0.94, narrow: vw * 0.06 < 40 };
      if (column.narrow) {
        const slot = k % NARROW_IDLE;
        return { x: vw * [0.2, 0.8, 0.5][slot % 3], y: vh - (slot === 2 ? 150 : 110), lo: 10, hi: vw - 10, fx: 0.4, fy: 0.35 };
      }
      const right = k % 2 === 1;
      const lo = right ? column.right + 8 : 10;
      const hi = Math.max(lo, right ? vw - 10 : column.left - 8);
      const per = Math.max(1, Math.ceil(n / 2));
      const jitter = ((k * 0.618 + 0.31) % 1) - 0.5;
      const row = Math.floor(k / 2) + 0.5 + jitter * 0.5;
      const half = (hi - lo) / 2;
      return { x: lo + half + jitter * half * 0.6, y: vh * (0.25 + (0.6 * row) / per), lo, hi, fx: Math.min(1, half / 110), fy: 1 };
    };
  }
  // A slow idle drift around an anchor, on the tour clock, so it carries on
  // seamlessly into the next run. Standby anchors keep the sway in their band.
  function drifting(current, agent, anchor) {
    return () => {
      const a = anchor();
      const p = swarm(a, current.t0 + current.now, agent, 1);
      if (a.lo === undefined) return p;
      return { x: clamp(a.x + (p.x - a.x) * a.fx, a.lo, a.hi), y: a.y + (p.y - a.y) * a.fy };
    };
  }
  function idleSeg(current, agent, at, anchor) {
    const point = drifting(current, agent, anchor);
    agent.segs.push({ t0: at, t1: at, kind: 'drift', point, anchor });
    agent.last = point;
    if (agent.role !== 'orchestrator') addEvent(current, at, () => agent.cursor.classList.add('is-idle'));
  }
  // Send a finished agent to a standby spot to drift until the next stop
  // adopts it. Idle agents hide their label; the orchestrator keeps talking.
  function rideAlong(current, agent, at, k, n) {
    const spot = standby(current, k, n);
    const arrive = at + clamp(travelMs(current, agent.last(), spot()), 480, 900);
    travelSeg(agent, at, arrive, drifting(current, agent, spot));
    idleSeg(current, agent, arrive, spot);
    if (agent.role === 'orchestrator') {
      const name = nextStop()?.name.toLowerCase() || 'next';
      addEvent(current, at, () => say(agent, `leading crew to ${name}`));
    } else {
      addEvent(current, at, () => { agent.cursor.classList.remove('is-working', 'is-idle'); say(agent, ''); });
    }
    return arrive;
  }
  // Carried cursors appear exactly where they were (still drifting if idle).
  // One caught away from a standby spot with nothing to do for a while goes
  // on to its spot (or slot `k` of `n`) instead of waiting over the content.
  function holdCarried(current, agent, k = 0, n = 1) {
    const c = agent.carry;
    // `parked`: when it is idling at a standby spot (so an agent with nothing
    // to do here stays there instead of crossing the page to another spot).
    agent.parked = null;
    if (c.anchor) { idleSeg(current, agent, 0, () => c.anchor); agent.parked = { at: 0 }; }
    else holdSeg(agent, 0, () => ({ x: c.x, y: c.y }));
    const arrive = 380 * current.scale;
    const waits = !agent.queue.length || agent.queue[0].start >= arrive + 250 * current.anim;
    if (!c.anchor && agent.role !== 'orchestrator' && waits) {
      const spot = c.goal ? () => c.goal : standby(current, k, n);
      travelSeg(agent, 0, arrive, drifting(current, agent, spot));
      idleSeg(current, agent, arrive, spot);
      agent.parked = { at: arrive };
    }
    addEvent(current, 0, () => {
      agent.cursor.classList.add('is-in', 'is-carried');
      if (agent.role !== 'orchestrator') startWorking(current, agent);
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
    job.spec = spec;
    const s = current.scale;
    const kind = current.kind;
    const r = () => box(current, target);
    const text = () => textBox(current, target);
    const raw = (target.textContent || '').trim();
    const chars = Math.max(1, raw.length);
    const build = kind === 'build';
    // Tour stops type at >= 35 ms per character, up to 1.6 s per job.
    const charsMs = build ? clamp(chars * Math.max(35, spec.charMs || 35), 420, 1600) : Math.min(760, Math.max(300, chars * (spec.charMs || 40)));
    // Now and then a word is mistyped and fixed: the wrong key shows after
    // the caret, then a backspace takes it away (about four keystrokes long).
    let typo = null;
    if (build && spec.kind === 'type' && !spec.pooled && window.getComputedStyle) {
      const found = typoFor(raw, { transform: window.getComputedStyle(target).textTransform });
      if (found && found.at > 0 && found.at < chars - 1) typo = { ...found, ms: Math.max(320, (charsMs / chars) * 4.5) };
    }
    const typeMs = charsMs + (typo ? typo.ms : 0);
    // `place`: pop the item, write its sub line, then cascade its kids. The
    // phases are fractions of the job's work so compression keeps them.
    const parts = spec.parts || {};
    const pops = parts.pops || [];
    const sub = parts.sub || null;
    const kids = parts.kids || [];
    let phases = null;
    if (job.kind === 'place') {
      // A soft ~650 ms pop, the sub line written, then ~100 ms per tag.
      const popMs = 650;
      const subStart = popMs * 0.6;
      const subMs = sub ? clamp((sub.textContent || '').trim().length * 7, 550, 1300) : 0;
      const kidsStart = (sub ? subStart + subMs : popMs * 0.7) + 80;
      const kidTimes = kids.map((_, i) => kidsStart + (i < 8 ? i * 100 : 8 * 100 + (i - 8) * 45));
      const end = Math.max(popMs + 260, sub ? subStart + subMs + 140 : 0, kids.length ? kidTimes[kidTimes.length - 1] + 420 : 0);
      phases = { end, pop: popMs / end, subStart: subStart / end, subEnd: (subStart + subMs) / end, kids: kidTimes.map(at => at / end) };
    }
    const workMs = {
      place: phases ? phases.end : 650,
      frame: build ? 700 : kind === 'pass' ? 280 : 430,
      reveal: build ? Math.max(spec.work || 0, 760) : spec.work || 380,
      type: typeMs + (build ? 260 : 200),
      wipe: build ? clamp(chars * 9, 800, 1600) : 580,
      orbit: build ? 1000 : 1050,
      review: build ? 700 : kind === 'pass' ? 280 : 440,
      caret: build ? 520 : 300,
      copy: 420,
      paste: spec.work || 900,
      pin: 620,
      pick: spec.work || 1500,
      resolve: 700,
    }[job.kind];
    // Tour stops keep near-real durations; only budgets scale with `weight`.
    const anim = build ? current.anim : s;
    job.baseWork = workMs * anim;
    job.baseType = typeMs * anim;
    job.work = job.baseWork;
    job.typeMs = job.baseType;
    job.chars = chars;
    // A job dropped on the way (its target was not there to see) keeps its
    // cursor where it was, with no label: entry, path and exit all hold.
    const held = () => job.voidAt || { x: current.vw * 0.5, y: current.vh * 0.8 };
    // Paste ghosts: from the item before (`from`) to the item, both as they are now.
    const source = () => {
      if (spec.from === 'prev') return target.previousElementSibling;
      return spec.from ? document.querySelector(spec.from) : null;
    };
    const ghostRect = p => {
      const to = box(current, target);
      const src = source();
      const s0 = src ? box(current, src) : null;
      const from = s0 && s0.w > 0 ? s0 : { x: to.x - Math.min(to.w, current.vw * 0.4), y: to.y, w: to.w, h: to.h };
      const e = easeInOut(clamp01(p));
      return { x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e, w: from.w + (to.w - from.w) * e, h: from.h + (to.h - from.h) * e };
    };
    // Where a ghost or outline is held: inside the view, near its top left.
    const grip = rect => ({ x: clamp(rect.x + 22, 12, current.vw - 60), y: clamp(rect.y + 34, 118, current.vh - 90) });
    // The pin's note reads to its right: keep room for it.
    const pinPoint = () => {
      const v = visible(current, target);
      return { x: clamp(v.x + v.w - 26, 16, current.vw - 170), y: clamp(v.y + 18, 110, current.vh - 90) };
    };
    const entryOf = () => {
      const b = r();
      if (job.kind === 'frame' || job.kind === 'review') { const v = visible(current, target); return { x: v.x + 2, y: v.y + 2 }; }
      if (job.kind === 'type') { const t = text(); const l = t.lines?.[0] || t; return { x: l.x, y: l.y + l.h * 0.92 }; }
      if (job.kind === 'wipe') { const t = text(); const l = t.lines?.[0] || t; return { x: l.x, y: l.y + l.h * 0.5 }; }
      if (job.kind === 'orbit') return { x: b.x + b.w * 0.5 + b.w * 0.42, y: b.y + b.h * 0.42 };
      if (job.kind === 'caret') { const l = text().last || text(); return { x: l.x + l.w + 6, y: l.y + l.h * 0.8 }; }
      if (job.kind === 'place') return { x: b.x + Math.min(18, b.w * 0.25), y: b.y + Math.min(b.h * 0.4, 34) };
      if (job.kind === 'copy') return grip(clipView(current, b));
      if (job.kind === 'paste') return grip(ghostRect(0));
      if (job.kind === 'pin' || job.kind === 'resolve') return pinPoint();
      if (job.kind === 'pick') return { x: b.x + Math.min(26, b.w * 0.3), y: b.y + b.h * 0.62 };
      return { x: b.x + Math.min(18, b.w * 0.25), y: b.y + Math.min(b.h * 0.58, 120) };
    };
    job.entry = () => (job.void ? held() : entryOf());
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
      if (job.void) return held();
      const b = r();
      if (job.kind === 'copy') {
        // Trace the outline's top edge, then press ⌘C.
        const v = clipView(current, b);
        const start = grip(v);
        return { x: start.x + Math.min(v.w * 0.5, 260) * easeInOut(clamp01(p / 0.7)), y: start.y };
      }
      if (job.kind === 'paste') return grip(ghostRect(p));
      if (job.kind === 'pin') { const at = pinPoint(); return { x: at.x - 6 * (1 - easeOut(p)), y: at.y - 10 * (1 - easeOut(p)) }; }
      if (job.kind === 'resolve') { const at = pinPoint(); return { x: at.x + 4 * Math.sin(p * Math.PI), y: at.y + 3 * Math.sin(p * Math.PI) }; }
      if (job.kind === 'frame' || job.kind === 'review') {
        const v = visible(current, target);
        const e = job.kind === 'frame' ? easeInOut(p) : easeOut(p);
        return { x: v.x + 2 + (v.w - 4) * e, y: v.y + 2 + (v.h - 4) * e };
      }
      if (job.kind === 'type' || job.kind === 'wipe') {
        // Ride the caret while working; plan with the first/last line ends.
        const t = text();
        const first = t.lines?.[0] || t;
        const last = t.last || t;
        const point = p > 0 && p < 1 && job.caretPoint ? job.caretPoint : p >= 1 ? { x: last.x + last.w, y: last.y, h: last.h } : { x: first.x, y: first.y, h: first.h };
        return { x: point.x + 4, y: point.y + point.h * (job.kind === 'type' ? 0.92 : 0.5) + (job.kind === 'type' ? 6 : 0) };
      }
      if (job.kind === 'orbit') {
        const angle = easeInOut(p) * Math.PI * 2;
        return { x: b.x + b.w * 0.5 + Math.cos(angle) * b.w * 0.42, y: b.y + b.h * 0.42 + Math.sin(angle) * b.h * 0.3 };
      }
      if (job.kind === 'caret') { const start = job.entry(); return { x: start.x + 10 * easeOut(p), y: start.y + 6 * easeOut(p) }; }
      // A short press on the control, then the cursor rests on it.
      if (job.kind === 'pick') { const start = job.entry(); const dip = Math.sin(clamp01((p - PICK.at + 0.06) / 0.12) * Math.PI); return { x: start.x + dip, y: start.y + 2.5 * dip }; }
      if (job.kind === 'place') return placeAt(p);
      const start = job.entry();
      return { x: start.x + Math.min(b.w * 0.42, 360) * easeInOut(p), y: start.y + Math.min(b.h * 0.06, 24) * easeInOut(p) };
    };
    job.exit = () => job.cursorAt(1);

    const color = () => spec.color || ROLES[job.agent.role].color;
    const frame = variant => {
      // The hero's frames carry no size chip: it would sit over its text (the
      // orbit keeps its coordinate, which sits over the art).
      const element = make('div', `agentic-frame ${variant}${kind === 'hero' && !variant.includes('is-coord') ? ' no-size' : ''}`, current.layer);
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

    // A small key tag (⌘C / ⌘V) or comment bubble, held in the layer.
    const tag = (text, className) => {
      const element = make('div', `agentic-tag ${className || ''}`, current.layer);
      element.style.setProperty('--agent-color', color());
      element.textContent = text;
      job.ui.push(element);
      return element;
    };
    job.begin = () => {
      job.begun = true;
      const k = job.kind;
      // Art waits for its image (IMAGE_WAIT at most): the agent never places
      // an empty box. Its frame and the reveal start once the image is in.
      job.loading = !job.void && k === 'reveal' ? job.reveals.flatMap(element => (element.tagName === 'IMG' ? [element] : [...element.querySelectorAll?.('img') || []])).filter(image => image.complete === false) : [];
      // The item starts to appear: its wireframe skeleton fades.
      if (!job.loading.length) job.onPlace?.();
      if (job.void) return;
      if (k === 'copy') {
        job.frame = frame('is-review is-copy');
        job.keyTag = tag('⌘C', 'is-key');
        version = -1;
        job.update(job.arrive);
        return;
      }
      if (k === 'paste') {
        job.frame = frame('is-review is-ghost');
        job.frame.classList.add('is-set');
        job.keyTag = tag('⌘V', 'is-key');
        version = -1;
        job.update(job.arrive);
        return;
      }
      if (k === 'pin') {
        const pin = make('div', 'agentic-pin', current.layer);
        pin.style.setProperty('--agent-color', color());
        make('i', 'agentic-pin-dot', pin);
        make('span', 'agentic-pin-note', pin).textContent = spec.note || 'check';
        job.pin = pin;
        // Every pin follows its item each frame until it is gone (updatePins).
        current.pins.push({ node: pin, job, at: pinPoint });
        placePin(pin, pinPoint());
        version = -1;
        job.update(job.arrive);
        return;
      }
      if (k === 'pick') {
        job.frame = frame('is-review');
        job.keyTag = tag('click', 'is-key');
        version = -1;
        job.update(job.arrive);
        return;
      }
      if (k === 'resolve') {
        job.pin = (job.afterJob?.kind === 'pin' && job.afterJob.pin) || null;
        if (!job.pin) { job.frame = frame('is-review'); }
        version = -1;
        job.update(job.arrive);
        return;
      }
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
      const shown = job.reveals;
      const reveal = ms => {
        shown.forEach((element, index) => {
          element.style.setProperty('--agentic-d', `${realMs(Math.max(60, ms * (shown.length > 1 ? 0.7 : 1)))}ms`);
          if (shown.length > 1) element.style.transitionDelay = `${realMs(index * (ms * 0.3) / (shown.length - 1))}ms`;
          element.dataset.buildState = 'placing';
        });
      };
      if (job.loading.length) {
        job.frame.style.opacity = '0';
        job.waitUntil = current.now + IMAGE_WAIT * current.anim;
        // Once the images are in (or the wait is over): the time left.
        job.startReveal = () => {
          if (job.revealed || job.done || job.void || run !== current) return;
          job.revealed = true;
          job.frame.style.removeProperty('opacity');
          job.onPlace?.();
          reveal(Math.max(60, job.end - current.now));
        };
        let left = job.loading.length;
        const loaded = () => { if (--left <= 0) job.startReveal(); };
        job.loading.forEach(image => {
          image.addEventListener('load', loaded, { once: true });
          image.addEventListener('error', loaded, { once: true });
        });
      } else if (k === 'reveal') reveal(job.work);
      else shown.forEach(element => { element.dataset.buildState = 'typing'; });
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

    // Characters typed after `elapsed` ms, and whether the wrong key shows.
    function typeStep(elapsed) {
      const typoMs = typo ? typo.ms * (job.typeMs / typeMs) : 0;
      const charTime = Math.max(1, job.typeMs - typoMs) / job.chars;
      let at = elapsed;
      if (typo) {
        const from = typo.at * charTime;
        if (elapsed >= from && elapsed < from + typoMs) return { step: typo.at, wrong: (elapsed - from) / typoMs < 0.6 };
        if (elapsed >= from + typoMs) at = elapsed - typoMs;
      }
      return { step: Math.min(job.chars, Math.max(0, Math.floor(at / charTime))), wrong: false };
    }
    // The wrong key, set in the target's own type right after the caret.
    function showTypo(point) {
      if (!point) { if (job.typoEl) job.typoEl.hidden = true; return; }
      if (!job.typoEl) {
        job.typoEl = make('span', 'agentic-typo', current.layer);
        job.ui.push(job.typoEl);
        const style = window.getComputedStyle?.(target);
        if (style) {
          ['fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'letterSpacing', 'color'].forEach(name => { job.typoEl.style[name] = style[name]; });
          const size = parseFloat(style.fontSize) || 16;
          job.typoBox = { w: size * 0.56 };
        } else job.typoBox = { w: 9 };
        job.typoEl.textContent = typo.ch;
      }
      job.typoEl.hidden = false;
      job.typoEl.style.lineHeight = `${point.h}px`;
      job.typoEl.style.translate = `${point.x.toFixed(1)}px ${point.y.toFixed(1)}px`;
    }

    function placeCaret(point) {
      if (!job.caret || !point) return;
      job.caret.style.translate = `${point.x}px ${point.y + point.h * 0.08}px`;
      job.caret.style.height = `${point.h * 0.84}px`;
    }

    job.update = now => {
      if (job.void) return;
      if (job.startReveal && now >= job.waitUntil) job.startReveal();
      // `frameMs` (per stop): tinted placement frames step aside early.
      if (current.frameMs && job.frame && !job.frameOut && (job.kind === 'place' || job.kind === 'reveal') && now - job.arrive >= current.frameMs) {
        job.frameOut = true;
        job.frame.classList.add('is-out');
      }
      const p = clamp01((now - job.arrive) / Math.max(1, job.work));
      const geometryChanged = version !== current.version;
      version = current.version;
      if (job.kind === 'copy' || job.kind === 'paste') {
        const rect = job.kind === 'copy' ? clipView(current, r()) : ghostRect(Math.min(1, p / 0.86));
        if (geometryChanged || job.kind === 'paste') place(job.frame, rect);
        if (job.kind === 'copy' && p > 0.05 && !job.frame.classList.contains('is-set')) job.frame.classList.add('is-set');
        const pressed = job.kind === 'copy' ? p >= 0.55 : p >= 0.86;
        const at = grip(rect);
        job.keyTag.style.translate = `${Math.round(at.x + 16)}px ${Math.round(at.y - 30)}px`;
        if (pressed !== job.keyTag.classList.contains('is-on')) job.keyTag.classList.toggle('is-on', pressed);
        if (job.kind === 'paste' && pressed && !job.dropped) { job.dropped = true; job.frame.classList.add('is-dropped'); }
        return;
      }
      if (job.kind === 'pick') {
        const v = visible(current, target);
        if (geometryChanged) {
          place(job.frame, v);
          const at = job.entry();
          job.keyTag.style.translate = `${Math.round(at.x + 16)}px ${Math.round(at.y - 34)}px`;
        }
        if (p > 0.05 && !job.frame.classList.contains('is-set')) job.frame.classList.add('is-set');
        if (p >= PICK.at && !job.pressed) {
          job.pressed = true;
          job.keyTag.classList.add('is-on');
          // Only open the project that is already selected, so a Replay never
          // overwrites a visitor's own pick (or fires a selection announcement).
          if (target.getAttribute('aria-current') === 'true') press(target);
        }
        return;
      }
      if (job.kind === 'pin' || job.kind === 'resolve') {
        if (job.kind === 'pin' && p > 0.35 && !job.pin.classList.contains('is-on')) job.pin.classList.add('is-on');
        if (job.kind === 'resolve' && job.pin && p > 0.45 && !job.pin.classList.contains('is-resolved')) job.pin.classList.add('is-resolved');
        if (job.kind === 'resolve' && !job.pin && geometryChanged) place(job.frame, visible(current, target));
        if (job.kind === 'resolve' && !job.pin && p > 0.05) job.frame.classList.add('is-set');
        return;
      }
      const b = job.kind === 'frame' || job.kind === 'review' ? visible(current, target) : r();
      if (geometryChanged) {
        if (job.kind === 'orbit') {
          place(job.frame, { x: b.x + b.w * 0.08, y: b.y + b.h * 0.12, w: b.w * 0.84, h: b.h * 0.6 });
          job.frame.querySelector('b').textContent = `x ${Math.round(b.x + b.w / 2)} · y ${Math.round(b.y + b.h * 0.42)}`;
        } else if (TEXT_KINDS.has(job.kind)) {
          const t = text();
          place(job.frame, { x: t.x - 4, y: t.y - 3, w: t.w + 8, h: t.h + 6 });
        } else {
          place(job.frame, b);
          job.frame.querySelector('b').textContent = sizeLabel(b);
        }
      }
      if (job.kind === 'frame') {
        const e = easeInOut(p);
        job.frame.style.scale = `${Math.max(e, 0.001)} ${Math.max(e, 0.001)}`;
        if (p >= 1 && !job.frame.classList.contains('is-set')) job.frame.classList.add('is-set');
      } else if (job.kind === 'review' && p > 0.05 && !job.frame.classList.contains('is-set')) {
        job.frame.classList.add('is-set');
        if (spec.size) job.frame.classList.add('has-size');
      } else if (job.kind === 'type') {
        const progress = clamp01((now - job.arrive) / Math.max(1, job.typeMs));
        const { step, wrong } = typeStep(now - job.arrive);
        job.typeProgress = progress;
        const key = wrong ? -1 - step : step;
        if (key !== lastStep || geometryChanged) {
          lastStep = key;
          job.caretPoint = writeClip(step / job.chars);
          showTypo(wrong ? job.caretPoint : null);
          placeCaret(wrong && job.typoBox ? { ...job.caretPoint, x: job.caretPoint.x + job.typoBox.w } : job.caretPoint);
        }
        if (progress >= 1 && !job.caret.classList.contains('is-idle')) job.caret.classList.add('is-idle');
      } else if (job.kind === 'wipe') {
        job.caretPoint = writeClip(easeInOut(p));
        placeCaret(job.caretPoint);
        if (p >= 1 && job.caret && !job.caret.classList.contains('is-idle')) job.caret.classList.add('is-idle');
      } else if (job.kind === 'place') {
        if (sub && p >= phases.subStart) {
          const q = clamp01((p - phases.subStart) / Math.max(1e-6, phases.subEnd - phases.subStart));
          job.caretPoint = writeClipOn(sub, easeInOut(q));
          if (sub.dataset.buildState !== 'typing') { sub.dataset.buildState = 'typing'; job.caret.style.removeProperty('opacity'); }
          placeCaret(job.caretPoint);
          if (q >= 1 && !job.caret.classList.contains('is-idle')) job.caret.classList.add('is-idle');
        }
        while (job.kidIndex < kids.length && p >= phases.kids[job.kidIndex]) {
          const kid = kids[job.kidIndex++];
          kid.style.setProperty('--agentic-d', `${realMs(420)}ms`);
          kid.dataset.buildState = 'placing';
        }
      } else if (job.kind === 'caret' && geometryChanged) {
        const l = text().last || text();
        placeCaret({ x: l.x + l.w + 3, y: l.y, h: l.h });
      }
    };

    // The agent is late for content already on screen (or will be): show it
    // now and keep only a decorative pass over it.
    job.downgrade = () => {
      if (job.late) return;
      job.late = true;
      job.onPlace?.();
      job.reveals.forEach(element => {
        element.style.setProperty('--agentic-d', `${realMs(360)}ms`);
        element.style.removeProperty('transition-delay');
        if (element.dataset.buildState === 'pending') element.dataset.buildState = 'placing';
      });
      job.reveals = [];
      job.kind = DEMOTE[job.kind] || job.kind;
      if (run === current) job.target.dataset.agenticJob = job.kind;
    };

    // Handed to a rescuing agent: the rescue job takes the content (and the
    // skeleton); this one keeps only a decorative pass when its agent arrives.
    job.release = () => {
      job.late = true;
      job.handed = true;
      job.reveals = [];
      job.onPlace = null;
      job.kind = DEMOTE[job.kind] || job.kind;
    };

    job.finish = () => {
      job.done = true;
      job.onPlace?.();
      job.reveals.forEach(element => cleanTarget(element));
      if (current.kind === 'pass') target.dataset.buildState = 'tracing';
      job.ui.forEach(element => { if (element !== job.frame && element !== job.keyTag) element.remove(); });
      job.keyTag?.classList.add('is-out');
      if (job.kind !== 'frame') job.frame?.classList.add('is-out');
      if (job.kind === 'resolve') job.pin?.classList.add('is-out');
      // A pasted copy (or a drawn chapter frame) leaves placeholder bars where
      // its editors will write.
      if (spec.holes && !job.void) makeHoles(current, job);
    };
    return job;
  }

  // ---- placeholders ---------------------------------------------------------
  // Grey bars over the hidden content inside `job.target` that later jobs will
  // write: one per rendered text line (a few at most), one block otherwise.
  // Each bar follows its element (read live inside a pinned stage) and fades
  // as that element's job starts.
  function makeHoles(current, job) {
    const owners = [...current.jobs, ...current.pool].filter(other => other !== job && !other.begun && !other.late && !other.void && other.reveals.length && job.target.contains(other.target));
    owners.forEach(other => {
      const top = other.reveals.filter(element => !other.reveals.some(parent => parent !== element && parent.contains(element)));
      const bars = [];
      top.forEach(element => {
        const text = TEXT_KINDS.has(other.kind);
        const t = text ? textBox(current, element) : box(current, element);
        if (!(t.w > 0 && t.h > 0)) return;
        const lines = text && t.lines && t.lines.length <= WIRE.lines ? t.lines.length : 1;
        for (let line = 0; line < lines; line++) {
          const node = make('div', `agentic-skeleton agentic-hole${current.light ? ' is-light' : ''}`, current.layer);
          bars.push({ element, text, line: lines > 1 ? line : -1, node });
        }
      });
      if (!bars.length) return;
      current.holes.push(...bars);
      const before = other.onPlace;
      other.onPlace = () => {
        before?.();
        bars.forEach(bar => { bar.node.style.transitionDuration = `${realMs(WIRE.skeleton * current.anim)}ms`; bar.node.classList.add('is-out'); bar.done = true; });
      };
    });
    current.holesVersion = -1;
    updateHoles(current);
  }
  function updateHoles(current) {
    if (!current.holes.length || current.holesVersion === current.version) return;
    current.holesVersion = current.version;
    current.holes.forEach(bar => {
      if (bar.done) return;
      const t = bar.text ? textBox(current, bar.element) : box(current, bar.element);
      const b = bar.line >= 0 && t.lines ? t.lines[bar.line] : t;
      bar.node.style.translate = `${b.x.toFixed(1)}px ${b.y.toFixed(1)}px`;
      bar.node.style.width = `${Math.max(1, b.w).toFixed(1)}px`;
      bar.node.style.height = `${Math.max(1, b.h).toFixed(1)}px`;
    });
  }

  // ---- QA pins ----------------------------------------------------------------
  // A pin stays on its item while the page moves (not only while its own or
  // its resolver's job runs). One whose resolver was dropped from the plan,
  // or voided, fades once it is up, so no note is left frozen on screen.
  function placePin(node, at) {
    node.style.translate = `${Math.round(at.x + 8)}px ${Math.round(at.y - 22)}px`;
  }
  const liveResolver = (current, pin) => current.jobs.find(job => job.kind === 'resolve' && job.afterJob === pin && !job.void) || null;
  function updatePins(current, t) {
    if (!current.pins.length) return;
    const moved = current.pinsVersion !== current.version;
    current.pinsVersion = current.version;
    current.pins.forEach(entry => {
      // Still placed while it fades (`.agentic-pin.is-out`: 0.5 s delay + 0.4 s).
      if (entry.out !== undefined && t - entry.out > 1000) return;
      if (moved) placePin(entry.node, entry.at());
      if (entry.out !== undefined) return;
      if (!entry.node.classList.contains('is-out') && t >= entry.job.end && !liveResolver(current, entry.job)) entry.node.classList.add('is-out');
      if (entry.node.classList.contains('is-out')) entry.out = t;
    });
  }

  // ---- planning -----------------------------------------------------------
  function travelMs(current, from, to) {
    const d = distance(from, to);
    if (current.kind === 'pass') return clamp(230 + d * 0.3, 200, 260) * current.scale;
    // Eased, never hurried: at least ~450 ms per move.
    if (current.kind === 'build') return clamp(450 + d * 0.4, 450, 900) * current.anim;
    return clamp(260 + d * 0.3, 260, 560) * current.scale;
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
      // Jobs may bring their own travel time (the paint agent hurries).
      const travel = (job.travelFrom ? job.travelFrom(position) : travelMs(current, position, entry)) * factor;
      // A rescue at the head of a queue leaves at once (no start stagger).
      if (index === 0 && job.rescue) t = Math.min(t, 40 * current.scale);
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
    agent.factor = 1;
    let free = simulate(current, agent, firstStart, from, factor);
    if (free > deadline) {
      factor = Math.max(0.8, (deadline - firstStart - gaps()) / Math.max(1, free - firstStart - gaps()));
      free = simulate(current, agent, firstStart, from, factor);
      agent.factor = factor;
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
    agent.factor = factor;
    return free;
  }

  // Shared per-job events: dispatch line, label, begin, complete, frame fade.
  function scheduleQueue(current, orchestrator, agent, lineEvery) {
    const s = current.scale;
    const checked = current.kind === 'build';
    agent.queue.forEach((job, jobIndex) => {
      travelSeg(agent, job.start, job.arrive, job.entry);
      workSeg(agent, job);
      // Copy and paste agents come over unlabelled: their label shows only
      // while they outline, drag and drop.
      const quiet = QUIET.has(job.kind);
      const label = () => {
        agent.cursor.classList.remove('is-idle');
        agent.cursor.classList.add('is-working');
        agent.cursor.agenticTarget = job.target;
        agent.job = job;
        say(agent, job.act);
      };
      addEvent(current, job.start, now => {
        // The visible-target rule, again as the agent sets off.
        if (checked && !targetReady(current, job, 'start')) { voidJob(current, job, agent); return; }
        if (orchestrator && (lineEvery || jobIndex === 0)) dispatchLine(current, orchestrator, agent, job, now);
        startWorking(current, agent);
        if (quiet) agent.cursor.classList.remove('is-idle');
        else label();
      });
      addEvent(current, job.arrive, now => {
        if (job.void) return;
        // Not there to see after all (scrolled past, clipped, hidden): show it
        // and move on without a label.
        if (checked && !targetReady(current, job, 'arrive')) { voidJob(current, job, agent); return; }
        if (quiet) label();
        handoffLine(current, job, agent, now);
        job.begin(now);
        current.active.add(job);
      });
      addEvent(current, job.end, () => {
        completeJob(current, job);
        if (quiet && agent.job === job) { agent.cursor.classList.remove('is-working'); agent.cursor.agenticTarget = null; say(agent, ''); }
      });
      if (job.kind === 'frame') addEvent(current, job.end + (current.kind === 'build' ? 520 : 620) * s, () => job.frame?.classList.add('is-out'));
    });
  }

  // A job whose target a visitor could not see: its content (if any) is shown
  // at once, and its agent stays where it is, with no label, until its next
  // job. Counted with the tour's instant reveals.
  function voidJob(current, job, agent) {
    if (job.void) return;
    const point = agent?.position || segPoint(agent, current.now, current);
    job.voidAt = { x: point.x, y: point.y };
    const hid = job.reveals.length > 0;
    job.downgrade?.();
    job.void = true;
    if (hid && tour) { tour.late++; tour.instant++; }
    current.voided = (current.voided || 0) + 1;
    current.guarded.delete(job);
    // Jobs that waited for it get no extra grace from it any more.
    current.jobs.forEach(other => { if (other.afterJob === job) other.graceUntil = undefined; });
    // Its label goes (the agent is not on to anything else yet).
    if (agent?.cursor && (!agent.job || agent.job === job || agent.job.done || agent.job.void)) {
      agent.cursor.classList.remove('is-working');
      agent.cursor.agenticTarget = null;
      agent.job = null;
      say(agent, '');
    }
  }

  // Work passing between agents (a pasted copy to its editor, a QA pin to
  // whoever resolves it): a thin line from one cursor to the other, once per hand-off.
  // Drawn as the receiving agent arrives, and only when both cursors are on
  // screen and close together (HANDOFF.reach of the view width at most).
  function handoffLine(current, job, agent, now) {
    const from = job.afterJob;
    if (!from?.agent || from.agent === agent || from.void || (from.lines || 0) >= 2) return;
    const a = from.agent.position;
    const b = agent.position;
    const inside = p => p && p.x >= 0 && p.y >= 0 && p.x <= current.vw && p.y <= current.vh;
    if (!inside(a) || !inside(b) || distance(a, b) > current.vw * HANDOFF.reach) return;
    from.lines = (from.lines || 0) + 1;
    drawLine(current, a, b, ROLES[from.agent.role].color, now, 'is-handoff', HANDOFF.ms);
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
    addEvent(current, 0, () => { orchestrator.cursor.classList.add('is-in', 'is-working'); if (!current.intro) say(orchestrator, 'planning hero'); });

    // After the intro, each item is built once the paint wipe has passed it
    // (`readyAt`, in this plan's time: the intro shifts it by its lead).
    if (current.intro && current.measurable) {
      const u = introUnit(current);
      current.jobs.forEach(job => {
        const b = box(current, job.target);
        if (!(b.w > 0 && b.h > 0)) return;
        const e = clamp01((b.x + 12) / (current.vw + 24));
        job.readyAt = Math.max(0, (INTRO.paint + (INTRO.paintEnd - INTRO.paint) * easeInverse(e) + 60) * u - current.intro);
      });
    }

    // One dispatch at a time: the eye can follow each agent leaving. After
    // the intro the crew is already out, so the first jobs leave at once.
    const dispatchGap = (current.intro ? 60 : 85) * s;
    const ordered = subagents.filter(agent => agent.queue.length).map(agent => {
      agent.queue.sort((a, b) => a.wave - b.wave);
      const roleIndex = byRole.get(agent.role).indexOf(agent);
      const popAt = (40 + agent.index * 20) * s;
      const wave = agent.queue[0].wave;
      agent.natural = Math.max(current.intro ? 0 : popAt + 400 * s, wave * s + (wave || !current.intro ? roleIndex * 70 * s : 0));
      return agent;
    }).sort((a, b) => a.natural - b.natural || (b.role === 'type') - (a.role === 'type'));
    let previous = -Infinity;
    ordered.forEach(agent => { agent.firstStart = Math.max(agent.natural, previous + dispatchGap); previous = agent.firstStart; });

    const builderDeadline = 2750 * s;
    const reviewDeadline = 3750 * s;
    const onward = Boolean(nextStop());
    const narrow = Boolean(current.column?.narrow);
    // Agents dispatched late wait in a side margin (narrow screens: two along
    // the bottom edge, the rest at the dock) instead of over the headline.
    const queuedList = ordered.filter(agent => agent.firstStart > 1150 * s);
    const worked = [];
    const docked = [];
    subagents.forEach((agent, index) => {
      const popAt = (40 + index * 20) * s;
      const angle = index * 2.39996;
      const radius = 30 + 15 * Math.sqrt(index + 1);
      const ring = () => { const c = spawn(); return { x: c.x + Math.cos(angle) * radius, y: c.y + Math.sin(angle) * radius * 0.8 }; };
      agent.ring = ring;
      const k = queuedList.indexOf(agent);
      let firstStart = agent.firstStart;
      let from;
      if (k >= NARROW_IDLE && narrow) {
        // Stays in the dock until shortly before its first job.
        agent.held = true;
        firstStart = Math.max(firstStart, 1160 * s);
        holdSeg(agent, 0, () => dotPoint(current, agent));
        from = dotPoint(current, agent);
        addEvent(current, Math.max(popAt, firstStart - 320 * s), () => agent.cursor.classList.add('is-in'));
      } else {
        addEvent(current, popAt, () => agent.cursor.classList.add('is-in'));
        // After the intro the crew is already out: start where the intro left it.
        holdSeg(agent, 0, current.intro ? ring : spawn);
        if (!current.intro) travelSeg(agent, popAt, popAt + 380 * s, ring);
        from = ring();
        if (!agent.queue.length) {
          agent.dockAt = (1200 + index * 30) * s;
          travelSeg(agent, agent.dockAt - 420 * s, agent.dockAt, () => dotPoint(current, agent));
          docked.push(agent);
          return;
        }
        if (k >= 0) {
          const slot = standby(current, k, queuedList.length);
          travelSeg(agent, 780 * s, 1150 * s, drifting(current, agent, slot));
          idleSeg(current, agent, 1150 * s, slot);
          from = slot();
          firstStart = Math.max(firstStart, 1160 * s);
        }
      }
      const mustFinish = agent.queue.some(job => HIDES.has(job.kind));
      fitQueue(current, agent, firstStart, from, mustFinish ? builderDeadline : reviewDeadline);
      worked.push(agent);
    });

    // On the tour the hero hands over as soon as its builder jobs (the ones
    // that hide content) are done, and About's scroll starts from rest. Review
    // work still running then is cut short, later reviews are dropped, and
    // the agents still out ride along instead of docking.
    const lastEnd = agent => (agent.queue.length ? agent.queue[agent.queue.length - 1].end : 0);
    const builders = current.jobs.filter(job => HIDES.has(job.kind));
    const handover = onward
      ? Math.min(current.total, Math.max(orchArrive + 400 * s, ...(builders.length ? builders : current.jobs).map(job => job.end)) + 30 * s)
      : Infinity;
    const trim = (agent, cutoff) => {
      while (agent.queue.length && OPTIONAL.has(agent.queue[agent.queue.length - 1].kind) && agent.queue[agent.queue.length - 1].start + 200 * s > cutoff) {
        current.jobs.splice(current.jobs.indexOf(agent.queue.pop()), 1);
      }
      const job = agent.queue[agent.queue.length - 1];
      if (job && OPTIONAL.has(job.kind) && job.end > cutoff) {
        // Already dispatched: a quicker pass that ends on time.
        job.arrive = Math.min(job.arrive, job.start + (cutoff - job.start) * 0.6);
        job.end = cutoff;
        job.work = job.end - job.arrive;
      }
    };
    if (onward) worked.forEach(agent => trim(agent, handover - 30 * s));
    // Agents that could not reach the dock before the handover ride along first.
    const late = onward ? worked.filter(agent => agent.queue.length && lastEnd(agent) + 340 * s > handover).sort((a, b) => lastEnd(b) - lastEnd(a)) : [];
    const stayers = pickStayers(current, worked, late);
    const stayList = [...stayers];
    if (onward) worked.forEach(agent => { if (!stayers.has(agent)) trim(agent, handover - 380 * s); });
    let latestDock = orchArrive;
    docked.forEach(agent => {
      addEvent(current, agent.dockAt, () => dockAgent(current, agent));
      latestDock = Math.max(latestDock, agent.dockAt);
    });
    worked.forEach(agent => {
      if (agent.queue.length) scheduleQueue(current, orchestrator, agent, false);
      const done = lastEnd(agent) || Math.max(agent.firstStart, 1160 * s);
      const free = done + current.jobGap;
      if (stayers.has(agent)) {
        // Leave for a standby spot before the handover, so the next stop
        // picks the agent up on its way there rather than over the content.
        rideAlong(current, agent, Math.min(free + 80 * s, Math.max(done + 15 * s, handover - 25 * s)), stayList.indexOf(agent), stayList.length + 1);
        return;
      }
      const exit = agent.queue.length ? agent.queue[agent.queue.length - 1].exit() : agent.last();
      const travel = travelMs(current, exit, dotPoint(current, agent));
      const leave = Math.min(free + 80 * s, Math.max(done + 15 * s, handover - travel));
      agent.dockAt = Math.min(Math.max(leave + 150 * s, Math.min(leave + travel, handover)), current.total);
      travelSeg(agent, leave, agent.dockAt, () => dotPoint(current, agent));
      addEvent(current, leave, () => { agent.cursor.classList.remove('is-working', 'is-idle'); say(agent, ''); });
      addEvent(current, Math.min(agent.dockAt, handover), () => dockAgent(current, agent));
      latestDock = Math.max(latestDock, agent.dockAt);
    });
    // Orchestrator reports last, then the hero stage clears; on the tour it
    // leads the ride-along crew down to the next section without docking.
    const orchDock = Math.min(current.total * 0.9, latestDock + 160 * s);
    const orchLeave = onward ? Math.max(orchArrive, handover - 520 * s) : Math.max(orchArrive, orchDock - 520 * s);
    if (onward) {
      stayers.add(orchestrator);
      rideAlong(current, orchestrator, orchLeave, stayList.length, stayList.length + 1);
    } else {
      travelSeg(orchestrator, orchLeave, orchDock, () => dotPoint(current, orchestrator));
      addEvent(current, orchDock, () => dockAgent(current, orchestrator));
      addEvent(current, Math.max(latestDock - 200 * s, 0), () => say(orchestrator, 'handing off'));
      addEvent(current, orchDock - 300 * s, () => orchestrator.cursor.classList.remove('is-working'));
    }
    current.stayers = stayers;
    addEvent(current, 330 * s, () => say(orchestrator, 'dispatching'));
    const firstReview = Math.min(...current.jobs.filter(job => job.kind === 'review').map(job => job.start), Infinity);
    if (firstReview < orchLeave) addEvent(current, firstReview, () => say(orchestrator, 'reviewing'));
    if (onward) {
      current.total = handover;
      addEvent(current, Math.max(0, handover - 140), () => current.stage.classList.add('is-leaving'));
      return;
    }
    // End as soon as the crew has reported back (never later than the budget).
    const leaveAt = orchDock + 80 * s;
    current.total = Math.min(current.total, leaveAt + 360 * s);
    addEvent(current, leaveAt, () => current.stage.classList.add('is-leaving'));
  }

  // ---- hero intro: black screen, guides, paint --------------------------
  const introUnit = current => current.scale * HERO_BASE / TIMING.hero.desktop;
  // Rough label width (9.5px bold mono), so labels stay on screen.
  const labelWidth = text => text.length * 5.9 + 12;

  // Layout guides, each measured live from the bounds cache: the content
  // column's margins, three lines of a 12-column grid over it, the header's
  // baseline and dashed boxes around the hero's main blocks. `geom()` gives
  // the guide's bounds, label text and label spot; `tip(e)` where the drawing
  // cursor is at eased progress `e`.
  function heroGuides(current) {
    const column = () => current.column || { left: current.vw * 0.06, right: current.vw * 0.94 };
    // A real gutter only when it fits a 12-column grid (else lines sit on
    // plain twelfths and no gutter is claimed).
    const grid = () => {
      const { left, right } = column();
      const W = right - left;
      const gap = current.gap > 0 && current.gap <= W / 16 ? current.gap : 0;
      return { left, gap, colW: (W - 11 * gap) / 12 };
    };
    const list = [];
    const add = (id, kind, act, geom) => list.push({ id, kind, act, geom });
    add('margin-left', 'v', 'drawing margins', () => {
      const x = column().left;
      return { x, y: 0, w: 1, h: current.vh, text: `margin ${Math.round(x)}`, lx: x + 6, ly: current.vh * 0.6 };
    });
    add('margin-right', 'v', 'drawing margins', () => {
      const x = column().right;
      const text = `margin ${Math.round((current.cw || current.vw) - x)}`;
      return { x, y: 0, w: 1, h: current.vh, text, lx: x - 6 - labelWidth(text), ly: current.vh * 0.6 };
    });
    const header = document.querySelector('.site-header');
    const head = header && box(current, header);
    if (head && head.h > 0 && head.y + head.h < current.vh * 0.5) {
      add('baseline', 'h', 'setting baseline', () => {
        const r = box(current, header);
        const y = r.y + r.h;
        const text = `baseline ${Math.round(y)}`;
        return { x: 0, y, w: current.vw, h: 1, text, lx: column().right - labelWidth(text), ly: y + 6 };
      });
    }
    [3, 9].forEach((k, i) => add(`col-${k}`, 'v', 'drawing columns', () => {
      const g = grid();
      const x = g.left + k * g.colW + (k - 0.5) * g.gap;
      const text = `col ${k}/12 · x ${Math.round(x)}${i === 0 && g.gap ? ` · gutter ${Math.round(g.gap)}` : ''}`;
      return { x, y: 0, w: 1, h: current.vh, text, lx: x + 6, ly: current.vh * 0.17 + i * 22 };
    }));
    [['box-title', '#hero-title', 'boxing headline'], ['box-art', '.hero-art', 'boxing portrait']].forEach(([id, sel, act]) => {
      const element = document.querySelector(sel);
      // Only blocks that start well inside the first screen get a box.
      if (!element || !inView(current, element) || box(current, element).y > current.vh * 0.8) return;
      add(id, 'box', act, () => {
        const r = box(current, element);
        const text = `${Math.round(r.w)} × ${Math.round(r.h)}`;
        return { x: r.x, y: r.y, w: r.w, h: r.h, text, lx: r.x, ly: r.y > 40 ? r.y - 18 : r.y + 5 };
      });
    });
    list.forEach(guide => {
      guide.tip = e => {
        const g = guide.geom();
        if (guide.kind === 'v') return { x: g.x, y: g.y + g.h * e };
        if (guide.kind === 'h') return { x: g.x + g.w * e, y: g.y };
        return { x: g.x + g.w * e, y: g.y + g.h * e };
      };
      guide.from = () => guide.tip(0);
      guide.line = make('div', `agentic-guide is-${guide.kind}`, current.guideLayer);
      guide.line.dataset.guide = guide.id;
      guide.label = make('b', 'agentic-guide-label', current.guideLayer);
      guide.label.dataset.guide = guide.id;
      guide.e = 0;
      if (guide.kind === 'box') guide.line.style.clipPath = 'inset(0 100% 100% 0)';
      else guide.line.style.scale = guide.kind === 'v' ? '1 0' : '0 1';
    });
    return list;
  }

  function placeGuide(current, guide) {
    const g = guide.geom();
    guide.line.style.translate = `${g.x}px ${g.y}px`;
    guide.line.style.width = `${Math.max(1, g.w)}px`;
    guide.line.style.height = `${Math.max(1, g.h)}px`;
    if (guide.label.textContent !== g.text) guide.label.textContent = g.text;
    const lx = clamp(g.lx, 4, Math.max(4, (current.cw || current.vw) - labelWidth(g.text) - 4));
    const ly = clamp(g.ly, 4, Math.max(4, current.vh - 22));
    guide.lx = lx;
    guide.label.style.translate = `${lx.toFixed(1)}px ${ly.toFixed(1)}px`;
  }

  // Per frame: the veil's wipe, guide growth (scale / clip-path) and labels.
  // A label shows from when its guide is drawn for `INTRO.label`, and only
  // over the black: it goes as soon as the wipe reaches it.
  function updateIntro(current, t) {
    const geometryChanged = current.introVersion !== current.version;
    current.introVersion = current.version;
    const veil = current.veil;
    if (veil) {
      const { t0, t1, sweep } = current.paint;
      if (t >= t1) { veil.remove(); current.veil = null; current.veilX = Infinity; }
      else if (t > t0) {
        const x = Math.round(clamp(sweep(easeInOut((t - t0) / (t1 - t0))).x, 0, current.vw) * 10) / 10;
        if (x !== current.veilX) { current.veilX = x; veil.style.clipPath = `inset(0 0 0 ${x}px)`; }
      }
    }
    current.guides.forEach(guide => {
      if (geometryChanged) placeGuide(current, guide);
      const e = Math.round(easeInOut(clamp01((t - guide.t0) / Math.max(1e-6, guide.t1 - guide.t0))) * 1000) / 1000;
      if (e !== guide.e) {
        guide.e = e;
        if (guide.kind === 'box') { const rest = ((1 - e) * 100).toFixed(1); guide.line.style.clipPath = e >= 1 ? 'none' : `inset(0 ${rest}% ${rest}% 0)`; }
        else guide.line.style.scale = guide.kind === 'v' ? `1 ${e}` : `${e} 1`;
      }
      // Shown (within the label budget) by hushLabels.
      const wiped = !current.veil || (current.veilX !== undefined && (guide.lx ?? 0) < current.veilX);
      guide.want = t >= guide.t1 && t < (guide.off ?? Infinity) && !wiped;
    });
  }

  // Per frame in the hero: at most HERO_BADGES labels at once (cursor and
  // guide labels). A label, once shown, keeps its place; the others wait (a
  // cursor works unlabelled) and show as soon as there is room: guide labels
  // first, then the headline's type agents.
  const BADGE_ORDER = ['orchestrator', 'type', 'nav', 'copy', 'art', 'layout', 'links', 'motion', 'a11y', 'qa'];
  function hushLabels(current) {
    let used = 0;
    const waiting = [];
    const guides = current.guides || [];
    guides.forEach(guide => {
      if (guide.on && !guide.want) { guide.on = false; guide.label.classList.remove('is-on'); }
      if (guide.on) used++;
    });
    current.agents.forEach(agent => {
      const classes = agent.cursor.classList;
      const labelled = classes.contains('is-working') && !classes.contains('is-docked') && !agent.away && agent.badge.textContent.includes(' · ');
      if (!labelled) { if (agent.hush !== undefined) { agent.hush = undefined; classes.remove('is-hush'); } return; }
      if (agent.hush === false) used++;
      else waiting.push(agent);
    });
    guides.forEach(guide => {
      if (!guide.want || guide.on || used >= HERO_BADGES) return;
      guide.on = true;
      guide.label.classList.add('is-on');
      used++;
    });
    waiting.sort((a, b) => BADGE_ORDER.indexOf(a.role) - BADGE_ORDER.indexOf(b.role) || a.index - b.index);
    waiting.forEach(agent => {
      const hush = used >= HERO_BADGES;
      if (!hush) used++;
      if (hush !== agent.hush) { agent.hush = hush; agent.cursor.classList.toggle('is-hush', hush); }
    });
  }

  // Plays before the planned hero build: shifts that plan behind the intro,
  // then lays out the intro's own cursor paths and events.
  function planIntro(current) {
    const lead = current.intro;
    if (!lead) return;
    const u = introUnit(current);
    const orchestrator = current.agents[0];
    const subagents = current.agents.slice(1);
    current.events.forEach(event => { event.at += lead; });
    current.jobs.forEach(job => { job.start += lead; job.arrive += lead; job.end += lead; });
    current.total += lead;
    const body = new Map(current.agents.map(agent => {
      agent.segs.forEach(seg => { seg.t0 += lead; seg.t1 += lead; });
      const segs = agent.segs;
      agent.segs = [];
      return [agent, segs];
    }));
    const spawn = () => ({ x: current.vw / 2, y: current.vh * 0.45 });

    // When each agent's own hero work starts: the intro may only use it until then.
    const busyFrom = agent => Math.min(Infinity, ...body.get(agent).filter(seg => seg.kind !== 'hold' && seg.t0 > lead).map(seg => seg.t0));

    // 0-0.3 s, black: the orchestrator plans alone, then the crew pops in.
    holdSeg(orchestrator, 0, spawn);
    addEvent(current, 0, () => { orchestrator.cursor.classList.add('is-in', 'is-working'); say(orchestrator, 'planning layout'); });
    addEvent(current, INTRO.guides * u, () => say(orchestrator, 'setting guides'));
    addEvent(current, INTRO.paint * u, () => say(orchestrator, 'clearing canvas'));
    const crew = subagents.filter(agent => !agent.held && agent.ring);
    crew.forEach((agent, i) => {
      const popAt = (INTRO.crew + (INTRO.crewEnd - INTRO.crew) * i / Math.max(1, crew.length)) * u;
      holdSeg(agent, 0, spawn);
      addEvent(current, popAt, () => agent.cursor.classList.add('is-in'));
      travelSeg(agent, popAt, popAt + 380 * u, agent.ring);
    });

    // ~0.35-1.15 s: guides, a few per drawing agent. Drawing agents carry no
    // label of their own (each guide's label says what it is), and a label
    // shows only briefly, over the black: never over the page's text.
    current.guides = heroGuides(current);
    const back = 420 * u;
    const guidesEnd = INTRO.guidesEnd * u;
    const paintEnd = INTRO.paintEnd * u;
    // The painter and the drawers are agents whose own hero work starts later.
    const free = crew.map(agent => ({ agent, from: busyFrom(agent) })).sort((a, b) => b.from - a.from || a.agent.index - b.agent.index);
    const painterPick = free.find(entry => (entry.agent.role === 'art' || entry.agent.role === 'motion') && entry.from >= paintEnd + back)
      || free.find(entry => entry.from >= paintEnd + back);
    const painter = painterPick?.agent || null;
    const drawers = free.filter(entry => entry.agent !== painter && entry.from >= guidesEnd + back).slice(0, Math.min(4, Math.ceil(current.guides.length / 2))).map(entry => entry.agent);
    const queues = drawers.length ? drawers.map(() => []) : [[]];
    // Left to right, like the wipe that follows: each label shows before the paint reaches it.
    [...current.guides].sort((a, b) => a.geom().lx - b.geom().lx).forEach((guide, i) => queues[i % queues.length].push(guide));
    const introEnd = new Map();
    queues.forEach((queue, k) => {
      const agent = drawers[k];
      let t = (INTRO.guides + k * 60) * u;
      let at = agent ? agent.ring() : spawn();
      const legs = queue.map(guide => { const ms = clamp(90 + distance(at, guide.from()) * 0.15, 110, 200) * u; at = guide.tip(1); return ms; });
      const draw = clamp((guidesEnd - t - legs.reduce((sum, ms) => sum + ms + 30 * u, 0)) / Math.max(1, queue.length), 200 * u, 420 * u);
      queue.forEach((guide, j) => {
        const arrive = t + legs[j];
        guide.t0 = arrive;
        guide.t1 = arrive + draw;
        guide.off = guide.t1 + INTRO.label * u;
        if (agent) {
          travelSeg(agent, t, arrive, guide.from);
          agent.segs.push({ t0: guide.t0, t1: guide.t1, kind: 'work', point: p => guide.tip(easeInOut(p)) });
          agent.last = () => guide.tip(1);
          if (j === 0) addEvent(current, t, () => startWorking(current, agent));
        }
        t = guide.t1 + 30 * u;
      });
      if (!agent || !queue.length) return;
      travelSeg(agent, t, t + back, agent.ring);
      introEnd.set(agent, t + back);
    });

    // ~1.05-1.65 s: the paint agent sweeps left to right; the veil follows it,
    // and the build follows the veil (planHero's readyAt).
    const sweep = e => ({ x: -12 + (current.vw + 24) * e, y: current.vh * (0.52 + 0.05 * Math.sin(e * Math.PI * 2)) });
    current.paint = { t0: INTRO.paint * u, t1: paintEnd, sweep };
    if (painter) {
      const leave = current.paint.t0 - 380 * u;
      travelSeg(painter, leave, current.paint.t0, () => sweep(0));
      painter.segs.push({ t0: current.paint.t0, t1: current.paint.t1, kind: 'work', point: p => sweep(easeInOut(p)) });
      painter.last = () => sweep(1);
      travelSeg(painter, paintEnd, paintEnd + back, painter.ring);
      introEnd.set(painter, paintEnd + back);
      addEvent(current, leave, () => { startWorking(current, painter); painter.cursor.classList.add('is-working'); say(painter, 'painting canvas'); });
      addEvent(current, current.paint.t1, () => { painter.cursor.classList.remove('is-working'); say(painter, ''); });
    }

    // The guides fade out as the hero hands over, gone when its run ends.
    const fade = INTRO.fade * u;
    addEvent(current, Math.max(guidesEnd, current.total - fade), () => {
      current.guideLayer.style.transitionDuration = `${realMs(fade)}ms`;
      current.guideLayer.classList.add('is-fading');
    });
    // Agents that worked in the intro join their hero plan once back at the ring.
    current.agents.forEach(agent => {
      const until = introEnd.get(agent);
      agent.segs = [...agent.segs, ...body.get(agent).filter(seg => until === undefined || seg.t0 >= until)];
    });
  }

  // A tour stop. The run starts while the page is still moving: the carried
  // crew takes the first items as they slide in, a few fresh agents leave the
  // dock, and the run hands over to the next stop as soon as its builder jobs
  // are done (late reviews are left out). Everyone who worked stays on screen
  // except one or two agents who rotate back to the dock; the last stop docks
  // the whole crew and ends with the handoff.
  function planBuild(current, stopInfo) {
    const s = current.scale;
    const anim = current.anim;
    current.jobGap = 160 * anim;
    const lead = current.lead;
    const [orchestrator] = current.agents;
    const crew = current.agents.filter(agent => agent.role !== 'orchestrator');
    const home = agent => () => dotPoint(current, agent);
    const name = stopInfo.name.toLowerCase();
    const heading = current.heading;
    const last = !nextStop();
    const command = () => {
      const h = heading ? box(current, heading) : null;
      if (h && h.w) return { x: clamp(h.x + Math.min(h.w, 420) + 30, 40, current.vw - 150), y: clamp(h.y + 8, 90, current.vh - 140) };
      return { x: current.vw * 0.62, y: Math.max(110, current.vh * 0.22) };
    };
    if (orchestrator.carry) holdCarried(current, orchestrator);
    else holdSeg(orchestrator, 0, home(orchestrator));
    const commandAt = clamp(lead * 0.6, 520 * anim, 1600 * anim);
    travelSeg(orchestrator, 60 * s, commandAt, command);
    addEvent(current, 0, () => {
      orchestrator.cursor.classList.add('is-in', 'is-working');
      say(orchestrator, lead > 0 ? `moving to ${name}` : 'planning');
    });
    addEvent(current, commandAt, () => say(orchestrator, 'dispatching'));

    // Lay out every queue: items are taken as they scroll in (readyAt).
    const lastReady = Math.max(0, ...current.jobs.map(job => (Number.isFinite(job.readyAt) ? job.readyAt : 0)));
    let deadline = Math.max(lead + current.budget - 400 * s, lastReady + 1400 * anim);
    const gap = Math.min(220 * anim, (current.budget * 0.25) / Math.max(1, crew.length));
    crew.forEach(agent => agent.queue.sort((a, b) => (a.readyAt || 0) - (b.readyAt || 0)));
    // The paint sweep comes before the painter's other work, and it leaves at once.
    const paint = current.wire?.paint;
    if (paint) {
      const queue = paint.agent.queue;
      queue.splice(queue.indexOf(paint), 1);
      queue.unshift(paint);
    }
    let fresh = 0;
    let carried = 0;
    crew.forEach(agent => {
      if (agent.carry) {
        agent.firstStart = 40 * s + carried++ * 70 * s;
        agent.from = { x: agent.carry.x, y: agent.carry.y };
      } else {
        agent.firstStart = 200 * s + fresh++ * gap;
        agent.from = home(agent)();
      }
      if (paint && agent === paint.agent) agent.firstStart = Math.min(agent.firstStart, 16 * s);
      agent.free = agent.queue.length ? fitQueue(current, agent, agent.firstStart, agent.from, deadline) : 0;
    });
    // Jobs that wait for another (`after`): they start once it is done (a
    // pasted card's editors once the paste lands). A few passes settle chains;
    // they run again after any job changes hands below.
    const settleDeps = fit => {
      const waiting = current.jobs.filter(job => ((job.afterJob && current.jobs.includes(job.afterJob)) || job.afterJobs?.length) && job.agent);
      for (let pass = 0; waiting.length && pass < 6; pass++) {
        let moved = false;
        waiting.forEach(job => {
          let ready;
          if (job.afterJobs) {
            const ends = job.afterJobs.filter(other => current.jobs.includes(other) && Number.isFinite(other.end)).map(other => other.end);
            if (!ends.length) return;
            // `overlap`: start that long before the last of them is done.
            ready = Math.max(...ends) + (120 - (job.spec?.overlap || 0)) * anim;
          } else {
            const dep = job.afterJob;
            if (!Number.isFinite(dep.end)) return;
            // `afterAt`: the share of the other job's work to wait for (default all of it).
            const share = job.spec?.afterAt ?? 1;
            ready = (share < 1 ? dep.arrive + dep.work * share : dep.end) + 120 * anim;
          }
          // `stagger`: items of one spec take their turn, this far apart.
          ready += (job.spec?.stagger || 0) * (job.spec?.nth || 0) * anim;
          // From its own readiness each pass, so it follows its dependency both ways.
          if (job.ownReady === undefined) job.ownReady = Number.isFinite(job.readyAt) ? job.readyAt : 0;
          const next = Math.max(job.ownReady, ready);
          if (!(Math.abs((job.readyAt ?? -1) - next) < 1)) { job.readyAt = next; moved = true; deadline = Math.max(deadline, next + 1400 * anim); }
        });
        if (!moved) break;
        crew.forEach(agent => {
          if (!agent.queue.length) return;
          agent.queue.sort((a, b) => (a === paint ? -1 : b === paint ? 1 : (a.readyAt || 0) - (b.readyAt || 0)));
          agent.free = fit ? fitQueue(current, agent, agent.firstStart, agent.from, deadline) : simulate(current, agent, agent.firstStart, agent.from, agent.factor || 1);
        });
      }
    };
    settleDeps(true);
    // Content that would sit on screen still hidden is shown now instead
    // (in a wired section, content is only seen once the paint uncovers it).
    const shownAt = job => (paint && Number.isFinite(paint.arrive) && current.wire.section.contains(job.target)
      ? Math.max(job.readyAt, wipeTime(current, job.target, paint.arrive, paint.work))
      : job.readyAt);
    // A job whose agent would arrive after its item is seen is rescued at
    // plan time: the crew agent that can get there first (an idle carried
    // agent in the margins if it can) flies in at rescue speed, as long as
    // nothing else it does gets later. Only if nobody can does the job go to
    // the run's pool, where an agent freed up later may still take it. Pool
    // items (content no planned job covers) are offered to the crew the same way.
    // Content under a placeholder may wait for its editor a little longer (only
    // while the job that left the placeholder is still planned).
    const liveDep = job => (job.afterJob && current.jobs.includes(job.afterJob) && !job.afterJob.void ? job.afterJob : null);
    const allowance = job => (job.rescue ? RESCUE.cap - 50 * anim : liveDep(job)?.spec?.holes ? HOLE_CAP * anim * 0.6 : 200 * anim);
    // A copy or paste that others wait for counts too: a late one holds up its whole chain.
    const isLate = job => (job.reveals.length || (job.leads && !job.kept)) && !job.decor && job.agent && job.agent !== orchestrator && Number.isFinite(job.readyAt) && job.arrive > shownAt(job) + allowance(job);
    const resim = agent => { agent.free = agent.queue.length ? simulate(current, agent, agent.firstStart, agent.from, agent.factor || 1) : 0; };
    const order = agent => agent.queue.sort((a, b) => (a === paint ? -1 : b === paint ? 1 : (a.readyAt || 0) - (b.readyAt || 0)));
    const assign = (job, skip, until = Infinity) => {
      job.rescue = true;
      job.travelFrom = from => rescueTravel(current, from, job.entry());
      let best = null;
      crew.forEach(agent => {
        if (agent === skip) return;
        const saved = agent.queue.map(other => [other, other.start, other.arrive, other.end, other.work, other.typeMs]);
        const free = agent.free;
        agent.queue.push(job);
        job.agent = agent;
        order(agent);
        const after = simulate(current, agent, agent.firstStart, agent.from, agent.factor || 1);
        const fits = job.arrive <= shownAt(job) + allowance(job)
          && saved.every(([other, , arrive]) => !(Number.isFinite(other.readyAt) && other.reveals.length) || other.arrive <= Math.max(arrive, shownAt(other) + allowance(other)))
          && after <= Math.max(deadline, free) && job.end <= until;
        const score = job.arrive + (agent.carry && !agent.queue.some(other => other !== job) ? 0 : 150 * anim);
        if (fits && (!best || score < best.score)) best = { agent, score };
        agent.queue.splice(agent.queue.indexOf(job), 1);
        saved.forEach(([other, ...times]) => { [other.start, other.arrive, other.end, other.work, other.typeMs] = times; });
        agent.free = free;
      });
      if (!best) {
        job.agent = null;
        job.rescue = false;
        delete job.travelFrom;
        job.start = job.arrive = job.end = undefined;
        job.work = job.baseWork;
        job.typeMs = job.baseType;
        return false;
      }
      best.agent.queue.push(job);
      job.agent = best.agent;
      order(best.agent);
      resim(best.agent);
      if (tour) tour.rescued++;
      return true;
    };
    for (let guard = current.jobs.length; guard > 0; guard--) {
      const job = current.jobs.filter(isLate).sort((a, b) => a.readyAt - b.readyAt)[0];
      if (!job) break;
      const owner = job.agent;
      owner.queue.splice(owner.queue.indexOf(job), 1);
      resim(owner);
      if (assign(job, owner)) continue;
      // A late copy or paste nobody can take sooner stays where it was.
      if (!job.reveals.length) { job.kept = true; job.rescue = false; delete job.travelFrom; owner.queue.push(job); job.agent = owner; order(owner); resim(owner); continue; }
      current.jobs.splice(current.jobs.indexOf(job), 1);
      job.pooled = true;
      current.pool.push(job);
    }
    // Pool items only fill gaps: the stop does not get longer for them
    // (except the last stop, which settles anyway).
    const horizon = Math.max(deadline, lead + current.budget);
    const builtBy = last ? Infinity : Math.max(0, ...current.jobs.filter(job => job.agent && job.agent !== orchestrator && HIDES.has(job.kind)).map(job => job.end));
    current.pool.filter(job => Number.isFinite(job.readyAt) && shownAt(job) <= horizon).sort((a, b) => shownAt(a) - shownAt(b)).forEach(job => {
      job.readyAt = shownAt(job);
      if (!assign(job, null, builtBy)) return;
      current.pool.splice(current.pool.indexOf(job), 1);
      job.pooled = false;
      current.jobs.push(job);
    });

    settleDeps(false);
    // Hand over once the builders are done.
    const crewJobs = current.jobs.filter(job => job.agent && job.agent !== orchestrator);
    const builders = crewJobs.filter(job => HIDES.has(job.kind));
    const handover = Math.max(commandAt + 400 * s, lead * 0.5, ...(builders.length ? builders : crewJobs).map(job => job.end)) + 260 * anim;
    let total = handover;
    if (!last) {
      const trailing = agent => {
        const job = agent.queue[agent.queue.length - 1];
        if (!job || !OPTIONAL.has(job.kind)) return false;
        // A QA pin whose resolver was dropped goes with it.
        return job.start >= handover - 120 * anim || (job.kind === 'pin' && !current.jobs.some(other => other.kind === 'resolve' && other.afterJob === job));
      };
      const trim = agent => {
        let dropped = false;
        while (agent.queue.length && trailing(agent)) {
          current.jobs.splice(current.jobs.indexOf(agent.queue.pop()), 1);
          dropped = true;
        }
        if (dropped) agent.free = agent.queue.length ? agent.queue[agent.queue.length - 1].end + current.jobGap : 0;
        return dropped;
      };
      // Twice: a resolver dropped on a later agent frees its pin on an earlier one.
      crew.forEach(trim);
      crew.forEach(trim);
      crew.forEach(agent => { if (agent.queue.length) total = Math.max(total, agent.queue[agent.queue.length - 1].end + 60 * anim); });
    }
    // On screen before their agents get there, jobs that wait for another may
    // stay hidden (under placeholders, if it left some) until `graceUntil`;
    // only while that other job is still planned (voidJob clears it).
    current.jobs.forEach(job => {
      const dep = job.afterJob;
      if (dep && current.jobs.includes(dep) && !dep.void && Number.isFinite(dep.end)) job.graceUntil = dep.end + (dep.spec?.holes ? HOLE_CAP : RESCUE.cap) * anim;
    });

    // Who goes back to the dock: everyone on the last stop; otherwise the
    // agents that finish first, one or two per stop, or more if over the cap.
    const out = crew.filter(agent => agent.queue.length || agent.carry);
    let rotate;
    if (last) rotate = new Set(out);
    else {
      const ranked = [...out].sort((a, b) => a.free - b.free);
      // Over the ride-along cap: the excess; otherwise a couple for variety,
      // as long as the crew stays above its floor.
      // Narrow margins: only the last two to finish stay out.
      const n = Math.min(ranked.length, Math.max(ranked.length - idleCap(current), ranked.length > MIN_CREW[current.tier] ? ROTATE[current.tier] : 0));
      rotate = new Set(ranked.slice(0, n));
    }
    const stayList = out.filter(agent => !rotate.has(agent));
    // Standby slots for everyone still out (the orchestrator takes the last).
    const slots = [...stayList, ...out.filter(agent => rotate.has(agent))];
    let docking = 0;
    let latest = commandAt;
    crew.forEach(agent => {
      const k = slots.indexOf(agent);
      if (agent.carry) holdCarried(current, agent, k, slots.length + 1);
      if (!agent.queue.length && !agent.carry) return; // fresh, but nothing left to do
      if (agent.queue.length) {
        if (!agent.carry) {
          addEvent(current, Math.max(0, agent.queue[0].start - 320 * s), () => agent.cursor.classList.add('is-in'));
          holdSeg(agent, 0, home(agent));
        }
        scheduleQueue(current, orchestrator, agent, !agent.carry);
      }
      const back = agent.queue.length ? agent.free + 40 * s : 480 * s + k * 40 * s;
      if (rotate.has(agent)) {
        // Rotating agents leave near the handover (not as soon as they are
        // free), so the crew count changes in small steps; until then they
        // wait at a standby spot like everyone else. Narrow screens have no
        // room for them: they go straight back.
        let leave = back;
        if (!last && !current.column?.narrow) {
          leave = Math.max(back, handover - 700 * anim + docking++ * 120 * anim);
          if (leave - back > 900 * anim) {
            // It waits at a standby spot (the one it is at, if it has nothing
            // to do here) and leaves only once it got there.
            const parkedAt = !agent.queue.length && agent.parked ? agent.parked.at : rideAlong(current, agent, back, k, slots.length + 1);
            leave = Math.max(leave, parkedAt + 80 * anim);
          } else leave = back;
        }
        agent.dockAt = leave + clamp(travelMs(current, agent.last(), home(agent)()), 450 * anim, 640 * anim);
        travelSeg(agent, leave, agent.dockAt, home(agent));
        addEvent(current, leave, () => { agent.cursor.classList.remove('is-working', 'is-idle'); say(agent, ''); });
        addEvent(current, agent.dockAt, () => dockAgent(current, agent));
        if (!last) total = Math.max(total, agent.dockAt + 60 * s);
      } else if (!agent.queue.length && agent.parked) {
        // Nothing to do here and already at a standby spot: it stays there.
        agent.dockAt = agent.parked.at;
      } else {
        // Idle carried agents drift over to this stop's standby spots.
        agent.dockAt = rideAlong(current, agent, back, k, slots.length + 1);
      }
      latest = Math.max(latest, agent.dockAt);
    });

    let orchHome;
    if (!last) {
      // The orchestrator leads the crew on; the next stop starts while the
      // page is still moving.
      orchHome = rideAlong(current, orchestrator, Math.max(commandAt, total - 520 * anim), slots.length, slots.length + 1);
      current.stayers = new Set([...stayList, orchestrator]);
      current.total = total;
      addEvent(current, total - 220 * anim, () => current.stage.classList.add('is-leaving'));
      return;
    }
    // Last stop: the scroll settles and, once the builders are done, the
    // orchestrator hands off while the crew docks.
    let end = Math.max(handover, commandAt + 300 * s, lead + 200 * s);
    if (current.handoffJob) {
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
    const floor = crew.length ? lead + current.budget * 0.6 : lead + 700 * s;
    // The last stop ends as the orchestrator docks, after its crew, so no
    // frame is empty.
    const leave = Math.max(end, floor - 360 * s, latest - 300 * s);
    orchHome = leave + 360 * s;
    travelSeg(orchestrator, leave, orchHome, home(orchestrator));
    current.lastStop = true;
    addEvent(current, leave, () => orchestrator.cursor.classList.remove('is-working'));
    addEvent(current, orchHome, () => dockAgent(current, orchestrator));
    current.stayers = new Set();
    current.total = Math.max(orchHome, floor);
    addEvent(current, current.total - 180 * s, () => current.stage.classList.add('is-leaving'));
  }

  // ---- lower sections: wireframe, paint, skeletons ------------------------
  // A stop whose section is still wholly below the fold when it is planned
  // builds it from scratch: a near-black fill over the section with margin
  // guides, a dashed outline and grey skeleton blocks where this stop's
  // builder jobs will place content. As the section's top enters, a paint
  // agent sweeps across it and the fill is wiped (clip-path following the
  // agent, as in the hero), showing the section's own background. Each
  // skeleton fades as its item is placed; the guides fade once the builders
  // are done or the section reaches the focus band. Everything sits in the
  // run's stage (above the page, below frames and cursors) and is positioned
  // from the bounds cache: one transform per frame for the whole overlay.
  function planWire(current, stopInfo) {
    const section = stopInfo.section;
    const r = box(current, section);
    // The continuous scroll often has the section's top a few dozen px into
    // view when its stop is planned; a thin entering edge at the bottom may
    // still be wireframed (it is painted within about a second).
    const edge = Math.min(120, current.vh * 0.15);
    if (!current.measurable || !current.traj || !(r.w > 0 && r.h > 0) || r.y < current.vh - edge) return;
    const top = r.y + current.sy0;
    const entry = trajTime(current.traj, y => top - y < current.vh);
    if (!Number.isFinite(entry)) return;
    const anim = current.anim;
    const wire = { section, top, entry, light: !section.classList.contains('dark-section'), skeletons: [], fill: null };
    // The sweep runs along the section's visible top, left to right.
    wire.sweep = e => {
      const b = box(current, section);
      const y = clamp(Math.max(b.y, 0) + 64, 64, current.vh - 72) + Math.sin(e * Math.PI * 2) * 10;
      return { x: b.x - 12 + (b.w + 24) * e, y };
    };
    const paint = {
      kind: 'paint', role: 'art', act: `painting ${stopInfo.name.toLowerCase()}`, decor: true,
      target: section, reveals: [], ui: [], readyAt: entry, baseWork: WIRE.paint * anim, baseType: 0,
    };
    paint.entry = () => wire.sweep(0);
    paint.cursorAt = p => wire.sweep(easeInOut(p));
    paint.exit = () => wire.sweep(1);
    paint.travelFrom = from => clamp(90 + distance(from, wire.sweep(0)) * 0.12, 120, 180) * anim;
    paint.begin = () => { paint.begun = true; wire.edge?.classList.add('is-on'); };
    paint.update = now => paintWire(current, clamp01((now - paint.arrive) / Math.max(1, paint.work)));
    paint.finish = () => wipeWire(wire);
    wire.paint = paint;
    current.wire = wire;
    // Items under the fill are not seen before the wipe passes them: agents
    // aim for that moment (estimated now; checked against the planned sweep).
    const start = Math.max(entry, 200 * anim);
    current.jobs.forEach(job => {
      if (Number.isFinite(job.readyAt) && section.contains(job.target)) job.readyAt = Math.max(job.readyAt, wipeTime(current, job.target, start, paint.baseWork));
    });
    // Staffed like any job (so the crew has a painter), then handed to the
    // art/motion agent least needed elsewhere when the section enters.
    current.jobs.unshift(paint);
  }

  // When a sweep starting at `start` and lasting `work` passes an element's left edge.
  function wipeTime(current, element, start, work) {
    const s = box(current, current.wire.section);
    const f = clamp01((box(current, element).x - (s.x - 12)) / (s.w + 24));
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < 16; i++) { const mid = (lo + hi) / 2; if (easeInOut(mid) < f) lo = mid; else hi = mid; }
    return start + work * hi;
  }
  // Whether an element is still entirely under the unpainted fill.
  function underFill(current, element, r) {
    const wire = current.wire;
    if (!wire?.fill || !wire.section.contains(element)) return false;
    const s = box(current, wire.section);
    return r.x >= s.x + (wire.wipeX || 0) - 0.5 && r.y >= s.y - 0.5;
  }

  function settlePainter(current) {
    const paint = current.wire.paint;
    current.jobs = current.jobs.filter(job => job !== paint);
    const crew = current.agents.filter(agent => agent.role !== 'orchestrator');
    const pool = crew.filter(agent => agent.role === 'art' || agent.role === 'motion');
    const options = pool.length ? pool : crew;
    const firstOther = agent => Math.min(Infinity, ...agent.queue.filter(job => job !== paint).map(job => (Number.isFinite(job.readyAt) ? job.readyAt : 0)));
    const rank = agent => [firstOther(agent), agent === paint.agent ? 2 : agent.carry ? 1 : 0];
    const best = options.reduce((a, b) => {
      const [fa, ka] = rank(a);
      const [fb, kb] = rank(b);
      return fb > fa || (fb === fa && kb > ka) ? b : a;
    }, options[0]);
    if (!best) { current.wire = null; return; }
    if (paint.agent && paint.agent !== best) paint.agent.queue.splice(paint.agent.queue.indexOf(paint), 1);
    if (paint.agent !== best) best.queue.unshift(paint);
    paint.agent = best;
  }

  // The overlay's DOM, skeletons for this stop's builder jobs, and the guide fade.
  function buildWire(current) {
    const wire = current.wire;
    const s = current.scale;
    const anim = current.anim;
    const paint = wire.paint;
    const root = make('div', `agentic-wire${wire.light ? ' is-light' : ''}`);
    current.layer.before(root);
    wire.root = root;
    wire.base = make('div', 'agentic-wire-base', root);
    wire.fill = make('div', 'agentic-wire-fill', root);
    // Blocks show over the black (a copy inside the fill, wiped with it) and on
    // the section's own background below it (darker on light sections).
    const shell = make('div', 'agentic-wire-base', wire.fill);
    wire.edge = make('div', 'agentic-wire-edge', root);
    wire.edge.style.setProperty('--agent-color', ROLES[paint.agent.role].color);
    wire.guides = make('div', 'agentic-wire-guides', root);
    wire.lines = ['left', 'right'].map(side => {
      const line = make('div', 'agentic-wire-line', wire.guides);
      line.dataset.guide = `margin-${side}`;
      return line;
    });
    wire.outline = make('div', 'agentic-wire-outline', wire.guides);
    wire.labels = ['margin-left', 'size', 'margin-right'].map(id => {
      const label = make('b', 'agentic-wire-label', wire.guides);
      label.dataset.guide = id;
      return label;
    });
    [...current.jobs, ...current.pool].forEach(job => {
      if (!job.reveals.length || job.decor || !wire.section.contains(job.target)) return;
      const text = TEXT_KINDS.has(job.kind);
      // A block per hidden piece (a place job may hide only part of its item).
      const elements = job.reveals.filter(element => !job.reveals.some(other => other !== element && other.contains(element)));
      const blocks = [];
      elements.forEach(element => {
        const b = text ? textBox(current, element) : box(current, element);
        if (!(b.w > 0 && b.h > 0)) return;
        // Text gets one bar per rendered line (a few at most), anything else one block.
        const parts = text && b.lines && b.lines.length <= WIRE.lines ? b.lines.length : 1;
        for (let line = 0; line < parts; line++) {
          const nodes = [make('div', 'agentic-skeleton', wire.base), make('div', 'agentic-skeleton', shell)];
          // Lets tests (and debugging) map a block back to its item.
          nodes[0].agenticTarget = element;
          blocks.push({ element, text, line: parts > 1 ? line : -1, nodes });
        }
      });
      if (!blocks.length) return;
      wire.skeletons.push(...blocks);
      job.onPlace = () => {
        if (job.placed) return;
        job.placed = true;
        const ms = `${realMs(WIRE.skeleton * anim)}ms`;
        blocks.forEach(block => block.nodes.forEach(node => { node.style.transitionDuration = ms; node.classList.add('is-out'); }));
      };
    });
    // Guides fade once the builders are done or the section reaches the
    // focus band (never before the paint), and are gone before the stop ends.
    const builders = current.jobs.filter(job => job.reveals.length && Number.isFinite(job.end));
    const built = builders.length ? Math.max(...builders.map(job => job.end)) : paint.end;
    const focusAt = trajTime(current.traj, y => wire.top - y <= current.vh * WIRE.focus);
    const fadeMs = WIRE.guides * anim;
    const fadeAt = Math.max(0, Math.min(Math.max(paint.end, Math.min(built, focusAt)), current.total - fadeMs - 40 * s));
    addEvent(current, fadeAt, () => {
      wire.guides.style.transitionDuration = `${realMs(fadeMs)}ms`;
      wire.guides.classList.add('is-fading');
    });
    addEvent(current, fadeAt + fadeMs, () => { wire.guides.remove(); wire.guides = null; });
  }

  // Sizes and children, relative to the section (only after a measurement).
  function placeWire(current, wire, r) {
    wire.measures = current.measures;
    wire.root.style.width = `${Math.max(1, r.w)}px`;
    wire.root.style.height = `${Math.max(1, r.h)}px`;
    const set = (element, x, y, w, h) => {
      element.style.translate = `${x.toFixed(1)}px ${y.toFixed(1)}px`;
      if (w !== undefined) { element.style.width = `${Math.max(1, w).toFixed(1)}px`; element.style.height = `${Math.max(1, h).toFixed(1)}px`; }
    };
    if (wire.guides) {
      const column = current.column || { left: current.vw * 0.06, right: current.vw * 0.94 };
      const [left, right] = wire.lines;
      set(left, column.left - r.x, 0);
      set(right, column.right - r.x, 0);
      const [marginLeft, size, marginRight] = wire.labels;
      marginLeft.textContent = `margin ${Math.round(column.left)}`;
      size.textContent = `${Math.round(r.w)} × ${Math.round(r.h)}`;
      marginRight.textContent = `margin ${Math.round((current.cw || current.vw) - column.right)}`;
      const fit = (x, text) => clamp(x, 4, Math.max(4, r.w - labelWidth(text) - 4));
      const lx = fit(column.left - r.x + 6, marginLeft.textContent);
      set(marginLeft, lx, 8);
      set(size, fit(lx + labelWidth(marginLeft.textContent) + 8, size.textContent), 8);
      set(marginRight, fit(column.right - r.x - 6 - labelWidth(marginRight.textContent), marginRight.textContent), 8);
    }
    wire.skeletons.forEach(block => {
      const t = block.text ? textBox(current, block.element) : box(current, block.element);
      const b = block.line >= 0 && t.lines ? t.lines[block.line] : t;
      block.nodes.forEach(node => set(node, b.x - r.x, b.y - r.y, b.w, b.h));
    });
    wire.clipX = undefined;
  }

  // Per frame: one transform for the overlay, and the no-blank guard. The
  // fill may cover the visible page only while it is being painted: if the
  // paint agent has not started `grace` ms after the section's top entered,
  // or has not finished by then plus its paint time, the fill goes at once.
  function updateWire(current, t) {
    const wire = current.wire;
    const r = box(current, wire.section);
    if (wire.measures !== current.measures) placeWire(current, wire, r);
    // Blocks for content in a pinned (sticky) stage stay on that content.
    if (wire.liveVersion !== current.version && current.live.size) {
      wire.liveVersion = current.version;
      wire.skeletons.forEach(block => {
        if (!current.live.has(block.element)) return;
        const t = block.text ? textBox(current, block.element) : box(current, block.element);
        const b = block.line >= 0 && t.lines ? t.lines[block.line] : t;
        block.nodes.forEach(node => { node.style.translate = `${(b.x - r.x).toFixed(1)}px ${(b.y - r.y).toFixed(1)}px`; });
      });
    }
    const x = Math.round(r.x * 10) / 10;
    const y = Math.round(r.y * 10) / 10;
    if (x !== wire.x || y !== wire.y) { wire.x = x; wire.y = y; wire.root.style.translate = `${x}px ${y}px`; }
    if (!wire.fill) return;
    if (wire.enteredAt === undefined) {
      if (r.y >= current.vh) return;
      wire.enteredAt = t;
    }
    const paint = wire.paint;
    const since = t - wire.enteredAt;
    const painting = paint.begun && Number.isFinite(paint.end);
    if ((!painting && since > WIRE.grace) || (painting && since > WIRE.grace + (paint.end - paint.arrive))) {
      wipeWire(wire);
      wire.forced = true;
    }
  }

  // The fill's wipe follows the paint agent's sweep (the same path).
  function paintWire(current, p) {
    const wire = current.wire;
    if (!wire?.fill) return;
    const r = box(current, wire.section);
    const x = Math.round(clamp(wire.sweep(easeInOut(p)).x - r.x, 0, r.w) * 10) / 10;
    if (x === wire.clipX) return;
    wire.clipX = x;
    wire.wipeX = x;
    wire.fill.style.clipPath = `inset(0 0 0 ${x}px)`;
    wire.edge.style.translate = `${x}px 0`;
  }

  function wipeWire(wire) {
    if (!wire.fill) return;
    wire.fill.remove();
    wire.fill = null;
    wire.edge?.remove();
    wire.edge = null;
    wire.root.classList.add('is-painted');
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

  // Never leave content hidden on screen for long: an item that is in view
  // before its agent gets there waits while that agent is due within the
  // rescue cap; otherwise the nearest idle margin agent takes it over. Only
  // when no agent can make it within the cap is it shown at once.
  function guardBlanks(current, t) {
    if (!current.measurable || !current.guarded.size) return;
    const edge = current.vh * 0.97;
    current.guarded.forEach(job => {
      if (job.begun || job.late) { current.guarded.delete(job); return; }
      const r = box(current, job.target);
      if (!(r.h > 0 && r.y < edge && r.y + r.h > 0 && r.x < current.vw && r.x + r.w > 0)) return;
      // Still under a section's unpainted fill: not seen yet (the fill has its own guard).
      if (underFill(current, job.target, r)) return;
      if (job.seenAt === undefined) job.seenAt = t;
      if (job.graceUntil !== undefined) {
        if (t < job.graceUntil - RESCUE.cap) return;
        job.seenAt = Math.max(job.seenAt, job.graceUntil - RESCUE.cap);
      }
      if (Number.isFinite(job.arrive) && job.arrive <= job.seenAt + RESCUE.cap - 24 * current.anim) return;
      if (handOver(current, job, t)) { current.guarded.delete(job); return; }
      if (t - job.seenAt >= giveUpAfter(current)) {
        job.downgrade();
        current.guarded.delete(job);
        if (tour) { tour.late++; tour.instant++; }
      }
    });
  }

  // ---- rescues: idle margin agents build what nobody else will in time -----
  // Content that no planned job covers (or whose job was judged late) waits
  // hidden in the run's pool. As each item is about to come into view, the
  // nearest idle agent flies in from the margin and types or places it, then
  // drifts back to its spot. Agents are taken only while they idle and have
  // nothing planned until well after the rescue (`spare`).
  const POOL_SKIP = '[hidden], .project-stories, dialog, .agentic-stage, .agentic-dock, [data-agentic-replay]';
  const ownText = element => [...element.childNodes].some(node => node.nodeType === 3 && node.nodeValue.trim());
  // How long an on-screen item may wait for a rescuer before it is shown.
  const giveUpAfter = current => RESCUE.cap - RESCUE.travel[0] * 0.6 * current.anim;

  // The roots of every section the tour has reached (and the next one) that
  // is not wholly above the view, plus their `within` roots: their unbuilt
  // content may still come in.
  function poolScope() {
    if (!tour) return [];
    const scope = [];
    // The next section too: its top often comes in while this stop runs.
    tour.stops.slice(1, tour.index + 2).forEach(stopInfo => {
      const roots = [stopInfo.section, ...(stopInfo.jobs || []).filter(spec => spec.within).map(spec => document.querySelector(spec.within))];
      roots.forEach(rootNode => {
        if (!rootNode || scope.some(entry => entry.root === rootNode)) return;
        const r = rootNode.getBoundingClientRect();
        if (!(r.height > 0) || r.bottom > 0) scope.push({ stopInfo, root: rootNode });
      });
    });
    return scope;
  }

  // Candidates, measured with everything else: every builder spec's items in
  // scope, then any other text block (an element with its own text, outside
  // those items), so nothing with words in it just appears.
  function gatherPool(current, scope) {
    const items = [];
    const blocks = [];
    const covered = new Set();
    // Items hidden whole (a place job with `pop` hides only part of its item).
    const whole = new Set();
    scope.forEach(({ stopInfo, root: rootNode }) => {
      (stopInfo.jobs || []).forEach(spec => {
        if (!HIDES.has(spec.kind) || spec.group) return;
        if ((spec.within ? document.querySelector(spec.within) : stopInfo.section) !== rootNode) return;
        specNodes(spec, stopInfo.section).forEach(node => {
          if (covered.has(node)) return;
          covered.add(node);
          if (!spec.pop) whole.add(node);
          items.push({ spec, node });
          // Bounds only for now; text lines are read for the items pooled.
          current.watch.add(node);
          const sub = spec.sub ? node.querySelector(spec.sub) : null;
          if (sub) current.watch.add(sub);
          if (spec.kids) node.querySelectorAll(spec.kids).forEach(kid => current.watch.add(kid));
        });
      });
    });
    scope.forEach(({ root: rootNode }) => {
      for (const element of rootNode.querySelectorAll('*')) {
        if (covered.has(element) || !ownText(element) || element.closest(POOL_SKIP)) continue;
        let inside = false;
        for (let node = element.parentElement; node && node !== rootNode; node = node.parentElement) if (whole.has(node) || blocks.includes(node)) { inside = true; break; }
        if (inside) continue;
        covered.add(element);
        blocks.push(element);
        current.watch.add(element);
      }
    });
    return { items, blocks };
  }

  // Laid out and visible (gallery back cards, clipped and closed content are not).
  function rendered(current, element) {
    const r = box(current, element);
    if (!(r.w > 0 && r.h > 0)) return false;
    return perceivable(current, element);
  }

  // Pool jobs for candidates still below the fold that no planned job claims.
  function makePool(current, gathered) {
    const pool = [];
    if (!current.measurable || !tour) return pool;
    const claimed = [];
    // What planned jobs hide (a place job may hide only part of its item).
    current.jobs.forEach(job => { if (HIDES.has(job.spec?.kind)) claimed.push(...job.reveals); });
    const taken = element => claimed.some(other => other === element || other.contains(element) || element.contains(other));
    const waiting = current.waiting;
    const usable = node => !taken(node) && (belowFold(current, node) || waiting.has(node)) && rendered(current, node);
    // Text lines (read now, in the same batch as the bounds) for text jobs and sub lines.
    const lines = element => {
      if (current.textTargets.has(element)) return;
      current.textTargets.add(element);
      const entry = current.cache.get(element);
      if (entry) entry.text = readText(element);
    };
    const add = (spec, node, reveals) => {
      if (TEXT_KINDS.has(spec.kind)) lines(node);
      if (spec.parts?.sub) lines(spec.parts.sub);
      const job = createJob(current, { ...spec, pooled: true }, node, reveals);
      job.pooled = true;
      job.readyAt = readyAt(current, node);
      // Carried over still hidden: its time in view so far counts.
      const seen = waiting.get(node);
      if (seen !== undefined) { job.seenAt = seen; job.readyAt = seen; }
      claimed.push(...reveals);
      pool.push(job);
    };
    gathered.items.forEach(({ spec, node }, index) => {
      if (!usable(node)) return;
      const item = itemSpec(current, spec, node, index);
      add(item, node, item.parts ? item.parts.all : [node]);
    });
    gathered.blocks.forEach(node => {
      if (!usable(node)) return;
      const short = cleanName(node.textContent).length <= 60;
      add(itemSpec(current, { role: 'copy', kind: short ? 'type' : 'wipe', act: 'writing', label: true, charMs: 40 }, node, 0), node, [node]);
    });
    return pool.sort((a, b) => box(current, a.target).y - box(current, b.target).y);
  }

  // When each pool item is first seen (after the paint wipe in a wired
  // section), and when its rescuer should be reserved.
  function readyPool(current) {
    const paint = current.wire?.paint;
    current.pool.forEach(job => {
      if (paint && Number.isFinite(paint.arrive) && current.wire.section.contains(job.target)) {
        job.readyAt = Math.max(job.readyAt, wipeTime(current, job.target, paint.arrive, paint.work));
      }
      job.dueAt = job.readyAt - RESCUE.lead * current.anim;
    });
  }

  function insertEvent(current, at, fn) {
    let index = current.events.length;
    while (index > current.next && current.events[index - 1].at > at) index--;
    current.events.splice(index, 0, { at, fn });
  }

  // Agents that may take a rescue now, with `until` their next planned move:
  // idle ones drifting at a standby spot (or on their way back from a
  // rescue), then agents resting in the dock with nothing left to do. On
  // narrow screens the dock is only called on while fewer than
  // NARROW_SPARE agents are out idling or rescuing.
  function freeAgents(current, t) {
    const free = [];
    let spare = 0;
    const docked = [];
    current.agents.forEach(agent => {
      if (agent.role === 'orchestrator' || !agent.cursor) return;
      const classes = agent.cursor.classList;
      const out = classes.contains('is-in') && !classes.contains('is-docked');
      if (agent.segs.length) segPoint(agent, t, current);
      const seg = agent.segs[agent.si];
      if (out && (agent.rescueBusy > t || seg?.dyn || seg?.kind === 'drift')) spare++;
      if (agent.rescueBusy > t) return;
      if (!out) {
        // Docked for good: no planned move left, and back at its dot.
        if (agent.segs.some(other => !other.dyn && other.t0 > t) || (seg && t < seg.t1)) return;
        docked.push({ agent, seg: null, docked: true, until: Infinity });
        return;
      }
      if (!seg || !(seg.ret || (seg.kind === 'drift' && t >= seg.t0))) return;
      const next = agent.segs.slice(agent.si + 1).find(other => !other.dyn);
      free.push({ agent, seg, until: next ? next.t0 : Infinity });
    });
    if (!current.column?.narrow || spare < NARROW_SPARE) free.push(...docked);
    return free;
  }

  const rescueTravel = (current, from, to) => clamp(160 + distance(from, to) * 0.3, RESCUE.travel[0], RESCUE.travel[1]) * current.anim;
  const returnTravel = (current, from, to) => clamp(320 + distance(from, to) * 0.35, 450, 800) * current.anim;

  // The nearest free agent that can reach the item in time (before it shows,
  // or within the cap once it is on screen) and be back before its next move.
  function pickRescuer(current, job, t, free, limit = Infinity) {
    const to = job.entry();
    let best = null;
    free.forEach(option => {
      const from = option.docked ? dotPoint(current, option.agent) : option.agent.position || segPoint(option.agent, t, current);
      let travel = rescueTravel(current, from, to);
      let start = t;
      if (job.seenAt !== undefined) {
        // Aim a frame inside the cap (work begins on the next frame after arrival).
        const room = job.seenAt + RESCUE.cap - 24 * current.anim - t;
        if (room < RESCUE.travel[0] * 0.6 * current.anim) return;
        travel = Math.min(travel, room);
      } else if (Number.isFinite(job.readyAt)) {
        start = Math.max(t, job.readyAt - travel);
      }
      const home = option.seg?.kind === 'drift' ? option.seg.point() : from;
      const back = returnTravel(current, to, home) + RESCUE.spare * current.anim;
      // A tight window is met by working a little faster (down to 0.7x).
      const room = Math.min(limit, option.until - back) - start - travel;
      const pace = room >= job.baseWork ? 1 : room / job.baseWork;
      if (pace < 0.7) return;
      // Idle agents first; the dock only when none of them can make it.
      const score = distance(from, to) + (option.docked ? 400 : 0) + (pace < 1 ? 120 : 0);
      if (!best || score < best.score) best = { option, from, travel, start, score, pace };
    });
    return best;
  }

  function dispatchRescue(current, pick, job, t) {
    const { agent, seg, docked } = pick.option;
    const fixed = { ...pick.from };
    let home;
    let from = () => fixed;
    let anchor = null;
    if (docked) {
      // Called out of the dock: it goes back there afterwards.
      home = () => dotPoint(current, agent);
      from = home;
    } else {
      const anchorSeg = seg.kind === 'drift' ? seg : agent.segs.slice(agent.si + 1).find(other => other.dyn && other.kind === 'drift') || [...agent.segs.slice(0, agent.si + 1)].reverse().find(other => other.kind === 'drift');
      anchor = anchorSeg?.anchor || (() => fixed);
      home = drifting(current, agent, anchor);
      if (seg.kind === 'drift') from = seg.point;
    }
    job.agent = agent;
    job.start = pick.start;
    job.arrive = pick.start + pick.travel;
    job.work = job.baseWork * pick.pace;
    job.typeMs = job.baseType * pick.pace;
    job.end = job.arrive + job.work;
    const backAt = job.end + returnTravel(current, job.exit(), home());
    // Replace any earlier rescue's way home; keep every planned move.
    agent.segs = [
      ...agent.segs.slice(0, agent.si + 1),
      { t0: job.start, t1: job.arrive, kind: 'travel', dyn: true, point: p => curve(from(), job.entry(), agent.bend, easeInOut(p)) },
      { t0: job.arrive, t1: job.end, kind: 'work', dyn: true, point: p => job.cursorAt(p) },
      { t0: job.end, t1: backAt, kind: 'travel', dyn: true, ret: true, point: p => curve(job.exit(), home(), agent.bend, easeInOut(p)) },
      docked ? { t0: backAt, t1: backAt, kind: 'hold', dyn: true, point: home } : { t0: backAt, t1: backAt, kind: 'drift', dyn: true, point: home, anchor },
      ...agent.segs.slice(agent.si + 1).filter(other => !other.dyn),
    ];
    const token = {};
    agent.rescueToken = token;
    agent.rescueBusy = job.end;
    current.rescues.push(job);
    current.rescuing.add(job);
    if (tour) tour.rescued++;
    insertEvent(current, job.start, () => {
      if (docked) { agent.cursor.classList.remove('is-docked'); agent.cursor.classList.add('is-in'); agent.dot?.classList.remove('is-done'); }
      startWorking(current, agent);
      agent.cursor.classList.remove('is-idle');
      agent.cursor.classList.add('is-working');
      agent.cursor.agenticTarget = job.target;
      agent.job = job;
      say(agent, job.act);
    });
    insertEvent(current, job.arrive, now => {
      if (!targetReady(current, job, 'arrive')) { voidJob(current, job, agent); return; }
      job.begin(now);
      current.active.add(job);
    });
    insertEvent(current, job.end, () => {
      completeJob(current, job);
      current.rescuing.delete(job);
      if (agent.rescueToken === token) { agent.cursor.classList.remove('is-working'); say(agent, ''); }
    });
    insertEvent(current, backAt, () => {
      if (agent.rescueToken !== token) return;
      if (docked) dockAgent(current, agent);
      else agent.cursor.classList.add('is-idle');
    });
  }

  // A planned job whose agent will be late: an idle agent takes it over, and
  // the planned agent only passes by for a decorative check.
  function handOver(current, job, t) {
    const free = freeAgents(current, t).filter(option => option.agent !== job.agent);
    if (!free.length) return false;
    const rescue = createJob(current, { ...job.spec, pooled: true }, job.target, job.reveals);
    rescue.readyAt = t;
    rescue.seenAt = job.seenAt;
    const pick = pickRescuer(current, rescue, t, free);
    if (!pick) return false;
    rescue.onPlace = job.onPlace;
    job.release();
    dispatchRescue(current, pick, rescue, t);
    return true;
  }

  // Per frame: reserve rescuers for pool items about to come into view; show
  // an item at once only when nobody can reach it within the cap.
  function rescueTick(current, t) {
    if (!current.measurable || !current.pool.length) return;
    const ending = t >= current.total;
    let free = null;
    for (const job of current.pool) {
      if (job.agent || job.late) continue;
      const r = box(current, job.target);
      const onScreen = r.h > 0 && r.y < current.vh && r.y + r.h > 0 && r.x < current.vw && r.x + r.w > 0 && !underFill(current, job.target, r);
      if (onScreen && job.seenAt === undefined) job.seenAt = t;
      if (!onScreen && !(t >= job.dueAt)) continue;
      // Once the stop is over only items already in view are taken, and a
      // rescue that would run on well past the stop is left to the next one
      // (the item stays hidden into it).
      if (!ending || current.lastStop || onScreen) {
        free ??= freeAgents(current, t);
        // In view already: better to run on past the stop than to pop it in.
        const limit = current.lastStop ? Infinity : current.total + (onScreen ? 1400 : 0);
        const pick = free.length ? pickRescuer(current, job, t, free, limit) : null;
        if (pick) {
          free.splice(free.indexOf(pick.option), 1);
          dispatchRescue(current, pick, job, t);
          continue;
        }
      }
      if (onScreen && t - job.seenAt >= giveUpAfter(current)) {
        job.downgrade();
        if (tour) { tour.late++; tour.instant++; }
      }
    }
  }

  function completeJob(current, job) {
    if (current.active.has(job)) job.update(job.end);
    current.active.delete(job);
    job.finish();
    // Decorative work (the paint sweep) is not a counted target.
    if (!job.decor) current.done++;
  }

  function dispatchLine(current, orchestrator, agent, job, now) {
    const from = orchestrator.position || segPoint(orchestrator, now);
    drawLine(current, from, job.entry(), ROLES[agent.role].color, now);
  }
  function drawLine(current, from, to, color, now, variant = '', life = 700 * current.scale) {
    const length = distance(from, to);
    if (length < 24) return;
    const line = make('div', `agentic-dispatch ${variant}`, current.layer);
    line.style.setProperty('--agent-color', color);
    line.style.width = `${length}px`;
    line.style.translate = `${from.x}px ${from.y}px`;
    line.style.rotate = `${Math.atan2(to.y - from.y, to.x - from.x)}rad`;
    // Insert in time order; every processed event is earlier than `now`.
    const at = now + life;
    let index = current.events.length;
    while (index > current.next && current.events[index - 1].at > at) index--;
    current.events.splice(index, 0, { at, fn: () => line.remove() });
  }

  // ---- cursors ------------------------------------------------------------
  function segPoint(agent, t, current) {
    const segs = agent.segs;
    while (agent.si < segs.length - 1 && t >= segs[agent.si + 1].t0) agent.si++;
    const seg = segs[agent.si];
    const p = clamp01((t - seg.t0) / Math.max(1e-6, seg.t1 - seg.t0));
    const point = seg.point(p);
    if (seg.kind === 'work' || seg.kind === 'drift' || (seg.kind === 'travel' && p < 1)) return point;
    // Waiting (not working): keep moving a little, like the rest of the swarm.
    return swarm(point, current ? (current.t0 || 0) + t : t, agent, 0.3);
  }

  function placeAgent(current, agent, t) {
    // A fresh agent whose every job went to the rescue pool stays in the dock.
    if (!agent.segs.length) return;
    const point = segPoint(agent, t, current);
    agent.position = point;
    const seg = agent.segs[agent.si];
    agent.anchor = seg && seg.kind === 'drift' && t >= seg.t0 ? seg.anchor() : null;
    const after = agent.segs[agent.si + 1];
    agent.goal = seg && seg.kind === 'travel' && after?.kind === 'drift' ? after.anchor() : null;
    const x = Math.max(2, Math.min(current.vw - 14, point.x));
    const y = Math.max(2, Math.min(current.vh - 20, point.y));
    // A cursor held at the edge (its point is off screen) shows no label:
    // a label is only ever drawn where its work is.
    let away = Math.abs(point.x - x) > 10 || Math.abs(point.y - y) > 10;
    // On the way to work that is not on screen yet (or any more): no label either.
    const job = agent.job;
    if (!away && job && !job.void && current.measurable && agent.role !== 'orchestrator') {
      // At least a few pixels of it on screen: cached bounds every frame, and
      // the live bounds a few times a second (content can still be settling).
      const on = r => r.w > 0 && r.h > 0 && r.y < current.vh - 6 && r.y + r.h > 6 && r.x < current.vw - 6 && r.x + r.w > 6;
      if (!(agent.liveAt > t) || agent.liveJob !== job) {
        agent.liveAt = t + 140;
        agent.liveJob = job;
        agent.liveOn = on(readRect(job.target));
      }
      away = !agent.liveOn || !on(box(current, job.target))
        // Still waiting for motion.js to fade it in.
        || Boolean(job.target.closest?.('[data-reveal="pending"]'))
        // Waiting for the copy it is to write in to land.
        || Boolean(job.afterJob && job.afterJob.kind === 'paste' && !job.afterJob.done && !job.afterJob.void);
    }
    if (away !== agent.away) { agent.away = away; agent.cursor.classList.toggle('is-away', away); }
    if (agent.x !== undefined && Math.abs(agent.x - x) < 0.05 && Math.abs(agent.y - y) < 0.05) return;
    if (agent.x !== undefined) {
      // Lean into the direction of travel (smoothed), so cursors feel alive.
      agent.vx = (agent.vx || 0) * 0.82 + (x - agent.x) * 0.18;
      const tilt = Math.max(-14, Math.min(14, agent.vx * 2.4));
      if (Math.abs(tilt - (agent.tilt || 0)) > 0.3) { agent.tilt = tilt; agent.cursor.style.setProperty('--tilt', `${tilt.toFixed(1)}deg`); }
    }
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
    // One builder per element; the copy/paste/pin kinds may share an element
    // with it (one of each kind).
    const used = new Map();
    const taken = (target, kind) => {
      const kinds = used.get(target);
      if (!kinds) return false;
      return SHARED.has(kind) ? kinds.has(kind) : [...kinds].some(other => !SHARED.has(other));
    };
    const push = (spec, target, reveals) => {
      if (!target || taken(target, spec.kind)) return;
      if (!used.has(target)) used.set(target, new Set());
      used.get(target).add(spec.kind);
      jobs.push(createJob(current, spec, target, reveals));
    };
    plan.forEach(spec => {
      if (spec.only && (spec.only === 'phone') !== single(current)) return;
      const nodes = specNodes(spec, rootNode);
      if (!nodes.length) return;
      if (current.kind === 'pass') {
        nodes.filter(node => !taken(node, spec.kind) && (!current.measurable || inView(current, node)) && plannable(current, node))
          .slice(0, spec.multi || 1)
          .forEach(node => push(spec, node, []));
      } else if (current.kind === 'build') {
        if (spec.group) {
          const container = rootNode.querySelector(spec.group);
          const shown = nodes.filter(node => willShow(current, node) && plannable(current, node, spec)).slice(0, spec.max || 6);
          if (!container || !shown.length) return;
          const hidden = shown.filter(node => belowFold(current, node));
          push(hidden.length ? spec : { ...spec, kind: DEMOTE[spec.kind] || spec.kind }, container, hidden);
        } else {
          // One job per item, up to `multi`; `rest` cascades the others.
          // Only items a visitor could see get an agent (the visible-target rule).
          let shown = nodes.filter(node => !taken(node, spec.kind) && willShow(current, node) && plannable(current, node, spec));
          if (spec.byX) shown = shown.sort((a, b) => box(current, a).x - box(current, b).x);
          const own = shown.slice(0, spec.multi || 1);
          own.forEach((node, index) => {
            const item = itemSpec(current, spec, node, index);
            // Slide content is still off stage: it is prepared hidden and built as it comes in.
            if (!HIDES.has(item.kind)) push(item, node, []);
            else if (belowFold(current, node) || spec.slide) push(item, node, item.parts ? item.parts.all : [node]);
            else push({ ...item, kind: DEMOTE[item.kind], parts: null }, node, []);
          });
          // The cascade only takes items close below the first one: farther
          // ones would appear long after the agent left (the pool builds them).
          let rest = spec.rest ? shown.slice(own.length).filter(node => belowFold(current, node)) : [];
          if (rest.length && current.measurable) { const top = box(current, rest[0]).y; rest = rest.filter(node => box(current, node).y <= top + current.vh * 0.3); }
          if (rest.length) push({ ...spec, role: spec.role || spec.roles[0], kind: 'reveal', act: `placing ${rest.length} more` }, rest[0], rest);
        }
      } else if (spec.each && spec.group && (current.tier !== 'desktop' || spec.grouped)) {
        const container = document.querySelector(spec.group);
        const shown = current.measurable ? nodes.filter(node => inView(current, node)) : nodes;
        if (container && shown.length && (!current.measurable || inView(current, container))) push(spec, container, shown);
      } else {
        (spec.each ? nodes : nodes.slice(0, 1))
          .filter(node => !current.measurable || inView(current, node))
          .forEach(node => push(spec.label ? { ...spec, act: `${spec.act} '${cleanName(node.textContent)}'` } : spec, node, HIDES.has(spec.kind) ? [node] : []));
      }
    });
    return cap ? jobs.slice(0, cap) : jobs;
  }

  // A spec's items: inside the stop's section, or under `within` elsewhere.
  function specNodes(spec, rootNode) {
    const scope = spec.within ? document.querySelector(spec.within) : rootNode;
    return scope ? [...scope.querySelectorAll(spec.sel)] : [];
  }

  // `only: 'phone'` specs run where the layout is a single column, `'wide'`
  // ones elsewhere. A stop with `columns` asks its grid how many tracks it
  // really has (a list can be one column well above the phone tier); without
  // a laid-out grid the viewport tier decides.
  const single = current => (current.tracks ? current.tracks < 2 : current.tier === 'phone');
  function gridTracks(current, element) {
    if (!element || !current.measurable) return 0;
    const style = window.getComputedStyle?.(element);
    if (!style || !/grid/.test(style.display || '')) return 0;
    const value = (style.gridTemplateColumns || '').trim();
    if (!value || value === 'none') return 1;
    // Resolved track sizes ("312px 312px"); a repeat() means no layout ran.
    if (/repeat\(/.test(value)) return 0;
    return value.split(/\s+(?![^(]*\))/).filter(Boolean).length;
  }

  const cleanName = text => (text || '').replace(/[↗↓↑→←]/g, '').replace(/\s+/g, ' ').trim();
  // One item's job spec: its role (cycled), its label and its parts.
  function itemSpec(current, spec, node, index) {
    const item = { ...spec, role: spec.roles ? spec.roles[index % spec.roles.length] : spec.role, nth: index };
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
      if (sub && current.measurable) { const r = box(current, sub); if (!(r.w > 0 && r.h > 0) || !perceivable(current, sub, { slide: Boolean(spec.slide) })) sub = null; }
      let kids = spec.kids ? [...node.querySelectorAll(spec.kids)] : [];
      // The cursor visits each tag: only ones that are really there.
      if (current.measurable) kids = kids.filter(kid => perceivable(current, kid, { slide: Boolean(spec.slide) }));
      item.parts = { pops, sub, kids, all: [...pops, ...(sub ? [sub] : []), ...kids] };
    }
    return item;
  }

  function prepare(kind, duration) {
    const tier = crewTier(width());
    const base = kind === 'hero' ? HERO_BASE : kind === 'build' ? BUILD_BASE : PASS_BASE;
    const scale = duration / base;
    return {
      kind,
      tier,
      total: duration,
      budget: duration,
      scale,
      // Animation pace: tour stops stay near real time whatever their weight
      // (short test timings, `buildDuration`, keep their own scale).
      anim: kind === 'build' && !config.buildDuration ? clamp(scale, 0.95, 1.15) : scale,
      now: 0,
      t0: 0,
      traj: null,
      guarded: new Set(),
      cache: new Map(),
      view: new Map(),
      version: 0,
      sy: 0,
      sy0: 0,
      dy: 0,
      dyFinal: 0,
      lead: 0,
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
      pool: [],
      rescues: [],
      rescuing: new Set(),
      holes: [],
      holesVersion: -1,
      pins: [],
      pinsVersion: -1,
      // Pool items the previous stop handed over still hidden (and when each was first seen).
      waiting: new Map(),
      wasHidden: new Set(),
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
      specNodes(spec, rootNode).forEach(node => {
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
    [...current.jobs, ...current.pool].forEach(job => {
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
    if (current.kind === 'build') current.jobs.forEach(job => { if (job.reveals.length) current.guarded.add(job); });
    lastStats = statsOf(current);
    run = current;
    root.classList.add('agentic-running');
    current.t0 = tour ? tour.vt : 0;
    current.now = 0;
    current.vt = 0;
    current.last = clock();
    // Events due at once (carried cursors, the orchestrator) apply before the
    // first paint, so the crew never blinks out between stops.
    while (current.next < current.events.length && current.events[current.next].at <= 0) current.events[current.next++].fn(0);
    if (current.guides) updateIntro(current, 0);
    if (current.wire) updateWire(current, 0);
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
    // `sub` stops continue the previous section: one step in the dock's plan.
    let step = -1;
    stops.forEach((stopInfo, index) => { if (!stopInfo.sub || index === 0) step++; stopInfo.step = step; });
    tour = { stops, index: 0, firstVisit: !replay, realStart: clock(), hiddenMs: 0, workers: new Set(), vt: 0, late: 0, rescued: 0, instant: 0 };
    planSteps = stops.filter((stopInfo, index) => !stopInfo.sub || index === 0).map(stopInfo => ({ label: planName(stopInfo.name), state: 'planned', agents: 0 }));
    carry = null;
    sectionsEligible = false;
    replayButton.hidden = true;
    builtCount = crewSize(width());
    // A keyboard Replay hides the focused control: keep focus in the dock.
    const focusOnReplay = Boolean(document.activeElement?.closest?.('[data-agentic-replay], [data-agentic-dock-replay]'));
    if (replay) scrollToY(0);
    tourY = readScrollY();
    tourScroll.y = tourY;
    tourScroll.v = 0;
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
    while (tour.index < tour.stops.length && !stopActive(tour.stops[tour.index])) tour.index++;
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
    // The intro's guides measure the header and the hero's main blocks.
    current.gapProbe = document.querySelector('.hero-bottom');
    watchElements(current, [...candidates, document.querySelector('.hero-kicker'), ...['.site-header', '#hero-title', '.hero-art', '.hero-portrait', '.hero-orbit', '.hero-bottom'].map(sel => document.querySelector(sel))]);
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
    current.intro = INTRO.end * introUnit(current);
    planHero(current);
    planIntro(current);
    if (tour) addEvent(current, current.total * 0.55, () => showNote(tour?.stops[0]?.note));
    launch(current, () => {
      if (tour) { advanceTour(); return; }
      phase = 'ready';
    });
  }

  // Where a stop's scroll heads: the section's top clear of the fixed header
  // (like an anchor link), a full-bleed scene's top, or a tall scene's end.
  function stopTarget(current, stopInfo, maxY) {
    // A travelling Experience stage: hold it on the stop's chapter.
    const xp = current.xp;
    if (xp && stopInfo.chapter !== undefined && stopInfo.section === xp.section) {
      return clamp(xp.top + (xp.at[stopInfo.chapter] ?? 0) * xp.distance, 0, maxY);
    }
    const r = box(current, stopInfo.section);
    const headerPad = stopInfo.align ? 0 : parseFloat(window.getComputedStyle?.(root).scrollPaddingTop) || 0;
    const offset = stopInfo.align === 'end' ? Math.max(0, r.h - current.vh) : -headerPad;
    return clamp(current.sy0 + r.y + offset, 0, maxY);
  }

  // The stop's trajectory, continuing from the scroll's current velocity.
  function planScroll(current, stopInfo, following) {
    const y0 = current.sy0;
    const from = Math.abs(tourScroll.y - y0) < 2 ? { y: tourScroll.y, v: Math.max(0, tourScroll.v) } : { y: y0, v: 0 };
    const maxY = Math.max(0, (root.scrollHeight || 0) - current.vh);
    const motion = SCROLL[current.tier];
    // Test timing (`scrollDuration`) makes the scroll effectively immediate.
    const boost = config.scrollDuration ? 400 : 1;
    const accel = motion.accel * boost * boost;
    const to = Math.max(stopTarget(current, stopInfo, maxY), from.y);
    // Tall sections: cruise on through them while their items are placed.
    let span = 0;
    const xp = current.xp;
    if (xp && stopInfo.chapter !== undefined) {
      // A chapter wider than the view: pan slowly across it while it is built.
      const chapter = xp.chapters[stopInfo.chapter];
      const gutter = xp.chapters[0].offsetLeft || 0;
      const overflow = chapter ? box(current, chapter).w + 2 * gutter - current.vw : 0;
      span = Math.min(overflow > 0 ? (overflow / xp.shift) * xp.distance : 0, maxY - to);
      if (!(span > 40)) span = 0;
    } else if (stopInfo.span) {
      const r = box(current, stopInfo.section);
      const end = y0 + r.y + r.h - current.vh - to;
      // `untilEnd`: cruise on to the section's end however tall it is (short
      // screens would otherwise stop before its last lines come into view).
      let reach = stopInfo.untilEnd ? end : current.vh * stopInfo.span;
      // `spanTo`: no further than that element's top a little below the
      // fixed header (room for the slow creep after it), so the Projects
      // explorer stays in view while it is used.
      const mark = stopInfo.spanTo ? stopInfo.section.querySelector(stopInfo.spanTo) : null;
      if (mark) {
        const m = box(current, mark);
        const pad = parseFloat(window.getComputedStyle?.(root).scrollPaddingTop) || 0;
        if (m.h > 0) reach = Math.min(reach, Math.max(0, y0 + m.y - pad - 60 - to));
      }
      span = Math.min(end, reach, maxY - to);
      if (!(span > 40)) span = 0;
    }
    // While a pinned stage holds on a chapter the scroll only drifts (the
    // track moves ~1.3x as far sideways).
    // `creep`: a slower creep for a stop whose controls are used in place.
    const creep = current.xp && stopInfo.dwell ? Math.min(motion.creep, stopInfo.dwell) : stopInfo.creep ? Math.min(motion.creep, stopInfo.creep) : motion.creep;
    const cruise = span ? clamp(span / (current.budget * 0.7 / 1000), creep, motion.max * 0.45 * boost) : creep;
    const soft = following ? Math.max(to + span, stopTarget(current, following, maxY)) : maxY;
    current.traj = makeTraj({ accel, brake: accel * 0.55, max: motion.max * boost, floor: motion.floor, creep, cruise, to, until: to + span, cruiseAfter: span ? current.budget * 0.15 : 0, soft, maxY, settle: !following }, from);
    current.lead = trajTime(current.traj, y => y >= to - 2);
    if (!Number.isFinite(current.lead)) current.lead = 0;
    current.dyFinal = sampleTraj(current.traj, current.lead + current.budget).y - y0;
  }

  // The stop's roster: the carried crew first, then fresh agents from the
  // dock for the roles its jobs still need (up to the crew cap), one agent
  // per role instance, round-robin per role.
  function buildCrew(current) {
    const counts = CREWS[current.tier];
    const orchestrator = makeAgent('orchestrator', 1, 1, 0);
    current.agents.push(orchestrator);
    const crew = [];
    const byRole = new Map();
    const labels = new Set();
    const add = agent => {
      crew.push(agent);
      current.agents.push(agent);
      labels.add(agent.label);
      if (!byRole.has(agent.role)) byRole.set(agent.role, []);
      byRole.get(agent.role).push(agent);
      return agent;
    };
    (carry || []).forEach(entry => {
      if (entry.role === 'orchestrator') { orchestrator.carry = entry; return; }
      if (!counts[entry.role] || labels.has(entry.label)) return; // the viewport class changed
      const agent = makeAgent(entry.role, 1, 1, current.agents.length);
      agent.label = entry.label;
      agent.carry = entry;
      add(agent);
    });
    carry = null;
    const freshLabel = role => {
      for (let n = 1; n <= (counts[role] || 0); n++) {
        const label = counts[role] > 1 ? `${ROLES[role].label}·${n}` : ROLES[role].label;
        if (!labels.has(label)) return n;
      }
      return 0;
    };
    const freshAgent = role => {
      const n = freshLabel(role);
      return n ? add(makeAgent(role, n, counts[role], current.agents.length)) : null;
    };
    const turn = {};
    current.jobs.forEach(job => {
      const role = resolveRole(job.role, counts);
      const n = turn[role] = (turn[role] || 0) + 1;
      const pool = byRole.get(role) || [];
      const slot = (n - 1) % counts[role];
      let agent = pool[slot];
      if (!agent && crew.length < MAX_CREW[current.tier]) agent = freshAgent(role);
      if (!agent && pool.length) agent = pool[slot % pool.length];
      if (!agent) {
        // A full crew: the least-busy agent along the role's fallback chain.
        const chain = [];
        for (let next = FALLBACK[role]; next && chain.length < 6; next = FALLBACK[next]) if (!chain.includes(next)) chain.push(next);
        const options = chain.flatMap(r => byRole.get(r) || []);
        const choices = options.length ? options : crew;
        agent = choices.reduce((best, next) => (next.queue.length < best.queue.length ? next : best), choices[0]) || freshAgent(role);
      }
      job.agent = agent;
      agent.queue.push(job);
    });
    // Keep the crew in its band: below the floor, fresh agents from the dock
    // take every other job from the busiest queues.
    while (crew.length < MIN_CREW[current.tier]) {
      const busiest = [...crew].sort((a, b) => b.queue.length - a.queue.length).find(agent => agent.queue.length >= 2 && freshLabel(agent.role));
      if (!busiest) break;
      const helper = freshAgent(busiest.role);
      busiest.queue = busiest.queue.filter((job, index) => {
        if (index % 2 === 0) return true;
        job.agent = helper;
        helper.queue.push(job);
        return false;
      });
    }
    // Spare hands: roster agents waiting in the dock for rescues.
    for (let k = 0; k < RESERVE[current.tier]; k++) {
      const role = Object.keys(counts).find(name => freshLabel(name));
      if (!role) break;
      freshAgent(role).reserve = true;
    }
  }

  // The Experience stage while it travels sideways (experience.js sets
  // data-xp="travel" and the --xp-* custom properties it is laid out by).
  function travelStage(stopInfo) {
    const section = stopInfo.section;
    if (stopInfo.chapter === undefined || section?.dataset.xp !== 'travel') return null;
    const travel = section.querySelector('.xp-travel');
    const track = section.querySelector('.xp-track');
    const chapters = track ? [...track.querySelectorAll('.xp-chapter')] : [];
    const distance = parseFloat(section.style.getPropertyValue('--xp-distance'));
    const shift = parseFloat(section.style.getPropertyValue('--xp-shift'));
    if (!travel || !chapters.length || !(distance > 0) || !(shift > 0)) return null;
    const at = chapters.map((chapter, k) => {
      const value = parseFloat(chapter.style.getPropertyValue('--xp-at'));
      return Number.isFinite(value) ? value : k / Math.max(1, chapters.length - 1);
    });
    // The same rest-and-move map experience.js lays the track out by: the
    // stops align each chapter, the moves share all but the rests' scroll.
    const first = chapters[0].offsetLeft;
    const plan = travelPlan(chapters.map(chapter => clamp(chapter.offsetLeft - first, 0, shift)), shift, distance * (1 - HOLD_SHARE));
    return { section, travel, track, chapters, distance, shift, at, plan };
  }

  // `after`: the keyed job inside the same item (or else the first one).
  function linkJobs(current) {
    const keyed = current.jobs.filter(job => job.spec?.key);
    current.jobs.forEach(job => {
      const want = job.spec?.after;
      if (!want) return;
      // '*': every builder inside its element (or, with `afterOf`, every
      // builder of the stop's items matching that selector).
      if (want === '*') {
        const mine = other => (job.spec.afterOf ? other.target.matches?.(job.spec.afterOf) : job.target.contains(other.target));
        job.afterJobs = current.jobs.filter(other => other !== job && HIDES.has(other.kind) && mine(other));
        return;
      }
      const options = keyed.filter(other => other !== job && other.spec.key === want);
      job.afterJob = options.find(other => other.target === job.target || other.target.contains(job.target)) || options[0] || null;
      if (job.afterJob) job.afterJob.leads = true;
    });
  }

  function startBuild(stopInfo) {
    const section = stopInfo.section;
    phase = 'tour';
    visitedSections.add(section);
    showTourDock(tour.index);
    const tier = crewTier(width());
    // A stacked Experience (phones, tablets, short screens) builds all three
    // chapters on its one stop: `stackWeight`.
    const stacked = stopInfo.stackWeight && stopInfo.chapter !== undefined && stopInfo.section.dataset.xp !== 'travel';
    const current = prepare('build', buildDuration(tier) * ((stacked ? stopInfo.stackWeight : stopInfo.weight) || 1));
    current.section = section;
    // `pace`: this stop's animation pace (travel and work), quicker than the
    // usual near-real time (only at tour timing, not the tests' short runs).
    if (stopInfo.pace && !config.buildDuration) current.anim = stopInfo.pace;
    if (stopInfo.frameMs) current.frameMs = stopInfo.frameMs * current.anim;
    current.waiting = tour.pending || new Map();
    current.wasHidden = tour.wasHidden || new Set();
    tour.pending = tour.wasHidden = null;
    const candidates = gather(current, stopInfo.jobs || [], section);
    // Everything else still to come in (this section and earlier ones).
    const gathered = gatherPool(current, poolScope());
    current.heading = section.querySelector('h2');
    current.light = !section.classList.contains('dark-section');
    const handoff = stopInfo.handoff ? section.querySelector(stopInfo.handoff) : null;
    const following = nextStop();
    const xp = travelStage(stopInfo);
    watchElements(current, [section, following?.section, current.heading, handoff, xp?.travel, stopInfo.spanTo && section.querySelector(stopInfo.spanTo), ...candidates]);
    measure(current);
    current.measurable = isMeasurable(current, [...current.watch]);
    if (xp && current.measurable) current.xp = { ...xp, top: current.sy0 + box(current, xp.travel).y };
    if (current.measurable) planScroll(current, stopInfo, following);
    if (stopInfo.columns) current.tracks = gridTracks(current, section.querySelector(stopInfo.columns));
    current.jobs = collect(current, stopInfo.jobs || [], section);
    current.jobs.forEach(job => { job.readyAt = readyAt(current, job.target, job.kind === 'paste' && current.xp ? 0.94 : null); });
    linkJobs(current);
    // A chapter's ghost is dragged while the stage slides it in, and lands
    // just before the chapter becomes the current one (experience.js flips
    // its counter once the chapter's left edge passes 40% of the stage), so
    // the counter never names a chapter that is still a blank ghost.
    current.jobs.forEach(job => {
      if (job.kind !== 'paste' || !current.xp || !current.measurable) return;
      const land = readyAt(current, job.target, XP_LAND);
      const work = clamp((Number.isFinite(land) ? land : current.lead || 0) - (job.readyAt || 0), 520, 900) * current.anim;
      job.baseWork = job.work = work;
    });
    current.pool = makePool(current, gathered);
    planWire(current, stopInfo);
    buildCrew(current);
    if (current.wire) settlePainter(current);
    if (handoff && (!current.measurable || willShow(current, handoff))) {
      current.handoffJob = createJob(current, { kind: 'review', role: 'orchestrator', act: 'handing off', size: true, color: '#e6eed6' }, handoff, []);
      current.handoffMs = handoffDuration;
      current.jobs.push(current.handoffJob);
    }
    buildStage(current);
    remeasureDots(current);
    planBuild(current, stopInfo);
    readyPool(current);
    if (current.wire) buildWire(current);
    if (stopInfo.note) addEvent(current, current.total * 0.5, () => showNote(stopInfo.note));
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
  // A `pick` job's click on a real control (the explorer's index).
  let pressing = false;
  function press(element) {
    pressing = true;
    try { element.click(); } catch { /* the control keeps its state */ }
    finally { pressing = false; }
  }
  const inDock = event => Boolean(dock && event.target?.closest?.('.agentic-dock'));
  const onKey = event => {
    lastInput = 'key';
    // Escape first closes the plan list; the tour keeps going.
    if (event.key === 'Escape' && planOpen) { setPlanOpen(false); if (dock?.root.contains(document.activeElement)) dock.toggle.focus({ preventScroll: true }); return; }
    // Tab between the dock's own controls is not the visitor leaving the tour.
    if (event.key === 'Tab' && inDock(event)) return;
    if ((event.key === 'Escape' || event.key === 'Tab') && (tour || phase !== 'ready' || sectionsEligible)) { stop(); return; }
    // Enter/Space on the dock's own buttons activate them; any other key is
    // the visitor taking over.
    if (tour && !inDock(event)) cancelTour();
  };
  const onTakeover = event => {
    if (event.type === 'pointerdown' || event.type === 'touchstart') lastInput = 'pointer';
    if (tour && !inDock(event)) cancelTour();
  };
  // Keyboard focus leaving the dock for the page ends the tour like Tab does.
  const onFocusIn = event => {
    if (!tour || inDock(event) || run?.stage.contains(event.target)) return;
    if (event.target === document.body || event.target === root || event.target === document) return;
    stop();
  };
  const onNavigate = event => {
    // The tour's own press on a control (kind `pick`) is not the visitor.
    if (pressing) return;
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
    // The tour's scroll model (px, px/s); how many jobs were shown early, how
    // many of those with no agent at all, and how many idle agents rescued.
    get scroll() { return { y: tourScroll.y, v: tourScroll.v, late: tour ? tour.late : 0, instant: tour ? tour.instant : 0, rescued: tour ? tour.rescued : 0 }; },
    get crewTier() { return crewTier(width()); },
    get crewSize() { return crewSize(width()); },
    whenTourEnds(callback) { if (tour) tourEndCallbacks.push(callback); else callback(); },
    skip: () => stop(),
    replay: () => startTour(true),
  };
}

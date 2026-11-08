// First-visit "agent crew" entrance.
//
// One orchestrator dispatches a crew of role-coloured subagents that appear to
// assemble the real, prebuilt hero. Everything is decorative choreography over
// existing content: no model, network or editor activity takes place, and the
// status strip only describes presentation stages and real animated targets.
//
// A single controller owns one stage, one rAF loop and one event timeline.
// Geometry is read in one batch (start, resize, scroll) and only transforms,
// opacity and clip insets are written per frame.

const VISIT_KEY = 'cesar:portfolio:agentic-intro:v1';
const HERO_MS = 4600;
const SECTION_MS = 1000;

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

// Subagents per viewport class (the orchestrator is one extra cursor).
export const CREWS = {
  desktop: { layout: 2, nav: 3, type: 3, copy: 3, art: 2, motion: 1, links: 2, a11y: 1, qa: 1 },
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

// Hero jobs, authored against a 4.6s baseline. `wave` is the earliest dispatch.
// `each` jobs are individual on desktop and grouped under `group` elsewhere.
const HERO_PLAN = [
  { sel: '.site-header', role: 'layout', kind: 'frame', wave: 420 },
  { sel: '#hero-title', role: 'layout', kind: 'frame', wave: 420 },
  { sel: '.hero-bottom', role: 'layout', kind: 'frame', wave: 420 },
  { sel: '.wordmark', role: 'nav', kind: 'reveal', wave: 470 },
  { sel: '.main-nav a', role: 'nav', kind: 'reveal', wave: 470, each: true, group: '.main-nav' },
  { sel: '.header-contact', role: 'nav', kind: 'reveal', wave: 470 },
  { sel: '.hero-kicker', role: 'copy', kind: 'type', wave: 600, charMs: 24 },
  { sel: '.hero-line > span', role: 'type', kind: 'type', wave: 820, each: true, charMs: 66 },
  { sel: '.hero-fade', role: 'type', kind: 'type', wave: 820, charMs: 66 },
  { sel: '.sculpture', role: 'art', kind: 'reveal', wave: 760, work: 720, art: true },
  { sel: '.orbit-label', role: 'art', kind: 'reveal', wave: 760 },
  { sel: '.art-coordinate', role: 'art', kind: 'reveal', wave: 760 },
  { sel: '.hero-intro .small-label', role: 'copy', kind: 'type', wave: 1050, charMs: 22 },
  { sel: '.hero-intro > p:not(.hero-scope)', role: 'copy', kind: 'wipe', wave: 1050 },
  { sel: '.hero-scope', role: 'copy', kind: 'wipe', wave: 1050 },
  { sel: '.scroll-cue', role: 'links', kind: 'reveal', wave: 1180 },
  { sel: '.hero-actions .pill-button', role: 'links', kind: 'reveal', wave: 1180 },
  { sel: '.hero-links a', role: 'links', kind: 'reveal', wave: 1180, each: true, group: '.hero-links' },
  { sel: '.hero-art', role: 'motion', kind: 'orbit', wave: 1650 },
  { sel: '.main-nav', role: 'a11y', kind: 'review', wave: 2150, size: true },
  { sel: '.hero-actions', role: 'a11y', kind: 'review', wave: 2150, size: true },
  { sel: '.hero-line', role: 'qa', kind: 'review', wave: 2250 },
  { sel: '.hero-intro', role: 'qa', kind: 'review', wave: 2250 },
];

// Lower-section passes only trace content (nothing is hidden). Targets stay
// within elements that the section reveal layer keeps still while tracing.
const SECTION_PLAN = [
  { sel: 'h2:not(.cinematic-copy h2)', role: 'type', kind: 'caret' },
  { sel: '.about-title-panel, .cinematic-art, .project-card:not([aria-hidden="true"]) .project-image-link', role: 'art', kind: 'frame', cross: true },
  { sel: '.cinematic-copy, .approach-heading > p', role: 'copy', kind: 'review' },
  { sel: '.section-top, .about-transition-meta, .cinematic-topline', role: 'layout', kind: 'frame' },
  { sel: '.scene-actions, .contact-button', role: 'links', kind: 'review', size: true },
  { sel: '.approach-list details, .capability-list, .role, .skill-list', role: 'qa', kind: 'review', multi: 2 },
];

const HIDES = new Set(['reveal', 'type', 'wipe']);
const OPTIONAL = new Set(['frame', 'review', 'orbit', 'caret']);
const TEXT_KINDS = new Set(['type', 'wipe', 'caret']);
const ZERO = { x: 0, y: 0, w: 0, h: 0 };
const SVG = '<svg viewBox="0 0 20 26" width="17" height="22" aria-hidden="true"><path d="M2.5 1.8v19.4l5.2-4.9 3.5 7.9 3.2-1.4-3.4-7.8h7.1z"/></svg>';

const clamp01 = value => (value < 0 ? 0 : value > 1 ? 1 : value);
const easeInOut = p => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
const easeOut = p => 1 - Math.pow(1 - p, 4);
const distance = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);
const positive = (value, fallback) => (Number.isFinite(value) && value > 0 ? value : fallback);

export function shouldPlayEntrance({ seen, reducedMotion, storageAvailable, hash, navigationType }) {
  return !seen && !reducedMotion && storageAvailable && (!hash || hash === '#home') && navigationType !== 'back_forward';
}

export function initAgenticEntrance(document, window, config = {}) {
  const hero = document.querySelector('#home');
  const idleStats = { agents: 0, cursors: 0, targets: 0, done: 0 };
  if (!hero) return { phase: 'ready', sectionsEligible: false, stats: idleStats, skip() {}, replay() {} };
  const heroDuration = positive(config.heroDuration, HERO_MS);
  const sectionDuration = positive(config.sectionDuration, SECTION_MS);
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
  let phase = 'ready';
  let sectionsEligible = false;
  let run = null;
  let observer;
  let destroyed = false;
  let currentSection = null;
  let frameHandle = 0;
  let frameIsRaf = false;
  let paused = false;
  let pausedAt = 0;
  let dirty = false;
  let lastStats = { ...idleStats };
  const visitedSections = new Set();

  const replayButton = document.createElement('button');
  replayButton.type = 'button';
  replayButton.className = 'agentic-replay';
  replayButton.dataset.agenticReplay = '';
  replayButton.textContent = 'Replay intro ↗';
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
      const t = clock() - current.start;
      if (dirty) { dirty = false; measure(current); current.version++; }
      while (current.next < current.events.length && current.events[current.next].at <= t) {
        current.events[current.next++].fn(t);
        if (run !== current) return;
      }
      current.active.forEach(job => job.update(t));
      current.agents.forEach(agent => placeAgent(current, agent, t));
      if (t >= current.total) {
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
    }
    run = null;
    currentSection = null;
    document.documentElement.classList.remove('agentic-running');
  }

  function persist() {
    try { storage?.setItem(VISIT_KEY, 'seen'); }
    catch { sectionsEligible = false; observer?.disconnect(); }
  }

  function stop(save = true) {
    const focusWasInStage = Boolean(run?.stage.contains(document.activeElement));
    sectionsEligible = false;
    observer?.disconnect();
    clearVisuals();
    phase = 'ready';
    replayButton.hidden = false;
    if (save) persist();
    if (focusWasInStage) {
      const heading = hero.querySelector('h1');
      heading?.setAttribute('tabindex', '-1');
      heading?.focus({ preventScroll: true });
    }
  }

  function statsOf(current) {
    const subagents = current.agents.filter(agent => agent.role !== 'orchestrator').length;
    return { agents: subagents, cursors: current.agents.length, targets: current.jobs.length, done: current.done };
  }

  // ---- geometry -----------------------------------------------------------
  function readRect(element) {
    const rect = element.getBoundingClientRect();
    return { x: rect.left, y: rect.top, w: rect.width, h: rect.height };
  }

  function readText(element) {
    const range = document.createRange?.();
    if (!range || typeof range.getBoundingClientRect !== 'function') return null;
    range.selectNodeContents(element);
    const box = range.getBoundingClientRect();
    if (!box.width && !box.height) return null;
    const lines = range.getClientRects?.() || [];
    const last = lines.length ? lines[lines.length - 1] : box;
    return { x: box.left, y: box.top, w: box.width, h: box.height, last: { x: last.left, y: last.top, w: last.width, h: last.height } };
  }

  // One batch of reads; nothing is written between them.
  function measure(current) {
    current.vw = window.innerWidth || 1024;
    current.vh = window.innerHeight || 768;
    current.watch.forEach(element => {
      const entry = readRect(element);
      if (current.textTargets.has(element)) entry.text = readText(element);
      current.cache.set(element, entry);
    });
    current.dots.forEach(dot => current.cache.set(dot, readRect(dot)));
  }

  const box = (current, element) => current.cache.get(element) || ZERO;
  const textBox = (current, element) => current.cache.get(element)?.text || box(current, element);
  const isMeasurable = (current, elements) => elements.some(element => { const r = box(current, element); return r.w > 0 || r.h > 0; });
  const inView = (current, element) => { const r = box(current, element); return r.w > 0 && r.h > 0 && r.y < current.vh && r.y + r.h > 0; };
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

  function buildStage(current, scopeLabel) {
    const stage = make('div', `agentic-stage${current.kind === 'section' ? ' is-section' : ''}`);
    const decoration = make('div', 'agentic-decoration', stage);
    decoration.setAttribute('aria-hidden', 'true');
    make('div', 'agentic-veil', decoration);
    current.layer = make('div', 'agentic-layer', decoration);
    current.cursorLayer = make('div', 'agentic-cursors', decoration);
    const status = make('div', 'agentic-status', decoration);
    const dots = make('span', 'agentic-dots', status);
    const log = make('span', 'agentic-log', status);
    const subagents = current.agents.filter(agent => agent.role !== 'orchestrator').length;
    log.innerHTML = '<span class="agentic-log-orch">orchestrator · </span><span class="agentic-log-agents"></span><span> · </span><span class="agentic-log-scope"></span><span class="agentic-log-done">0</span>/<span class="agentic-log-total"></span><span class="agentic-log-stage"></span>';
    log.querySelector('.agentic-log-agents').textContent = `${subagents} subagent${subagents === 1 ? '' : 's'}`;
    log.querySelector('.agentic-log-scope').textContent = `${scopeLabel} `;
    log.querySelector('.agentic-log-total').textContent = String(current.jobs.length);
    current.logDone = log.querySelector('.agentic-log-done');
    current.logStage = log.querySelector('.agentic-log-stage');
    current.agents.forEach(agent => {
      const info = ROLES[agent.role];
      agent.dot = make('i', `agentic-dot${agent.role === 'orchestrator' ? ' is-orchestrator' : ''}`, dots);
      agent.dot.style.setProperty('--agent-color', info.color);
      const cursor = make('div', `agentic-cursor${agent.role === 'orchestrator' ? ' is-orchestrator' : ''}`, current.cursorLayer);
      cursor.style.setProperty('--agent-color', info.color);
      const body = make('div', 'agentic-cursor-body', cursor);
      body.innerHTML = SVG;
      make('span', 'agentic-role', body).textContent = agent.label;
      agent.cursor = cursor;
      current.dots.push(agent.dot);
    });
    const skip = make('button', 'agentic-skip', stage);
    skip.type = 'button';
    skip.dataset.agenticSkip = '';
    skip.textContent = 'Skip intro ↗';
    skip.addEventListener('click', () => stop());
    // Phones dock the log under the fixed header instead of over hero actions.
    const header = current.header && current.cache.get(current.header);
    if (header?.h) stage.style.setProperty('--agentic-dock-top', `${Math.round(header.y + header.h + 8)}px`);
    current.stage = stage;
    document.body.append(stage);
  }

  function setStage(current, text) {
    const value = text ? ` · ${text}` : '';
    if (current.logStage.textContent !== value) current.logStage.textContent = value;
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

  // ---- jobs ---------------------------------------------------------------
  function createJob(current, spec, target, reveals) {
    const job = { ...spec, target, reveals, agent: null, ui: [] };
    const s = current.scale;
    const r = () => box(current, target);
    const text = () => textBox(current, target);
    const chars = Math.max(1, (target.textContent || '').trim().length);
    const typeMs = Math.min(760, Math.max(300, chars * (spec.charMs || 40)));
    const section = current.kind === 'section';
    const workMs = {
      frame: section ? 280 : 430,
      reveal: spec.work || 380,
      type: typeMs + 200,
      wipe: 580,
      orbit: 1050,
      review: section ? 280 : 440,
      caret: 300,
    }[spec.kind];
    job.baseWork = workMs * s;
    job.baseType = typeMs * s;
    job.work = job.baseWork;
    job.typeMs = job.baseType;
    job.chars = chars;
    job.entry = () => {
      const b = r();
      if (spec.kind === 'frame' || spec.kind === 'review') { const v = visible(current, target); return { x: v.x + 2, y: v.y + 2 }; }
      if (spec.kind === 'type') { const t = text(); return { x: t.x, y: t.y + t.h * 0.92 }; }
      if (spec.kind === 'wipe') { const t = text(); return { x: t.x, y: t.y + t.h * 0.5 }; }
      if (spec.kind === 'orbit') return { x: b.x + b.w * 0.5 + b.w * 0.42, y: b.y + b.h * 0.42 };
      if (spec.kind === 'caret') { const l = text().last || text(); return { x: l.x + l.w + 6, y: l.y + l.h * 0.8 }; }
      return { x: b.x + Math.min(18, b.w * 0.25), y: b.y + b.h * 0.58 };
    };
    job.cursorAt = p => {
      const b = r();
      if (spec.kind === 'frame' || spec.kind === 'review') {
        const v = visible(current, target);
        const e = spec.kind === 'frame' ? easeInOut(p) : easeOut(p);
        return { x: v.x + 2 + (v.w - 4) * e, y: v.y + 2 + (v.h - 4) * e };
      }
      if (spec.kind === 'type') {
        const t = text();
        const step = Math.floor(clamp01(job.typeProgress ?? 0) * job.chars) / job.chars;
        return { x: t.x + t.w * step + 4, y: t.y + t.h * 0.92 + 6 };
      }
      if (spec.kind === 'wipe') { const t = text(); return { x: t.x + t.w * easeInOut(p), y: t.y + t.h * 0.5 }; }
      if (spec.kind === 'orbit') {
        const angle = easeInOut(p) * Math.PI * 2;
        return { x: b.x + b.w * 0.5 + Math.cos(angle) * b.w * 0.42, y: b.y + b.h * 0.42 + Math.sin(angle) * b.h * 0.3 };
      }
      if (spec.kind === 'caret') { const start = job.entry(); return { x: start.x + 10 * easeOut(p), y: start.y + 6 * easeOut(p) }; }
      const start = job.entry();
      return { x: start.x + b.w * 0.42 * easeInOut(p), y: start.y + b.h * 0.06 * easeInOut(p) };
    };
    job.exit = () => job.cursorAt(1);

    const color = () => ROLES[job.agent.role].color;
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
      const kind = spec.kind;
      job.agent.dot.classList.add('is-active');
      if (kind === 'frame') {
        job.frame = frame(`is-drag${spec.cross ? ' has-cross' : ''}`);
        job.frame.style.scale = '0.001';
      } else if (kind === 'review') {
        job.frame = frame('is-review');
      } else if (kind === 'orbit') {
        job.frame = frame('is-orbit has-cross is-coord is-set');
      } else {
        job.frame = frame(TEXT_KINDS.has(kind) ? 'is-text is-set' : 'is-set');
      }
      if (kind === 'type' || kind === 'caret') {
        job.caret = make('div', `agentic-caret${kind === 'caret' ? ' is-idle' : ''}`, current.layer);
        job.caret.style.setProperty('--agent-color', color());
        job.ui.push(job.caret);
      }
      reveals.forEach((element, index) => {
        if (kind === 'reveal') {
          element.style.setProperty('--agentic-d', `${Math.round(Math.max(60, job.work))}ms`);
          if (reveals.length > 1) element.style.transitionDelay = `${Math.round(index * 45 * s)}ms`;
          element.dataset.buildState = 'placing';
        } else {
          element.dataset.buildState = 'typing';
        }
      });
      if (kind === 'type' || kind === 'wipe') { lastStep = -1; job.typeProgress = 0; writeClip(0); }
      version = -1;
      job.update(job.arrive);
    };

    function writeClip(progress) {
      const b = r();
      const t = text();
      const left = t.x - b.x;
      const right = Math.max(0, b.w - (left + t.w * progress));
      target.style.clipPath = `inset(-0.32em ${right.toFixed(1)}px -0.32em -0.12em)`;
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
          writeClip(step / job.chars);
          const t = text();
          job.caret.style.translate = `${t.x + t.w * (step / job.chars)}px ${t.y + t.h * 0.08}px`;
          job.caret.style.height = `${t.h * 0.84}px`;
        }
        if (progress >= 1 && !job.caret.classList.contains('is-idle')) job.caret.classList.add('is-idle');
      } else if (spec.kind === 'wipe') {
        writeClip(easeInOut(p));
      } else if (spec.kind === 'caret' && geometryChanged) {
        const l = text().last || text();
        job.caret.style.translate = `${l.x + l.w + 3}px ${l.y + l.h * 0.1}px`;
        job.caret.style.height = `${l.h * 0.8}px`;
      }
    };

    job.finish = () => {
      job.agent.dot.classList.remove('is-active');
      reveals.forEach(element => cleanTarget(element));
      if (current.kind === 'section') target.dataset.buildState = 'tracing';
      job.ui.forEach(element => { if (element !== job.frame) element.remove(); });
      if (spec.kind !== 'frame') job.frame?.classList.add('is-out');
    };
    return job;
  }

  // ---- planning -----------------------------------------------------------
  function travelMs(current, from, to) {
    const ms = Math.min(current.kind === 'section' ? 260 : 560, Math.max(current.kind === 'section' ? 200 : 240, 230 + distance(from, to) * 0.3));
    return ms * current.scale;
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
      if (index > 0) t = Math.max(t, job.wave * current.scale);
      job.start = t;
      job.arrive = t + travelMs(current, position, entry) * factor;
      job.work = job.baseWork * factor;
      job.typeMs = job.baseType * factor;
      job.end = job.arrive + job.work;
      t = job.end + 70 * current.scale;
      position = job.exit();
    });
    return t;
  }

  function planHero(current) {
    const s = current.scale;
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
    addEvent(current, 0, () => orchestrator.cursor.classList.add('is-in', 'is-working'));

    const builderDeadline = 2750 * s;
    const reviewDeadline = 3750 * s;
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
        agent.queue.sort((a, b) => a.wave - b.wave);
        const roleIndex = byRole.get(agent.role).indexOf(agent);
        let firstStart = Math.max(popAt + 400 * s, agent.queue[0].wave * s + roleIndex * 70 * s);
        let from = ring();
        if (firstStart > 1150 * s) {
          // Wait beside the orchestrator until dispatched; phones use the
          // right margin so idle cursors stay clear of the dock.
          const k = queued++;
          const slot = current.tier === 'phone'
            ? () => { const o = orchPoint(); return { x: current.vw - 26, y: o.y + 34 + k * 30 }; }
            : () => { const o = orchPoint(); return { x: o.x + 34 + k * 30, y: o.y - 30 - (k % 2) * 12 }; };
          travelSeg(agent, 780 * s, 1150 * s, slot);
          from = slot();
          firstStart = Math.max(firstStart, 1160 * s);
        }
        const mustFinish = agent.queue.some(job => HIDES.has(job.kind));
        const deadline = mustFinish ? builderDeadline : reviewDeadline;
        let factor = 1;
        let free = simulate(current, agent, firstStart, from, factor);
        if (free > deadline) {
          // Gaps between jobs are fixed; only travel and work compress.
          const gaps = agent.queue.length * 70 * s;
          factor = Math.max(0.55, (deadline - firstStart - gaps) / Math.max(1, free - firstStart - gaps));
          free = simulate(current, agent, firstStart, from, factor);
        }
        while (free > deadline && agent.queue.some(job => OPTIONAL.has(job.kind))) {
          const drop = [...agent.queue].reverse().find(job => OPTIONAL.has(job.kind));
          agent.queue.splice(agent.queue.indexOf(drop), 1);
          current.jobs.splice(current.jobs.indexOf(drop), 1);
          free = simulate(current, agent, firstStart, from, factor);
        }
        if (free > deadline) {
          const gaps = agent.queue.length * 70 * s;
          factor *= Math.max(0.1, (deadline - firstStart - gaps) / Math.max(1, free - firstStart - gaps));
          free = simulate(current, agent, firstStart, from, factor);
        }
        agent.queue.forEach((job, jobIndex) => {
          travelSeg(agent, job.start, job.arrive, job.entry);
          workSeg(agent, job);
          if (jobIndex === 0) {
            addEvent(current, job.start, now => dispatchLine(current, orchestrator, agent, job, now));
          }
          addEvent(current, job.start, () => { agent.dot.classList.add('is-active'); agent.cursor.classList.add('is-working'); });
          addEvent(current, job.arrive, now => { job.begin(now); current.active.add(job); });
          addEvent(current, job.end, () => completeJob(current, job));
          if (job.kind === 'frame') {
            addEvent(current, job.end + 620 * s, () => job.frame?.classList.add('is-out'));
          }
        });
        agent.dockAt = free + 80 * s + travelMs(current, agent.queue[agent.queue.length - 1].exit(), dotPoint(current, agent));
        travelSeg(agent, free + 80 * s, agent.dockAt, () => dotPoint(current, agent));
        addEvent(current, free + 80 * s, () => agent.cursor.classList.remove('is-working'));
      }
      addEvent(current, agent.dockAt, () => dock(agent));
      latestDock = Math.max(latestDock, agent.dockAt);
    });
    // Orchestrator reports last, then the strip collapses.
    const orchDock = Math.min(current.total * 0.9, latestDock + 160 * s);
    travelSeg(orchestrator, Math.max(orchArrive, orchDock - 520 * s), orchDock, () => dotPoint(current, orchestrator));
    addEvent(current, orchDock, () => dock(orchestrator));
    addEvent(current, 0, () => setStage(current, 'plan'));
    addEvent(current, 330 * s, () => { current.stage.classList.add('is-assembling'); setStage(current, 'dispatch'); });
    const firstBuild = Math.min(...current.jobs.map(job => job.arrive).filter(Number.isFinite), Infinity);
    if (Number.isFinite(firstBuild)) addEvent(current, firstBuild, () => setStage(current, 'build'));
    const firstReview = Math.min(...current.jobs.filter(job => job.kind === 'review').map(job => job.start), Infinity);
    if (Number.isFinite(firstReview)) addEvent(current, firstReview, () => setStage(current, 'review'));
    addEvent(current, Math.max(latestDock - 200 * s, 0), () => setStage(current, 'handoff'));
    addEvent(current, orchDock - 300 * s, () => orchestrator.cursor.classList.remove('is-working'));
    // End as soon as the crew has reported back (never later than the budget).
    const leaveAt = orchDock + 80 * s;
    current.total = Math.min(current.total, leaveAt + 360 * s);
    addEvent(current, leaveAt, () => current.stage.classList.add('is-leaving'));
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
      addEvent(current, job.start, () => { agent.dot.classList.add('is-active'); agent.cursor.classList.add('is-working'); });
      addEvent(current, job.arrive, now => { job.begin(now); current.active.add(job); });
      addEvent(current, job.end, () => completeJob(current, job));
      addEvent(current, job.end + 90 * s, () => job.frame?.classList.add('is-out'));
      addEvent(current, job.end + 30 * s, () => agent.cursor.classList.remove('is-working'));
      agent.dockAt = Math.min(current.total - 70 * s, job.end + 30 * s + 210 * s);
      travelSeg(agent, job.end + 30 * s, agent.dockAt, home);
      addEvent(current, agent.dockAt, () => dock(agent));
    });
    addEvent(current, 0, () => setStage(current, 'trace'));
    addEvent(current, current.total - 90 * s, () => current.stage.classList.add('is-leaving'));
  }

  function completeJob(current, job) {
    if (current.active.has(job)) job.update(job.end);
    current.active.delete(job);
    job.finish();
    current.done++;
    current.logDone.textContent = String(current.done);
  }

  function dock(agent) {
    agent.cursor.classList.add('is-docked');
    agent.dot.classList.remove('is-active');
    agent.dot.classList.add('is-done');
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
    const at = now + 620 * current.scale;
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
    const flip = x > current.vw - 110;
    if (flip !== agent.flip) { agent.flip = flip; agent.cursor.classList.toggle('is-flip', flip); }
    agent.cursor.style.transform = `translate3d(${(x - 2).toFixed(1)}px,${(y - 1.5).toFixed(1)}px,0)`;
  }

  // ---- runs ---------------------------------------------------------------
  function collect(current, plan, root, cap) {
    const jobs = [];
    const used = new Set();
    const push = (spec, target, reveals) => {
      if (!target || used.has(target)) return;
      used.add(target);
      jobs.push(createJob(current, spec, target, reveals));
    };
    plan.forEach(spec => {
      const nodes = [...root.querySelectorAll(spec.sel)];
      if (!nodes.length) return;
      if (current.kind === 'section') {
        nodes.filter(node => !used.has(node) && (!current.measurable || inView(current, node)))
          .slice(0, spec.multi || 1)
          .forEach(node => push(spec, node, []));
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

  function prepare(kind, duration) {
    const current = {
      kind,
      tier: crewTier(window.innerWidth || 1024),
      total: duration,
      scale: duration / (kind === 'hero' ? HERO_MS : SECTION_MS),
      cache: new Map(),
      version: 0,
      events: [],
      next: 0,
      active: new Set(),
      marked: new Set(),
      agents: [],
      jobs: [],
      dots: [],
      watch: new Set(),
      textTargets: new Set(),
      done: 0,
      measurable: true,
      header: document.querySelector('.site-header'),
    };
    if (current.header) current.watch.add(current.header);
    return current;
  }

  function watchElements(current, elements, textual) {
    elements.forEach(element => {
      if (!element) return;
      current.watch.add(element);
      if (textual) current.textTargets.add(element);
    });
  }

  function launch(current, onComplete) {
    current.onComplete = onComplete;
    current.events.sort((a, b) => a.at - b.at);
    current.jobs.forEach(job => {
      current.marked.add(job.target);
      job.target.dataset.agenticJob = job.kind;
      job.reveals.forEach(element => {
        current.marked.add(element);
        element.classList.add('agentic-target');
        if (job.art) element.dataset.buildKind = 'art';
        element.dataset.buildState = 'pending';
      });
      if (current.kind === 'section') job.target.dataset.buildState = 'tracing';
    });
    current.logDone.textContent = '0';
    lastStats = statsOf(current);
    run = current;
    document.documentElement.classList.add('agentic-running');
    current.start = clock();
    current.agents.forEach(agent => placeAgent(current, agent, 0));
    schedule();
  }

  function startHero(replay = false) {
    if (destroyed || media?.matches) { stop(false); return; }
    observer?.disconnect();
    clearVisuals();
    sectionsEligible = !replay;
    phase = 'hero';
    replayButton.hidden = true;
    if (replay) {
      document.documentElement.classList.add('agentic-running');
      hero.scrollIntoView?.({ behavior: 'auto', block: 'start' });
    }
    const current = prepare('hero', heroDuration);
    // Read every candidate in one batch before anything is written.
    const candidates = new Set();
    HERO_PLAN.forEach(spec => {
      document.querySelectorAll(spec.sel).forEach(node => {
        candidates.add(node);
        if (TEXT_KINDS.has(spec.kind)) current.textTargets.add(node);
      });
      if (spec.group) candidates.add(document.querySelector(spec.group));
    });
    const kicker = document.querySelector('.hero-kicker');
    watchElements(current, [...candidates, kicker].filter(Boolean), false);
    measure(current);
    current.measurable = isMeasurable(current, [...current.watch]);
    current.jobs = collect(current, HERO_PLAN, document);
    const counts = CREWS[current.tier];
    current.agents.push(makeAgent('orchestrator', 1, 1, 0));
    Object.keys(ROLES).forEach(role => {
      const count = counts[role] || 0;
      for (let n = 1; n <= count; n++) current.agents.push(makeAgent(role, n, count, current.agents.length));
    });
    buildStage(current, 'hero');
    current.dots.forEach(dot => current.cache.set(dot, readRect(dot)));
    planHero(current);
    current.stage.querySelector('.agentic-log-total').textContent = String(current.jobs.length);
    launch(current, () => {
      phase = 'ready';
      persist();
      replayButton.hidden = false;
      watchSections();
    });
  }

  function startSection(section) {
    const current = prepare('section', sectionDuration);
    const candidates = new Set();
    SECTION_PLAN.forEach(spec => {
      section.querySelectorAll(spec.sel).forEach(node => {
        candidates.add(node);
        if (TEXT_KINDS.has(spec.kind)) current.textTargets.add(node);
      });
    });
    if (!candidates.size) return false;
    watchElements(current, [...candidates], false);
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
    buildStage(current, section.id || 'section');
    current.dots.forEach(dot => current.cache.set(dot, readRect(dot)));
    planSection(current);
    phase = 'section';
    launch(current, () => { phase = 'ready'; });
    currentSection = section;
    return true;
  }

  function watchSections() {
    if (!sectionsEligible || !window.IntersectionObserver) return;
    observer = new window.IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!sectionsEligible) return;
        if (!entry.isIntersecting) {
          if (entry.target === currentSection) { clearVisuals(); phase = 'ready'; }
          return;
        }
        if (visitedSections.has(entry.target)) return;
        visitedSections.add(entry.target);
        try { startSection(entry.target); }
        catch { clearVisuals(); phase = 'ready'; }
      });
    }, { threshold: 0.18 });
    document.querySelectorAll('main > section[id]:not(#home), footer[id]').forEach(section => observer.observe(section));
  }

  // ---- visitor input ------------------------------------------------------
  const onKey = event => { if ((event.key === 'Escape' || event.key === 'Tab') && (phase !== 'ready' || sectionsEligible)) stop(); };
  const onNavigate = event => {
    if (event.target.closest?.('[data-agentic-skip], [data-agentic-replay]')) return;
    if ((phase !== 'ready' || sectionsEligible) && event.target.closest?.('a, button, summary, input, select, textarea')) stop();
  };
  const onGeometry = () => {
    if (phase === 'hero' && window.scrollY > 80) { stop(); return; }
    if (run) dirty = true;
  };
  const onVisibility = () => {
    if (!run) return;
    if (document.hidden) {
      if (paused) return;
      paused = true;
      pausedAt = clock();
      cancelFrame();
    } else if (paused) {
      run.start += clock() - pausedAt;
      paused = false;
      dirty = true;
      schedule();
    }
  };
  const onMotion = () => { replayButton.disabled = Boolean(media?.matches); if (media?.matches) stop(); };
  const onPageHide = event => {
    stop(false);
    if (event.persisted) return;
    destroyed = true;
    document.removeEventListener('keydown', onKey, true);
    document.removeEventListener('click', onNavigate, true);
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('scroll', onGeometry);
    window.removeEventListener('resize', onGeometry);
    window.removeEventListener('pagehide', onPageHide);
    media?.removeEventListener?.('change', onMotion);
  };
  document.addEventListener('keydown', onKey, true);
  document.addEventListener('click', onNavigate, true);
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('scroll', onGeometry, { passive: true });
  window.addEventListener('resize', onGeometry);
  window.addEventListener('pagehide', onPageHide);
  media?.addEventListener?.('change', onMotion);
  replayButton.addEventListener('click', () => startHero(true));
  const eligible = shouldPlayEntrance({ seen, reducedMotion: Boolean(media?.matches), storageAvailable: Boolean(storage), hash: window.location.hash, navigationType });
  try { if (eligible) startHero(); else replayButton.hidden = false; }
  catch { stop(false); }
  return {
    get phase() { return phase; },
    get sectionsEligible() { return sectionsEligible; },
    get paused() { return paused; },
    get stats() { return run ? statsOf(run) : { ...lastStats }; },
    skip: () => stop(),
    replay: () => startHero(true),
  };
}

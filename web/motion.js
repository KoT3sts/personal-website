// Section reveals and idle-loop control. Progressive enhancement only:
// content is complete and visible without this file, and nothing the visitor
// can already see is ever hidden.

// Elements the first-visit entrance traces with cursor frames (mirrors the
// selector in entrance.js). While it may still trace sections, these elements
// and their ancestors keep a stable position so frames stay aligned.
export const ENTRANCE_TRACED = '.section-top, h2, .cinematic-art, .cinematic-copy, .scene-actions, .project-image-link, .approach-heading > p, details, .contact-button';

// [selector, variant]. Variants differ only in travel distance and scale.
export const REVEAL_GROUPS = [
  ['.capabilities-heading > h2', 'heading'], ['.capabilities-heading > p', 'rise'], ['.capability', 'rise'],
  ['.experience-heading > h2', 'heading'], ['.experience-heading > p', 'rise'], ['.role-header', 'rise'], ['.role-group', 'rise'],
  ['.work-heading > h2', 'heading'], ['.work-heading > p', 'rise'], ['.gallery-stage', 'stage'], ['.gallery-controls', 'rise'], ['.project-selectors', 'rise'],
  ['.skills-layout > h2', 'heading'], ['.skill-list > div', 'rise'], ['.education-layout > *', 'rise'],
  ['.approach-heading > h2', 'heading'], ['.approach-heading > p', 'rise'], ['.approach-list details', 'rise'],
  ['.closing-note > .mono', 'rise'], ['.closing-note > p', 'heading'],
  ['.contact-intro', 'rise'], ['#contact-title', 'heading'], ['.contact-button', 'rise'], ['.contact-links li', 'rise'],
];

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

export function isEntranceTracing(entrance, root) {
  if (root?.classList?.contains('agentic-running')) return true;
  return Boolean(entrance && (entrance.sectionsEligible || (entrance.phase && entrance.phase !== 'ready')));
}

export function initMotion(document, window, { entrance } = {}) {
  const root = document.documentElement;
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  const pending = new Set();
  const timers = new Set();
  const loopState = new Map();
  let revealObserver = null;
  let loopObserver = null;
  let sceneObserver = null;

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
      const id = window.setTimeout(() => { timers.delete(id); clearReveal(element); }, delay + 1300);
      timers.add(id);
    });
  }

  function markReveals() {
    if (reduce?.matches || !window.IntersectionObserver) return;
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
    if (reduce?.matches || !window.IntersectionObserver) return;
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

  // Idle loops (sculpture float, note orbit, contact glow) run only on screen
  // and while the page is visible.
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

  const onFocus = event => {
    const held = event.target.closest?.('[data-reveal="pending"]');
    if (held) revealNow(held);
  };
  const onMotion = () => { if (reduce?.matches) revealAll(); };
  const onBeforePrint = () => revealAll();

  function settle() {
    try { markReveals(); markScenes(); }
    catch { revealAll(); }
  }

  watchLoops();
  document.addEventListener('visibilitychange', onVisibility);
  document.addEventListener('focusin', onFocus);
  reduce?.addEventListener?.('change', onMotion);
  window.addEventListener('beforeprint', onBeforePrint);

  // Measure after load so restored scroll positions and deep links are known.
  const raf = window.requestAnimationFrame?.bind(window) || (callback => window.setTimeout(callback, 0));
  if (document.readyState === 'complete') raf(settle);
  else window.addEventListener('load', () => raf(settle), { once: true });

  return {
    get pending() { return pending.size; },
    revealAll,
    destroy() {
      revealAll();
      timers.forEach(id => window.clearTimeout(id));
      loopObserver?.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      document.removeEventListener('focusin', onFocus);
      reduce?.removeEventListener?.('change', onMotion);
      window.removeEventListener('beforeprint', onBeforePrint);
    },
  };
}

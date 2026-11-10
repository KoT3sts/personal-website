// Experience chapters (SPECIFICATION V05). Progressive enhancement only:
// without this file (or on phones, short screens, with reduced motion) the
// chapters stack and read top to bottom.
//
// Travel mode: the stage pins while the page scrolls through a wrapper that is
// one stage tall plus the travel distance; the scroll position moves the track
// sideways. A CSS scroll timeline drives `--xp-p` (0..1) where supported; here
// the same value is read from the wrapper's position to mark the current
// chapter, drive the controls and, where scroll timelines are missing, set
// `--xp-p` itself. Vertical scrolling is never captured: the pinned stretch is
// ordinary page height.

const TRAVEL_MEDIA = '(min-width: 761px) and (min-height: 600px) and (prefers-reduced-motion: no-preference)';
// Pinned scroll per chapter, in stage heights (the track may move farther).
const DISTANCE_PER_CHAPTER = 0.85;
// A chapter is current once its left edge passes this share of the stage.
const CURRENT_LINE = 0.4;
// A chapter has arrived once its left edge passes this share of the stage.
const REACH_LINE = 0.94;

export function initExperience(document, window) {
  const section = document.querySelector('#experience');
  const travel = section?.querySelector('.xp-travel');
  const stage = travel?.querySelector('.xp-stage');
  const track = stage?.querySelector('.xp-track');
  const chapters = track ? [...track.querySelectorAll('.xp-chapter')] : [];
  if (!section || !travel || !stage || !track || !chapters.length) return null;

  const controls = stage.querySelector('.xp-controls');
  const indexButtons = [...stage.querySelectorAll('[data-xp-go]')];
  const stepButtons = [...stage.querySelectorAll('[data-xp-step]')];
  const counter = stage.querySelector('.xp-count-current');
  const media = window.matchMedia?.(TRAVEL_MEDIA);
  const timeline = Boolean(window.CSS?.supports?.('animation-timeline: view()') && window.CSS.supports('animation-range: contain 0% contain 100%'));
  const raf = window.requestAnimationFrame?.bind(window) || (fn => window.setTimeout(fn, 16));
  const pad = n => String(n + 1).padStart(2, '0');

  const state = { mode: 'stack', shift: 0, distance: 0, stageW: 0, lefts: [], stops: [], current: -1, frame: 0, measureFrame: 0 };

  function setMode(mode) {
    state.mode = mode;
    if (mode === 'travel') {
      section.dataset.xp = 'travel';
      if (!timeline) section.dataset.xpDriver = 'script';
      chapters.forEach(chapter => chapter.setAttribute('tabindex', '0'));
      if (controls) controls.hidden = false;
    } else {
      delete section.dataset.xp;
      delete section.dataset.xpDriver;
      ['--xp-shift', '--xp-distance', '--xp-tail'].forEach(name => section.style.removeProperty(name));
      travel.style.removeProperty('--xp-p');
      chapters.forEach(chapter => {
        chapter.removeAttribute('tabindex');
        chapter.removeAttribute('data-reached');
        chapter.classList.remove('is-current');
        chapter.style.removeProperty('--xp-at');
      });
      if (controls) controls.hidden = true;
      state.current = -1;
    }
  }

  // Everything below the pinned header line must fit above the controls;
  // otherwise the chapters stack (a short window, a long translation).
  // (Columns stretch to the chapter's content box, which ends at the controls.)
  function fits() {
    return [...track.querySelectorAll('.xp-head, .xp-group')].every(column => column.scrollHeight <= column.clientHeight + 1);
  }

  function measure() {
    state.measureFrame = 0;
    if (!media?.matches) { if (state.mode !== 'stack') setMode('stack'); return; }
    if (state.mode !== 'travel') setMode('travel');
    // Measure at rest: the track's own offsets do not depend on --xp-p.
    const stageW = stage.clientWidth;
    const vh = stage.clientHeight || window.innerHeight || 800;
    if (!(stageW > 0) || !fits()) { setMode('stack'); return; }
    // Room after the last chapter so the travel ends with it at the gutter,
    // not with a sliver of the previous chapter at the left edge.
    const gutter = parseFloat(window.getComputedStyle(track).paddingLeft) || 0;
    const last = chapters[chapters.length - 1];
    section.style.setProperty('--xp-tail', `${Math.max(gutter, Math.round(stageW - gutter - last.offsetWidth))}px`);
    const trackW = track.scrollWidth;
    const first = chapters[0].offsetLeft;
    state.stageW = stageW;
    state.shift = Math.max(0, trackW - stageW);
    state.lefts = chapters.map(chapter => chapter.offsetLeft);
    state.stops = state.lefts.map(left => Math.min(Math.max(0, left - first), state.shift));
    state.distance = state.shift ? Math.round(Math.min(state.shift, chapters.length * DISTANCE_PER_CHAPTER * vh)) : 0;
    section.style.setProperty('--xp-shift', `${state.shift}px`);
    section.style.setProperty('--xp-distance', `${state.distance}px`);
    chapters.forEach((chapter, index) => chapter.style.setProperty('--xp-at', state.shift ? (state.stops[index] / state.shift).toFixed(4) : '0'));
    update();
  }

  // Progress through the pinned stretch, from the wrapper's position.
  function progress() {
    const r = travel.getBoundingClientRect();
    const range = r.height - (stage.clientHeight || window.innerHeight || 0);
    if (!(range > 0)) return r.top < 0 ? 1 : 0;
    return Math.min(1, Math.max(0, -r.top / range));
  }

  function update() {
    state.frame = 0;
    if (state.mode !== 'travel') return;
    const p = progress();
    if (!timeline) travel.style.setProperty('--xp-p', p.toFixed(4));
    const x = p * state.shift;
    const first = state.lefts[0] || 0;
    let current = 0;
    state.stops.forEach((stop, index) => { if (stop <= x + state.stageW * CURRENT_LINE) current = index; });
    if (p >= 0.999) current = chapters.length - 1;
    chapters.forEach((chapter, index) => {
      const left = state.lefts[index] - first - x;
      chapter.toggleAttribute('data-reached', index === 0 || left < state.stageW * REACH_LINE);
    });
    if (current === state.current) return;
    state.current = current;
    chapters.forEach((chapter, index) => chapter.classList.toggle('is-current', index === current));
    indexButtons.forEach((button, index) => {
      if (index === current) button.setAttribute('aria-current', 'true');
      else button.removeAttribute('aria-current');
    });
    stepButtons.forEach(button => {
      const step = Number(button.dataset.xpStep);
      const target = current + step;
      button.setAttribute('aria-disabled', String(target < 0 || target >= chapters.length));
    });
    if (counter) counter.textContent = pad(current);
  }

  const schedule = () => { if (!state.frame && state.mode === 'travel') state.frame = raf(update); };
  const remeasure = () => { if (!state.measureFrame) state.measureFrame = raf(measure); };

  // The page scroll position that shows chapter `index` at the stage's left.
  function scrollTargetFor(index) {
    const r = travel.getBoundingClientRect();
    const top = (window.scrollY || window.pageYOffset || 0) + r.top;
    const share = state.shift ? state.stops[index] / state.shift : 0;
    return Math.round(top + share * state.distance);
  }

  function goTo(index, { behavior = 'smooth' } = {}) {
    if (state.mode !== 'travel') return;
    const target = Math.max(0, Math.min(chapters.length - 1, index));
    window.scrollTo({ top: scrollTargetFor(target), behavior });
  }

  indexButtons.forEach(button => button.addEventListener('click', () => goTo(Number(button.dataset.xpGo))));
  stepButtons.forEach(button => button.addEventListener('click', () => {
    if (button.getAttribute('aria-disabled') === 'true') return;
    goTo(Math.max(0, state.current) + Number(button.dataset.xpStep));
  }));

  // Keyboard: focus on (or inside) a chapter brings that chapter into view;
  // Left/Right arrows move between chapters while one has focus.
  track.addEventListener('focusin', event => {
    if (state.mode !== 'travel') return;
    const index = chapters.findIndex(chapter => chapter.contains(event.target));
    if (index < 0) return;
    const y = scrollTargetFor(index);
    if (Math.abs((window.scrollY || 0) - y) > 2) goTo(index);
  });
  track.addEventListener('keydown', event => {
    if (state.mode !== 'travel' || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    const index = chapters.indexOf(event.target);
    if (index < 0) return;
    const next = chapters[index + (event.key === 'ArrowRight' ? 1 : -1)];
    if (!next) return;
    event.preventDefault();
    next.focus();
  });

  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', remeasure);
  media?.addEventListener?.('change', remeasure);
  // Web fonts change line lengths and so whether the chapters fit.
  document.fonts?.ready?.then(remeasure, () => {});
  window.addEventListener('load', remeasure, { once: true });

  measure();
  return {
    get mode() { return state.mode; },
    get current() { return state.current; },
    goTo,
    refresh: measure,
  };
}

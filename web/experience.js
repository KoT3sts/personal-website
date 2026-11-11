// Experience chapters (SPECIFICATION V05). Progressive enhancement only:
// without this file (or on phones, short screens, with reduced motion) the
// chapters stack and read top to bottom.
//
// Travel mode: the stage pins while the page scrolls through a wrapper that is
// one stage tall plus the travel distance; the scroll position moves the track
// sideways. Each chapter first rests aligned at the gutter (title whole) for
// HOLD_SHARE of its scroll, then the track moves on to the next one.
// `--xp-q` (0..1) is the scroll progress through the pinned stretch: a CSS
// scroll timeline drives it where supported, otherwise this script sets it.
// `--xp-p` (0..1, the track's position) is derived from it in CSS by the
// piecewise map written in `measure()` (holds flat, moves linear). Here the
// same progress is read from the wrapper's position to mark the current
// chapter and drive the controls. Vertical scrolling is never captured: the
// pinned stretch is ordinary page height.
//
// Build-tour contract (entrance.js reads these on #experience):
// `--xp-shift` (px the track moves), `--xp-distance` (px of pinned scroll) and,
// per chapter, `--xp-at`: the scroll progress (0..1) where that chapter's rest
// begins, so `travel top + at * distance` shows it aligned.

const TRAVEL_MEDIA = '(min-width: 761px) and (min-height: 600px) and (prefers-reduced-motion: no-preference)';
// Pinned scroll per chapter for the moves, in stage heights (the track may move farther).
const DISTANCE_PER_CHAPTER = 0.85;
// Share of each chapter's scroll span spent resting aligned before the next slides in.
export const HOLD_SHARE = 0.18;
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

  const state = { mode: 'stack', shift: 0, distance: 0, stageW: 0, lefts: [], stops: [], plan: null, current: -1, frame: 0, measureFrame: 0 };

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
      travel.style.removeProperty('--xp-q');
      state.plan = null;
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
    const moves = state.shift ? Math.min(state.shift, chapters.length * DISTANCE_PER_CHAPTER * vh) : 0;
    state.plan = travelPlan(state.stops, state.shift, moves);
    state.distance = state.plan.distance;
    section.style.setProperty('--xp-shift', `${state.shift}px`);
    section.style.setProperty('--xp-distance', `${state.distance}px`);
    travel.style.setProperty('--xp-p', state.plan.css);
    chapters.forEach((chapter, index) => chapter.style.setProperty('--xp-at', (state.plan.holds[index]?.[0] ?? 0).toFixed(4)));
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
    const q = progress();
    if (!timeline) travel.style.setProperty('--xp-q', q.toFixed(4));
    const p = trackAt(state.plan, q);
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
    // Announce the chapter a button asked for once it arrives, not the first one passed on the way.
    if (announceFor === current) {
      announceFor = -1;
      const title = chapters[current]?.querySelector('.xp-title')?.textContent.replace(/\s+/g, ' ').trim();
      live.textContent = `Chapter ${current + 1} of ${chapters.length}${title ? `, ${title}` : ''}`;
    }
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

  // The page scroll position that shows chapter `index` at the stage's left:
  // the middle of its rest, so a little overshoot either way stays aligned.
  function scrollTargetFor(index) {
    const r = travel.getBoundingClientRect();
    const top = (window.scrollY || window.pageYOffset || 0) + r.top;
    const hold = state.plan?.holds[index];
    const share = hold ? (hold[0] + hold[1]) / 2 : 0;
    return Math.round(top + share * state.distance);
  }

  // Announces the chapter reached after a button press (the counter is aria-hidden).
  const live = document.createElement('p');
  live.className = 'visually-hidden';
  live.setAttribute('aria-live', 'polite');
  section.append(live);
  let announceFor = -1;

  function goTo(index, { behavior = 'smooth', announce = false } = {}) {
    if (state.mode !== 'travel') return;
    const target = Math.max(0, Math.min(chapters.length - 1, index));
    if (announce) announceFor = target;
    window.scrollTo({ top: scrollTargetFor(target), behavior });
  }

  indexButtons.forEach(button => button.addEventListener('click', () => goTo(Number(button.dataset.xpGo), { announce: true })));
  stepButtons.forEach(button => button.addEventListener('click', () => {
    if (button.getAttribute('aria-disabled') === 'true') return;
    goTo(Math.max(0, state.current) + Number(button.dataset.xpStep), { announce: true });
  }));

  // Keyboard: focus on (or inside) a chapter brings that chapter into view;
  // Left/Right arrows move between chapters while one has focus.
  track.addEventListener('focusin', event => {
    if (state.mode !== 'travel') return;
    const index = chapters.findIndex(chapter => chapter.contains(event.target));
    if (index < 0) return;
    // Only keyboard focus moves the page; a click or text selection must not.
    if (!event.target.matches?.(':focus-visible')) return;
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

// The pinned stretch as alternating rests and moves. `stops` are the track
// offsets (px) that align each chapter, `shift` the whole travel, `moves` the
// scroll (px) shared by the moves in proportion to how far each one carries
// the track. Each chapter also rests for HOLD_SHARE of its own span (its share
// of the moves plus its rest). Returns the total scroll `distance` (px), the
// scroll progress range of each chapter's rest (`holds`, 0..1), the
// breakpoints of the progress -> track map (`points`, [q, p] pairs) and the
// same map as a CSS expression of var(--xp-q).
export function travelPlan(stops, shift, moves) {
  const count = stops.length;
  if (!(shift > 0) || !count || !(moves > 0)) {
    return { distance: 0, holds: stops.map(() => [0, 0]), points: [[0, 0], [1, 1]], css: 'var(--xp-q)' };
  }
  const hold = (HOLD_SHARE / (1 - HOLD_SHARE)) * (moves / count);
  const marks = stops.map(stop => Math.min(Math.max(0, stop), shift));
  // The last rest ends the travel: anything past the last stop is one more move.
  if (shift - marks[count - 1] > 0.5) marks.push(shift);
  const span = marks[marks.length - 1] - marks[0] || 1;
  const segments = [];
  let y = 0;
  marks.forEach((mark, index) => {
    if (index < count) { segments.push({ kind: 'hold', chapter: index, from: y, to: y + hold, x: mark }); y += hold; }
    const next = marks[index + 1];
    if (next !== undefined) {
      const length = (moves * (next - mark)) / span;
      segments.push({ kind: 'move', from: y, to: y + length, x0: mark, x1: next });
      y += length;
    }
  });
  const distance = Math.round(y);
  const at = value => value / y;
  const holds = segments.filter(segment => segment.kind === 'hold').map(segment => [at(segment.from), at(segment.to)]);
  const points = [[0, marks[0] / shift]];
  segments.forEach(segment => points.push([at(segment.to), (segment.kind === 'hold' ? segment.x : segment.x1) / shift]));
  const terms = segments
    .filter(segment => segment.kind === 'move' && segment.to > segment.from)
    .map(segment => {
      const q0 = at(segment.from).toFixed(5);
      const rate = (1 / (at(segment.to) - at(segment.from))).toFixed(5);
      const share = ((segment.x1 - segment.x0) / shift).toFixed(5);
      return `clamp(0, (var(--xp-q) - ${q0}) * ${rate}, 1) * ${share}`;
    });
  const base = (marks[0] / shift).toFixed(5);
  return { distance, holds, points, css: `calc(${[base, ...terms].join(' + ')})` };
}

// The track position (0..1) at scroll progress `q`, from a plan's points.
export function trackAt(plan, q) {
  const points = plan?.points;
  if (!points?.length) return q;
  if (q <= points[0][0]) return points[0][1];
  for (let index = 1; index < points.length; index += 1) {
    const [q1, p1] = points[index];
    const [q0, p0] = points[index - 1];
    if (q <= q1) return q1 > q0 ? p0 + ((q - q0) / (q1 - q0)) * (p1 - p0) : p1;
  }
  return points[points.length - 1][1];
}

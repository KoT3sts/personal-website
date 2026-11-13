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

// Where the chapters fit one screen (fits() below), measured in Chrome at 761-1920 px wide: the
// narrower the window, the taller it must be. experience.css lays the section out for travel from the
// first paint under the same query, so it must stay close to fits(): a window where the two disagree
// changes height once this script runs. Re-measure (and update both) if the chapters' copy grows.
const TRAVEL_MEDIA = '(min-width: 761px) and (prefers-reduced-motion: no-preference) and (((min-width: 1500px) and (min-height: 600px)) or ((min-width: 1050px) and (min-height: 620px)) or ((min-width: 950px) and (min-height: 660px)) or ((min-width: 900px) and (min-height: 700px)) or ((min-width: 850px) and (min-height: 800px)) or (min-height: 1000px))';
// Pinned scroll per chapter for the moves, in stage heights (the track moves
// about 2.5x as far sideways). With the rests, the whole pinned stretch is
// about 1.7 stage heights for three chapters (1,385 px at 1280 x 800).
export const DISTANCE_PER_CHAPTER = 0.45;
// Share of each chapter's scroll span spent resting aligned before the next slides in.
export const HOLD_SHARE = 0.22;
// A chapter is current once its left edge passes this share of the stage.
const CURRENT_LINE = 0.4;
// A chapter has arrived once its left edge passes this share of the stage.
const REACH_LINE = 0.94;
// Two timeline labels closer than this (px) count as colliding.
const LABEL_GAP = 10;
// Smallest hit area (px) of a role span on the axis.
export const MIN_HIT = 44;

// Career timeline. Built at runtime from the chapter markup (each chapter's
// <time datetime> range in .xp-when, the group heads' years, the education
// list for a gap between roles) by enhancing the chapter index: its buttons
// become the role spans on a month axis from the first start to now. Travel
// mode: one axis in the controls band (no extra height, so the pinned scroll
// is unchanged). Stack mode: a compact chart above the chapters, one row per
// role. Without the script nothing is added (the chapters show their dates).
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const monthIndex = value => {
  const match = /^(\d{4})-(\d{2})/.exec(value || '');
  return match ? Number(match[1]) * 12 + Number(match[2]) - 1 : NaN;
};
export const monthLabel = index => `${MONTHS[((index % 12) + 12) % 12]} ${Math.floor(index / 12)}`;
export const nowMonth = (date = new Date()) => date.getFullYear() * 12 + date.getMonth();

// A role's months from its <time datetime> values: the end is inclusive, or
// null while the text says the role is current ("present").
export function roleRange(datetimes, text = '') {
  const [start, end] = datetimes.map(monthIndex);
  if (!Number.isFinite(start)) return null;
  if (Number.isFinite(end)) return { start, end: Math.max(start, end) };
  return /present|current|now/i.test(text) ? { start, end: null } : { start, end: start };
}

export const rangeText = role => `${monthLabel(role.start)} – ${role.end === null ? 'present' : monthLabel(role.end)}`;

// Every year named in a label: "2026", "2024 – 2025" (each year of the range), none in "RESEARCH".
export function yearsIn(text) {
  const found = [...String(text).matchAll(/\b(19|20)\d{2}\b/g)].map(match => Number(match[0]));
  if (found.length === 2 && found[1] > found[0]) return Array.from({ length: found[1] - found[0] + 1 }, (_, k) => found[0] + k);
  return found;
}

// The month axis. `roles` in chapter order ({ start, end | null }), `now` a
// month index (the axis ends with the month `now` is in, never before the
// latest date in the markup), `years` group years for the markers,
// `education` [{ degree, from, to }] (years) to explain a gap between roles:
// a gap is labelled only when a degree's years cover it. Fractions are 0..1
// along the axis; `order` is the chronological rank.
export function timelinePlan(roles, { now, years = [], education = [] } = {}) {
  const valid = roles.filter(Boolean);
  if (!valid.length) return null;
  const latest = Math.max(...valid.map(role => (role.end === null ? role.start : role.end)));
  const last = Math.max(Number.isFinite(now) ? now : latest, latest);
  const from = Math.min(...valid.map(role => role.start));
  const to = last + 1;
  const total = to - from;
  const at = month => Math.min(1, Math.max(0, (month - from) / total));
  const spans = roles.map((role, index) => (role ? { index, start: role.start, end: role.end, from: at(role.start), to: at((role.end === null ? last : role.end) + 1), present: role.end === null } : null));
  const chrono = spans.filter(Boolean).sort((a, b) => a.start - b.start || a.index - b.index);
  chrono.forEach((span, order) => { span.order = order; });
  const gaps = [];
  chrono.slice(1).forEach((next, k) => {
    const prev = chrono[k];
    if (prev.end === null || next.start <= prev.end + 1) return;
    // Only the months strictly between the two roles (they own their first and last months).
    const gap = { after: prev.index, before: next.index, start: prev.end + 1, end: next.start - 1, from: prev.to, to: next.from, order: prev.order + 0.5 };
    const first = Math.floor(gap.start / 12);
    const lastYear = Math.floor(gap.end / 12);
    const degree = education.find(item => item.from <= first && item.to >= lastYear && /^(B\.?\s?[AS]\.?|Bachelor)/i.test(item.degree || ''));
    if (degree) gap.label = `Finishing ${/^(B\.?\s?[AS]\.?)/i.exec(degree.degree)?.[1].replace(/\s/g, '') || 'degree'}`;
    gaps.push(gap);
  });
  const markers = [...new Set(years)].sort((a, b) => a - b)
    .map(year => ({ year: String(year), at: (year * 12 - from) / total }))
    .filter(marker => marker.at > 0.001 && marker.at < 0.97);
  if (spans.some(span => span?.present)) markers.push({ year: 'Now', at: 1, end: true });
  return { from, to, total, spans, gaps, markers, order: chrono.map(span => span.index) };
}

// Hit areas of the role spans on an axis `width` px wide. Each bar keeps its
// true length (`barX`/`barW`, px inside its box); a box shorter than `min`
// widens around its bar, stays inside the axis, and takes the room from its
// wider neighbour instead of overlapping it.
export function hitBoxes(spans, width, min = MIN_HIT) {
  const boxes = spans.map(span => {
    const bl = span.from * width;
    const br = span.to * width;
    const grow = Math.max(0, min - (br - bl)) / 2;
    return { l: bl - grow, r: br + grow, bl, br };
  });
  const order = boxes.map((_, k) => k).sort((a, b) => boxes[a].bl - boxes[b].bl);
  boxes.forEach(box => {
    if (box.l < 0) { box.r = Math.max(box.r, Math.min(width, min)); box.l = 0; }
    if (box.r > width) { box.l = Math.max(0, Math.min(box.l, width - min)); box.r = width; }
  });
  for (let k = 1; k < order.length; k += 1) {
    const a = boxes[order[k - 1]];
    const b = boxes[order[k]];
    if (b.l >= a.r) continue;
    if (b.l - a.l >= min) a.r = b.l;
    else if (b.r - a.r >= min) b.l = a.r;
    else { b.l = a.r; b.r = Math.max(b.r, b.l + min); }
  }
  // Pushed past the end: walk back, giving way to the right.
  for (let k = order.length - 1; k >= 0; k -= 1) {
    const b = boxes[order[k]];
    const next = boxes[order[k + 1]];
    const limit = next ? next.l : width;
    if (b.r > limit) { b.r = limit; b.l = Math.max(0, Math.min(b.l, b.r - min)); }
  }
  return boxes.map(box => ({ x: box.l, w: box.r - box.l, barX: box.bl - box.l, barW: box.br - box.bl }));
}

export function initExperience(document, window, options = {}) {
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

  // mode '' until the first measure() sets data-xp ("travel" or "stack"): until then
  // experience.css lays the section out as travel would on wide screens (html[data-tour]).
  const state = { mode: '', shift: 0, distance: 0, stageW: 0, lefts: [], stops: [], plan: null, current: -1, frame: 0, measureFrame: 0 };
  const chart = buildTimeline();

  // ---- career timeline ------------------------------------------------------
  function buildTimeline() {
    const nav = stage.querySelector('.xp-index');
    const buttons = indexButtons.filter(button => nav?.contains(button) && chapters[Number(button.dataset.xpGo)]);
    if (!nav || !buttons.length) return null;
    const roles = chapters.map(chapter => {
      const when = chapter.querySelector('.xp-when');
      const times = when ? [...when.querySelectorAll('time[datetime]')].map(time => time.getAttribute('datetime')) : [];
      return roleRange(times, when?.textContent || '');
    });
    if (roles.some(role => !role)) return null;
    const years = [...track.querySelectorAll('.xp-group-head .mono')].flatMap(label => yearsIn(label.textContent));
    const education = [...document.querySelectorAll('.education-list li')].map(item => {
      const span = yearsIn(item.querySelector('.school-meta')?.textContent || '');
      return { degree: item.querySelector('.degree')?.textContent.trim() || '', from: span[0], to: span[span.length - 1] };
    }).filter(item => Number.isFinite(item.from));
    const now = nowMonth(options.now instanceof Date ? options.now : new Date());
    const plan = timelinePlan(roles, { now, years, education });
    if (!plan) return null;

    const el = (tag, className, text) => {
      const node = document.createElement(tag);
      if (className) node.className = className;
      if (text !== undefined) node.textContent = text;
      return node;
    };
    // Label + dates, then the lane its bar sits in (both hidden from the
    // accessibility tree: the button's name says the same).
    const parts = (target, name, dates) => {
      const text = el('span', 'xp-tl-text');
      text.setAttribute('aria-hidden', 'true');
      text.append(el('span', 'xp-tl-label', name), el('span', 'xp-tl-dates mono', dates.toUpperCase()));
      const lane = el('span', 'xp-tl-lane');
      lane.setAttribute('aria-hidden', 'true');
      lane.append(el('span', 'xp-tl-bar'));
      target.append(text, lane);
    };
    const place = (node, span) => {
      node.style.setProperty('--xp-from', span.from.toFixed(4));
      node.style.setProperty('--xp-span', (span.to - span.from).toFixed(4));
      node.style.setProperty('--xp-order', String(span.order));
    };

    const items = [];
    buttons.forEach(button => {
      const index = Number(button.dataset.xpGo);
      const span = plan.spans[index];
      const chapter = chapters[index];
      const title = chapter.querySelector('.xp-title');
      const name = button.querySelector('.xp-index-name')?.textContent.replace(/\s+/g, ' ').trim()
        || title?.dataset.ghost || title?.textContent.replace(/\s+/g, ' ').trim() || `Chapter ${index + 1}`;
      const dates = rangeText(span);
      button.setAttribute('aria-label', `${name}, ${dates}`);
      button.classList.add('xp-tl-span');
      [...button.children].forEach(child => child.setAttribute('aria-hidden', 'true'));
      parts(button, name, dates);
      place(button, span);
      items.push({ node: button, span, start: span.start });
    });
    plan.gaps.forEach(gap => {
      const node = el('span', 'xp-tl-gap');
      node.setAttribute('aria-hidden', 'true');
      parts(node, gap.label || '', rangeText({ start: gap.start, end: gap.end }));
      if (!gap.label) node.dataset.xpUnlabelled = '';
      place(node, { from: gap.from, to: gap.to, order: gap.order });
      items.push({ node, span: gap, start: gap.start + 0.5 });
    });
    // Chronological, left to right: the tab order follows the axis.
    items.sort((a, b) => a.start - b.start).forEach(item => nav.append(item.node));
    const axis = el('span', 'xp-tl-axis');
    axis.setAttribute('aria-hidden', 'true');
    const marks = el('span', 'xp-tl-years');
    marks.setAttribute('aria-hidden', 'true');
    plan.markers.forEach(marker => {
      const mark = el('span', 'xp-tl-year mono', marker.year.toUpperCase());
      mark.style.setProperty('--xp-at', marker.at.toFixed(4));
      mark.toggleAttribute('data-xp-edge', Boolean(marker.end));
      marks.append(mark);
    });
    nav.prepend(axis, marks);
    nav.classList.add('xp-tl');
    nav.style.setProperty('--xp-count', String(items.length));

    const home = { parent: nav.parentNode, next: nav.nextSibling };
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    // Draws itself once, the first time it comes into view (static without motion).
    let observer = null;
    if (window.IntersectionObserver && !reduce?.matches) {
      nav.dataset.xpDraw = 'pending';
      observer = new window.IntersectionObserver(entries => {
        if (!entries.some(entry => entry.isIntersecting)) return;
        observer.disconnect();
        raf(() => { nav.dataset.xpDraw = 'done'; });
      }, { threshold: 0.6 });
      observer.observe(nav);
    }

    // Labels on one axis: each starts at its span, or ends at it when it
    // would run off the axis. If any two collide, only the current one (and
    // a hovered or focused one) shows.
    function fit() {
      if (nav.dataset.xpLayout !== 'axis') { nav.removeAttribute('data-xp-crowded'); return; }
      const width = nav.clientWidth;
      if (!(width > 0)) return;
      // Role buttons: at least MIN_HIT wide, bars still to scale.
      const roles = items.filter(item => item.node.tagName === 'BUTTON');
      hitBoxes(roles.map(item => item.span), width).forEach((box, k) => {
        const style = roles[k].node.style;
        style.setProperty('--xp-hit-x', `${box.x.toFixed(1)}px`);
        style.setProperty('--xp-hit-w', `${box.w.toFixed(1)}px`);
        style.setProperty('--xp-bar-x', `${box.barX.toFixed(1)}px`);
        style.setProperty('--xp-bar-w', `${box.barW.toFixed(1)}px`);
        style.setProperty('--xp-bar-r', `${(box.w - box.barX - box.barW).toFixed(1)}px`);
      });
      // Labels start at their bar, or end at it when they would run off the axis.
      const boxes = items.filter(item => item.node.querySelector('.xp-tl-label').textContent).map(item => {
        const label = item.node.querySelector('.xp-tl-label');
        const w = label.offsetWidth;
        const from = item.span.from * width;
        const to = item.span.to * width;
        const end = from + w > width;
        item.node.toggleAttribute('data-xp-end-label', end);
        const x = end ? to - w : from;
        return [x, x + w];
      }).sort((a, b) => a[0] - b[0]);
      const crowded = boxes.some((box, k) => k > 0 && box[0] < boxes[k - 1][1] + LABEL_GAP) || boxes.some(box => box[0] < 0);
      nav.toggleAttribute('data-xp-crowded', crowded);
    }

    // Travel: in the controls band, one axis. Stack: above the chapters, one row per role.
    function mount(mode) {
      const focused = nav.contains(document.activeElement) ? document.activeElement : null;
      if (mode === 'travel') {
        if (nav.parentNode !== home.parent) home.parent.insertBefore(nav, home.next?.parentNode === home.parent ? home.next : null);
        nav.dataset.xpLayout = 'axis';
      } else {
        if (nav.parentNode !== travel) travel.prepend(nav);
        nav.dataset.xpLayout = 'rows';
        nav.removeAttribute('data-xp-crowded');
      }
      if (focused && document.activeElement !== focused) focused.focus({ preventScroll: true });
    }

    // Stack mode: the chapter whose top has passed 40% of the window is current.
    function current() {
      const line = (window.innerHeight || 800) * CURRENT_LINE;
      let index = 0;
      chapters.forEach((chapter, k) => { if (chapter.getBoundingClientRect().top <= line) index = k; });
      return index;
    }

    // Stack mode: a span scrolls to its chapter and moves focus there.
    function jump(index) {
      const chapter = chapters[index];
      if (!chapter) return;
      if (!chapter.hasAttribute('tabindex')) {
        chapter.setAttribute('tabindex', '-1');
        chapter.addEventListener('blur', () => { if (state.mode !== 'travel') chapter.removeAttribute('tabindex'); }, { once: true });
      }
      chapter.scrollIntoView({ behavior: reduce?.matches ? 'auto' : 'smooth', block: 'start' });
      chapter.focus({ preventScroll: true });
    }

    return { nav, plan, fit, mount, current, jump };
  }

  function setCurrentButton(current) {
    indexButtons.forEach(button => {
      if (Number(button.dataset.xpGo) === current) button.setAttribute('aria-current', 'true');
      else button.removeAttribute('aria-current');
    });
  }

  function updateStack() {
    state.frame = 0;
    if (state.mode !== 'stack' || !chart) return;
    setCurrentButton(chart.current());
  }

  function setMode(mode) {
    state.mode = mode;
    chart?.mount(mode);
    if (mode === 'travel') {
      section.dataset.xp = 'travel';
      if (!timeline) section.dataset.xpDriver = 'script';
      chapters.forEach(chapter => chapter.setAttribute('tabindex', '0'));
      if (controls) controls.hidden = false;
    } else {
      // Explicit, so experience.css's first-paint travel layout no longer applies.
      section.dataset.xp = 'stack';
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
    chart?.fit();
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
    setCurrentButton(current);
    stepButtons.forEach(button => {
      const step = Number(button.dataset.xpStep);
      const target = current + step;
      button.setAttribute('aria-disabled', String(target < 0 || target >= chapters.length));
    });
    if (counter) counter.textContent = pad(current);
  }

  const schedule = () => {
    if (state.frame) return;
    if (state.mode === 'travel') state.frame = raf(update);
    else if (chart) state.frame = raf(updateStack);
  };
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
    if (announce && target === state.current) {
      // Already there: say so now instead of leaving a pending announcement.
      announceFor = -1;
      const title = chapters[target]?.querySelector('.xp-title')?.textContent.replace(/\s+/g, ' ').trim();
      live.textContent = '';
      raf(() => { live.textContent = `Chapter ${target + 1} of ${chapters.length}${title ? `, ${title}` : ''}`; });
    } else if (announce) {
      announceFor = target;
      // A scroll cut short leaves nothing pending (checked after the last frame's update).
      window.addEventListener('scrollend', () => window.setTimeout(() => { if (announceFor === target && state.current !== target) announceFor = -1; }, 250), { once: true });
    }
    window.scrollTo({ top: scrollTargetFor(target), behavior });
  }

  // Stacked, a timeline span scrolls to its chapter instead.
  indexButtons.forEach(button => button.addEventListener('click', () => {
    if (state.mode === 'travel') goTo(Number(button.dataset.xpGo), { announce: true });
    else chart?.jump(Number(button.dataset.xpGo));
  }));
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

  chart?.mount(state.mode);
  measure();
  if (state.mode === 'stack') updateStack();
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

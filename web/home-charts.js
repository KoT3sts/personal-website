// Homepage data widgets, all progressive enhancement over complete markup:
// - the hero proof figures count up the first time they come into view;
// - capability cards with a number in their proof line get a small chart
//   drawn from that line (never from anywhere else);
// - each skill tag shows where on the page the same tag is used.
// Text is only ever written with textContent and elements are built with
// createElement/createElementNS. Charts are aria-hidden: the card's own
// sentence carries the meaning. Reduced motion and no IntersectionObserver
// get the final state at once.

const SVG_NS = 'http://www.w3.org/2000/svg';
export const COUNT_MS = 1300;
// Built-in safety: the most marks one chart draws.
const MAX_MARKS = 400;

// ---- pure helpers (tested under node) ---------------------------------------

export const easeOutCubic = p => 1 - (1 - p) ** 3;

// "350" -> { prefix: '', value: 350, suffix: '' }; "250+" -> suffix '+';
// "2,400+" keeps its grouping. Text without one number -> null ("Minutes").
export function parseFigure(text) {
  const match = /^([^\d]*?)(\d{1,3}(?:,\d{3})+|\d+)([^\d]*)$/.exec(String(text ?? '').trim());
  if (!match) return null;
  const value = Number(match[2].replace(/,/g, ''));
  if (!Number.isFinite(value)) return null;
  return { prefix: match[1], value, suffix: match[3], grouped: match[2].includes(',') };
}

export function formatCount(value, grouped = false) {
  return grouped ? Math.round(value).toLocaleString('en-US') : String(Math.round(value));
}

// The displayed value `elapsed` ms into a count-up to `value`.
export function countAt(value, elapsed, duration = COUNT_MS) {
  const p = Math.min(1, Math.max(0, duration > 0 ? elapsed / duration : 1));
  return Math.round(value * easeOutCubic(p));
}

const int = text => Number(String(text).replace(/,/g, ''));

// Each chart reads its numbers from the card's proof sentence; no match, no chart.
export const CHART_PARSERS = {
  // "58/58 US and 21/21 EU jobs green" -> one row per region.
  jobs(text) {
    const runs = [...String(text).matchAll(/\b(\d+)\/(\d+) ([A-Z]{2})\b/g)].map(([, passed, total, label]) => ({ label, passed: int(passed), total: int(total) }))
      .filter(run => run.total > 0 && run.passed <= run.total && run.total <= MAX_MARKS);
    return runs.length ? { runs } : null;
  },
  // "across a 296-model inventory"
  inventory(text) {
    const match = /\b(\d{1,3}(?:,\d{3})*|\d+)-model inventory\b/.exec(String(text));
    const count = match ? int(match[1]) : 0;
    return count > 0 && count <= MAX_MARKS ? { count } : null;
  },
  // "on 2,400+ records with precision, recall, F1 and slice analysis":
  // the record count as written, and the metric names only (no values).
  records(text) {
    const match = /\b(\d{1,3}(?:,\d{3})+\+?|\d+\+?) records\b/.exec(String(text));
    if (!match) return null;
    const metrics = ['precision', 'recall', 'F1'].filter(name => new RegExp(`\\b${name}\\b`, 'i').test(text));
    return { records: match[1], metrics };
  },
  // "and 12 demo videos"
  videos(text) {
    const match = /\b(\d+) demo videos\b/.exec(String(text));
    const count = match ? int(match[1]) : 0;
    return count > 0 && count <= 48 ? { count } : null;
  },
};

// Skill tag matching: the same words, ignoring case and spacing.
export const normalizeTag = text => String(text ?? '').replace(/\s+/g, ' ').trim().toLowerCase();

// The "Used in" line for a skill and the places (names) that tag it.
export function usageText(skill, places) {
  if (!places.length) return `${skill} — not tagged on a card or role above.`;
  return `${skill} — used in: ${places.join(' · ')}.`;
}

// ---- DOM ---------------------------------------------------------------------

function motionAllowed(window) {
  return !window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches && typeof window.IntersectionObserver === 'function';
}

// Calls `callback` once, the first time `element` is on screen and not held
// back by the build tour (a pending build target, the first-paint cover) or a
// pending scroll reveal. Returns a cancel function.
export function whenShown(document, window, element, callback) {
  const root = document.documentElement;
  let visible = false;
  let done = false;
  let mutations = null;
  const held = () => root.classList.contains('agentic-pending') || Boolean(element.closest('[data-build-state="pending"], [data-reveal="pending"]'));
  const io = new window.IntersectionObserver(entries => {
    visible = entries.some(entry => entry.isIntersecting);
    check();
  }, { rootMargin: '0px 0px -10% 0px', threshold: 0 });
  function stop() {
    done = true;
    io.disconnect();
    mutations?.disconnect();
  }
  function check() {
    if (done || !visible || held()) return;
    stop();
    callback();
  }
  io.observe(element);
  if (typeof window.MutationObserver === 'function') {
    mutations = new window.MutationObserver(check);
    mutations.observe(root, { attributes: true, attributeFilter: ['class'] });
    mutations.observe(element.closest('section, footer') || document.body, { attributes: true, subtree: true, attributeFilter: ['data-build-state', 'data-reveal'] });
  }
  return stop;
}

function el(document, tag, className, parent, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  parent?.append(node);
  return node;
}
function svgEl(document, tag, attrs, parent) {
  const node = document.createElementNS(SVG_NS, tag);
  Object.entries(attrs).forEach(([name, value]) => node.setAttribute(name, String(value)));
  parent?.append(node);
  return node;
}
function svgRoot(document, width, height, className, parent) {
  return svgEl(document, 'svg', { class: className, viewBox: `0 0 ${width} ${height}`, width, height, focusable: 'false', 'aria-hidden': 'true', preserveAspectRatio: 'xMinYMid meet' }, parent);
}

// --- hero proof count-up ---
export function initProofCounters(document, window) {
  const counters = [];
  document.querySelectorAll('.hero-proof .proof-figure').forEach(figure => {
    const node = [...figure.childNodes].find(child => child.nodeType === 3 && /\d/.test(child.nodeValue));
    const parsed = node && parseFigure(node.nodeValue);
    if (!parsed) return;
    // The final text stays in the flow (it sets the width and is what screen
    // readers hear); the counting copy sits on top of it, aria-hidden.
    const wrap = el(document, 'span', 'proof-count');
    el(document, 'span', 'proof-count-final', wrap, node.nodeValue.trim());
    const ink = el(document, 'span', 'proof-count-ink', wrap);
    ink.setAttribute('aria-hidden', 'true');
    node.replaceWith(wrap);
    counters.push({ figure, wrap, ink, parsed });
  });
  if (!counters.length || !motionAllowed(window)) return counters;
  const raf = window.requestAnimationFrame?.bind(window);
  const now = () => window.performance?.now?.() ?? Date.now();
  const paint = (counter, value) => { counter.ink.textContent = `${counter.parsed.prefix}${formatCount(value, counter.parsed.grouped)}${counter.parsed.suffix}`; };
  const finish = counter => { counter.wrap.classList.remove('is-counting'); counter.ink.textContent = ''; counter.done = true; };
  counters.forEach(counter => {
    counter.wrap.classList.add('is-counting');
    paint(counter, 0);
    counter.cancel = whenShown(document, window, counter.figure.closest('li') || counter.figure, () => {
      if (!raf) { finish(counter); return; }
      const start = now();
      const step = () => {
        if (counter.done) return;
        const elapsed = now() - start;
        paint(counter, countAt(counter.parsed.value, elapsed));
        if (elapsed >= COUNT_MS) finish(counter);
        else raf(step);
      };
      raf(step);
    });
  });
  const media = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  media?.addEventListener?.('change', () => { if (media.matches) counters.forEach(counter => { counter.cancel?.(); if (!counter.done) finish(counter); }); });
  // Printing mid-count shows the real figure.
  window.addEventListener?.('beforeprint', () => counters.forEach(counter => { counter.cancel?.(); if (!counter.done) finish(counter); }));
  return counters;
}

// --- capability charts ---
function chartBox(document, kind) {
  const box = document.createElement('div');
  box.className = `cap-chart cap-chart-${kind}`;
  box.setAttribute('aria-hidden', 'true');
  box.dataset.chartKind = kind;
  return box;
}

const DRAW = {
  // One block per job, a row per region, the same scale for both rows.
  jobs(document, box, { runs }) {
    const widest = Math.max(...runs.map(run => run.total));
    const cell = 4;
    const gap = 2;
    const width = widest * (cell + gap) - gap;
    runs.forEach((run, row) => {
      const line = el(document, 'div', 'cap-row', box);
      el(document, 'span', 'cap-row-label mono', line, run.label);
      const svg = svgRoot(document, width, 14, 'cap-mark', line);
      svg.style.setProperty('--d', `${row * 160}ms`);
      for (let i = 0; i < run.total; i++) svgEl(document, 'rect', { x: i * (cell + gap), y: 0, width: cell, height: 14, rx: 1, class: i < run.passed ? 'cap-on' : 'cap-off' }, svg);
      el(document, 'span', 'cap-row-value mono', line, `${run.passed}/${run.total}`);
    });
    el(document, 'p', 'cap-chart-caption mono', box, 'ONE RELEASE · ONE BLOCK PER JOB');
  },
  // A waffle: one cell per model, filled column by column.
  inventory(document, box, { count }) {
    const rows = 8;
    const cols = Math.ceil(count / rows);
    const cell = 6;
    const gap = 2;
    const svg = svgRoot(document, cols * (cell + gap) - gap, rows * (cell + gap) - gap, 'cap-mark cap-waffle', box);
    for (let i = 0; i < count; i++) {
      const col = Math.floor(i / rows);
      svgEl(document, 'rect', { x: col * (cell + gap), y: (i % rows) * (cell + gap), width: cell, height: cell, rx: 1, class: 'cap-on' }, svg);
    }
    el(document, 'p', 'cap-chart-caption mono', box, `${count} MODELS · ONE CELL EACH`);
  },
  // The record set as one band, the metrics named under it (no values).
  records(document, box, { records, metrics }) {
    const band = el(document, 'div', 'cap-band', box);
    el(document, 'span', 'cap-band-fill cap-mark', band);
    el(document, 'span', 'cap-band-label mono', band, `${records} RECORDS`);
    if (metrics.length) {
      const ticks = el(document, 'ul', 'cap-ticks', box);
      metrics.forEach((name, index) => {
        const tick = el(document, 'li', 'cap-tick mono', ticks, name.length > 2 ? name.toUpperCase() : name);
        tick.style.setProperty('--i', index);
      });
    }
  },
  // One play mark per video.
  videos(document, box, { count }) {
    const size = 18;
    const gap = 8;
    const svg = svgRoot(document, count * (size + gap) - gap, size, 'cap-dots', box);
    for (let i = 0; i < count; i++) {
      // The slot carries the position (an SVG attribute); the dot inside it
      // animates with CSS transforms, which would override that attribute.
      const slot = svgEl(document, 'g', { transform: `translate(${i * (size + gap)} 0)` }, svg);
      const g = svgEl(document, 'g', { class: 'cap-dot' }, slot);
      g.style.setProperty('--i', i);
      svgEl(document, 'circle', { cx: size / 2, cy: size / 2, r: size / 2 - 0.75, class: 'cap-dot-ring' }, g);
      svgEl(document, 'path', { d: 'M7.2 5.6v6.8l5.4-3.4z', class: 'cap-dot-play' }, g);
    }
    el(document, 'p', 'cap-chart-caption mono', box, `${count} DEMO VIDEOS`);
  },
};

export function initCapabilityCharts(document, window) {
  const charts = [];
  const animate = motionAllowed(window);
  document.querySelectorAll('.capability[data-chart]').forEach(card => {
    const kind = card.dataset.chart;
    const proof = card.querySelector('.capability-proof');
    const data = CHART_PARSERS[kind] && proof ? CHART_PARSERS[kind](proof.textContent) : null;
    if (!data || !DRAW[kind] || card.querySelector('.cap-chart')) return;
    const box = chartBox(document, kind);
    DRAW[kind](document, box, data);
    proof.after(box);
    charts.push(box);
    if (!animate) return;
    box.classList.add('is-armed');
    whenShown(document, window, box, () => box.classList.add('is-drawn'));
  });
  return charts;
}

// --- skill tags: where each one is used on the page ---
function placeName(container) {
  if (container.matches('.capability')) return container.querySelector('h3')?.textContent.trim() || '';
  const group = container.querySelector('h4')?.textContent.trim() || '';
  const title = container.closest('.xp-chapter')?.querySelector('.xp-title');
  const role = title?.getAttribute('data-ghost') || title?.textContent.trim() || '';
  return role ? `${group} (${role})` : group;
}

export function initSkillLinks(document, window) {
  const skills = document.querySelector('#skills');
  const list = skills?.querySelector('.skill-list');
  if (!list) return null;
  // Every tag list on the page outside Skills that belongs to a capability
  // card or an Experience group, with the tags it holds.
  const places = [...document.querySelectorAll('.tag-list')].map(tags => ({ tags, container: tags.closest('.capability, .xp-group') }))
    .filter(({ tags, container }) => container && !skills.contains(tags))
    .map(({ tags, container }) => ({ container, name: placeName(container), items: [...tags.querySelectorAll('li')] }))
    .filter(place => place.name);
  // The visible line follows hover, focus and presses at once; it is not live.
  // Screen readers hear only presses and clears, through a separate polite
  // region, so moving across the tags or leaving one announces nothing.
  const hint = 'Tags with a dot are used on a card or role above. Pick one to see where.';
  const usage = el(document, 'p', 'skill-usage mono', null, hint);
  const live = el(document, 'span', 'visually-hidden skill-usage-live');
  live.setAttribute('aria-live', 'polite');
  live.setAttribute('aria-atomic', 'true');
  list.after(usage, live);

  // Only tags that some card or role also lists become buttons; the rest stay text.
  const buttons = [];
  list.querySelectorAll('.tag-list > li').forEach(item => {
    if (item.querySelector('button')) return;
    const label = item.textContent.trim();
    const key = normalizeTag(label);
    const hits = places.filter(place => place.items.some(tag => normalizeTag(tag.textContent) === key));
    if (!hits.length) return;
    const button = el(document, 'button', 'skill-tag', null, label);
    button.type = 'button';
    button.setAttribute('aria-pressed', 'false');
    item.textContent = '';
    item.classList.add('has-skill-tag');
    item.append(button);
    buttons.push({ button, label, key, hits });
  });
  if (!buttons.length) { usage.remove(); live.remove(); return null; }
  skills.classList.add('has-skill-links');

  let pressed = null;
  let previewing = null;
  let timer = 0;
  const textFor = entry => (entry ? usageText(entry.label, entry.hits.map(place => place.name)) : hint);
  function paint(entry) {
    document.querySelectorAll('.is-skill-match').forEach(node => node.classList.remove('is-skill-match'));
    document.querySelectorAll('.is-skill-hit').forEach(node => node.classList.remove('is-skill-hit'));
    buttons.forEach(other => other.button.classList.toggle('is-previewed', other === entry && other !== pressed));
    if (entry) {
      entry.hits.forEach(place => {
        place.container.classList.add('is-skill-match');
        place.items.filter(tag => normalizeTag(tag.textContent) === entry.key).forEach(tag => tag.classList.add('is-skill-hit'));
      });
    }
    const text = textFor(entry);
    if (usage.textContent !== text) usage.textContent = text;
  }
  const show = () => paint(previewing || pressed);
  // Debounced, so quick repeated presses are read once.
  function announce(text) {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => { live.textContent = text; }, 150);
  }
  function press(entry) {
    pressed = pressed === entry ? null : entry;
    buttons.forEach(other => other.button.setAttribute('aria-pressed', String(other === pressed)));
    show();
    announce(pressed ? textFor(pressed) : 'Highlight cleared.');
  }
  function clear() {
    if (!pressed) return false;
    pressed = null;
    buttons.forEach(other => other.button.setAttribute('aria-pressed', 'false'));
    show();
    announce('Highlight cleared.');
    return true;
  }
  buttons.forEach(entry => {
    const { button } = entry;
    button.addEventListener('click', () => press(entry));
    button.addEventListener('pointerenter', event => { if (event.pointerType !== 'touch') { previewing = entry; show(); } });
    button.addEventListener('pointerleave', () => { if (previewing === entry) { previewing = null; show(); } });
    button.addEventListener('focus', () => { previewing = entry; show(); });
    button.addEventListener('blur', () => { if (previewing === entry) { previewing = null; show(); } });
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && pressed) clear();
  });
  return { buttons, usage, live, clear, get pressed() { return pressed?.label || null; } };
}

// home-charts.css reserves the charts' and the skill buttons' room from the first
// paint (html[data-tour]); a part that fails, or finds nothing to enhance, marks
// its section .widgets-off so the empty room is given back.
export function initHomeCharts(document, window) {
  const run = (name, fn) => { try { return fn(document, window); } catch (error) { window.console?.error?.(`home-charts ${name}`, error); return null; } };
  const release = selector => document.querySelector?.(selector)?.classList.add('widgets-off');
  const counters = run('counters', initProofCounters);
  const charts = run('charts', initCapabilityCharts);
  if (!charts) release('#capabilities');
  const skills = run('skills', initSkillLinks);
  if (!skills) release('#skills');
  return { counters, charts, skills };
}

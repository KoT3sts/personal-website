// Demos for the three side-project pages (voicelab, work-helper, barking-village).
// Everything runs in the visitor's browser on sample data that is already in the page:
// no requests, no storage. Text is written with textContent and nodes are built with
// createElement, never from HTML strings. Without JavaScript the static fallback in the
// page (values, tables, a room grid and a dog record) stays as it is.
import { analyze, format } from './text-signals.js';

// ---------- Pure helpers (exported for tests/side-demos.test.js) ----------

export const DAY = { start: 8 * 60, end: 18 * 60, step: 15 };
export const CLEAN_MINUTES = 30;
// The time the static room grid in barking-village.html shows (10:45).
export const BOARD_TIME = 10 * 60 + 45;
export const STATE_LABEL = { free: 'Free', session: 'In session', cleaning: 'Cleaning' };

export const clock = minutes => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

export function parseRange(text) {
  const match = /(\d{1,2}):(\d\d)\s*[–-]\s*(\d{1,2}):(\d\d)/.exec(text);
  return match ? { start: Number(match[1]) * 60 + Number(match[2]), end: Number(match[3]) * 60 + Number(match[4]) } : null;
}

// Rows of [time, room, dog, care] from the sample day-plan table.
export function parseSessions(rows) {
  return rows.map(([time, room, dog, care], index) => ({ index, ...parseRange(time), room, dog, care }))
    .filter(session => Number.isFinite(session.start) && session.end > session.start);
}

// Each room's state at minute t: in session, cleaning for 30 minutes after a session, or free.
export function roomStates(sessions, rooms, t) {
  return rooms.map(room => {
    const mine = sessions.filter(session => session.room === room);
    const now = mine.find(session => session.start <= t && t < session.end);
    if (now) return { room, state: 'session', session: now, progress: (t - now.start) / (now.end - now.start) };
    const after = mine.find(session => session.end <= t && t < session.end + CLEAN_MINUTES);
    if (after) return { room, state: 'cleaning', session: after, until: after.end + CLEAN_MINUTES, progress: (t - after.end) / CLEAN_MINUTES };
    const next = mine.filter(session => session.start > t).sort((a, b) => a.start - b.start)[0];
    return { room, state: 'free', next, progress: 0 };
  });
}

export function roomDetail(status) {
  if (status.state === 'session') return `${status.session.dog} · until ${clock(status.session.end)}`;
  if (status.state === 'cleaning') return `Ready at ${clock(status.until)}`;
  return status.next ? `Next at ${clock(status.next.start)}` : 'Nothing else today';
}

// The day advances only while the visitor wants it, the board is on screen and the tab is visible.
export const autoplayRuns = ({ wanted, visible, hidden }) => Boolean(wanted && visible && !hidden);

// Focus on any board control other than the play button pauses the day, so a focused
// slider or session is not re-announced every tick.
export const focusPauses = (target, playButton) => Boolean(target) && target !== playButton && !playButton?.contains?.(target);

export function countStates(statuses) {
  const counts = { session: 0, cleaning: 0, free: 0 };
  for (const status of statuses) counts[status.state]++;
  return counts;
}

// Rows of [role, interests, next step] from the hand-written sample table.
export function parseRoles(rows) {
  return rows.map(([role, interests, step], index) => ({ index, role, interests: interests.split(/\s*,\s*/).filter(Boolean), step }));
}

export function interestsOf(roles) {
  return [...new Set(roles.flatMap(role => role.interests))];
}

// Roles that share at least one picked interest: most shared first, then the closest fit
// (shared ÷ the role's interests), then table order.
export function rankRoles(roles, picked, limit = 3) {
  const chosen = new Set(picked);
  return roles.map(role => ({ ...role, matches: role.interests.filter(interest => chosen.has(interest)) }))
    .filter(role => role.matches.length)
    .sort((a, b) => b.matches.length - a.matches.length
      || b.matches.length / b.interests.length - a.matches.length / a.interests.length
      || a.index - b.index)
    .slice(0, limit);
}

export function listWords(items) {
  if (items.length < 2) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

// ---------- DOM ----------

const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

function el(tag, attrs = {}, text) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === 'class') node.className = value;
    else if (value === true) node.setAttribute(key, '');
    else if (value !== false && value != null) node.setAttribute(key, String(value));
  }
  if (text != null) node.textContent = text;
  return node;
}

function icon(kind) {
  return el('span', { class: `icon icon-arrow-${kind}`, 'aria-hidden': 'true' });
}

// Run once when the node scrolls into view (immediately if there is no observer).
function onVisible(node, callback, threshold = 0.25) {
  if (!('IntersectionObserver' in window)) { callback(); return; }
  const observer = new IntersectionObserver(entries => {
    if (entries.some(entry => entry.isIntersecting)) { observer.disconnect(); callback(); }
  }, { threshold });
  observer.observe(node);
}

// A one-shot reveal for the illustrations: hidden only once JavaScript knows it can show them again.
function reveal(node) {
  if (!node || reducedMotion() || !('IntersectionObserver' in window)) return;
  node.classList.add('is-armed');
  onVisible(node, () => node.classList.add('is-in'));
}

// Closed <details> do not print: open them for printing, then restore.
function printOpen(details) {
  const list = details.filter(Boolean);
  const was = new Map();
  window.addEventListener('beforeprint', () => { for (const d of list) { was.set(d, d.open); d.open = true; } });
  window.addEventListener('afterprint', () => { for (const d of list) d.open = was.get(d) ?? d.open; });
}

function debounce(fn, wait) {
  let timer;
  return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), wait); };
}

// ---------- VoiceLab: writing signals ----------

const MAX_BARS = 60;

function bootVoiceLab(root) {
  const input = root.querySelector('#vl-text');
  const bars = root.querySelector('[data-vl-bars]');
  const lengths = root.querySelector('[data-vl-lengths]');
  const live = root.querySelector('[data-vl-live]');
  if (!input || !bars || !lengths || !live) return;
  const value = name => root.querySelector(`[data-vl="${name}"]`);
  const meter = name => root.querySelector(`[data-vl-meter="${name}"]`);
  const avgLine = el('span', { class: 'sd-avg-line' });
  const avgLabel = el('span', { class: 'mono sd-avg-label' });
  avgLine.append(avgLabel);
  const track = el('div', { class: 'sd-bars-track' });
  bars.replaceChildren(track, avgLine);
  root.classList.add('is-live');

  const setFill = (name, fraction) => meter(name)?.style.setProperty('--fill', Math.max(0, Math.min(1, fraction)).toFixed(3));

  function render(result, animate) {
    const text = format(result);
    const shown = result.sentences.slice(0, MAX_BARS);
    const top = Math.max(20, ...shown.map(sentence => sentence.words));
    while (track.children.length > shown.length) track.lastElementChild.remove();
    shown.forEach((sentence, i) => {
      let bar = track.children[i];
      if (!bar) {
        bar = el('span', { class: animate ? 'sd-bar is-new' : 'sd-bar' });
        track.append(bar);
      }
      bar.style.setProperty('--h', (sentence.words / top).toFixed(3));
      bar.classList.toggle('is-long', sentence.words > 25);
    });
    track.classList.toggle('is-dense', shown.length > 24);
    avgLine.hidden = !result.sentenceCount;
    avgLine.style.setProperty('--avg', (result.avgSentence / top).toFixed(3));
    avgLabel.textContent = `avg ${text.avg}`;
    const more = result.sentences.length - shown.length;
    lengths.textContent = result.sentenceCount ? `${shown.map(sentence => sentence.words).join(' · ')}${more > 0 ? ` (+${more} more)` : ''}` : 'No sentences yet';

    value('avg').textContent = result.sentenceCount ? text.avg : '–';
    value('variety').textContent = result.wordCount ? text.variety : '–';
    value('distinct').textContent = text.distinct;
    value('long').textContent = result.wordCount ? text.long : '–';
    value('flesch').textContent = text.flesch;
    value('band').textContent = text.band || 'needs a sentence';
    const repeated = value('repeated');
    repeated.replaceChildren(...(result.repeated.length
      ? result.repeated.map(({ word, count }) => el('li', {}, `${word} ×${count}`))
      : [el('li', { class: 'is-empty' }, 'No word repeats yet')]));
    setFill('avg', result.avgSentence / 40);
    setFill('variety', result.variety);
    setFill('long', result.longShare);
    setFill('flesch', (result.flesch ?? 0) / 100);
  }

  const announce = debounce(() => {
    const result = analyze(input.value);
    const text = format(result);
    live.textContent = result.sentenceCount
      ? `${result.sentenceCount} ${result.sentenceCount === 1 ? 'sentence' : 'sentences'}, ${result.wordCount} words. Average sentence ${text.avg} words, word variety ${text.variety}, reading ease ${text.flesch} (${text.band}).`
      : 'No sentences yet.';
  }, 1200);

  let frame = 0;
  input.addEventListener('input', () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => render(analyze(input.value), !reducedMotion()));
    announce();
  });
  render(analyze(input.value), false);
  // The bars grow in the first time the chart is seen.
  if (!reducedMotion()) {
    bars.classList.add('is-armed');
    onVisible(bars, () => bars.classList.add('is-in'));
  }
  reveal(document.querySelector('[data-reveal="revision"]'));
}

// ---------- Work Helper: interests to a next step ----------

const MAX_PICKS = 3;

function bootWorkHelper(root) {
  const table = root.querySelector('[data-wh-table]');
  const ui = root.querySelector('[data-wh-ui]');
  const details = root.querySelector('[data-wh-details]');
  if (!table || !ui) return;
  const roles = parseRoles([...table.tBodies[0].rows].map(row => [...row.cells].map(cell => cell.textContent.trim())));
  const interests = interestsOf(roles);

  const fieldset = el('fieldset', { class: 'sd-chips' });
  const hint = el('p', { class: 'sd-hint', id: 'wh-hint' }, 'Pick two or three.');
  fieldset.append(el('legend', { class: 'mono' }, 'Your interests'), hint);
  const chipList = el('div', { class: 'sd-chip-list' });
  const boxes = interests.map((interest, i) => {
    const id = `wh-interest-${i}`;
    const box = el('input', { type: 'checkbox', id, name: 'interest', value: interest, 'aria-describedby': 'wh-hint' });
    const label = el('label', { class: 'sd-chip', for: id });
    label.append(box, el('span', {}, interest));
    chipList.append(label);
    return box;
  });
  fieldset.append(chipList);

  const rolesPanel = el('div', { class: 'sd-wh-panel' });
  const roleList = el('ol', { class: 'sd-roles' });
  rolesPanel.append(el('p', { class: 'mono sd-panel-title' }, 'Role ideas'), roleList);
  const nextPanel = el('div', { class: 'sd-wh-panel sd-next' });
  const nextText = el('p', { class: 'sd-next-text' });
  const nextFrom = el('p', { class: 'mono sd-next-from' });
  nextPanel.append(el('p', { class: 'mono sd-panel-title' }, 'Suggested next step'), nextText, nextFrom);
  const live = el('p', { class: 'sd-sr', 'aria-live': 'polite' });
  const arrow = () => { const a = el('span', { class: 'sd-wh-arrow', 'aria-hidden': 'true' }); a.append(icon('e')); return a; };
  const board = el('div', { class: 'sd-wh-board' });
  board.append(fieldset, arrow(), rolesPanel, arrow(), nextPanel);
  ui.replaceChildren(board, live);
  ui.hidden = false;
  if (details) details.open = false;
  printOpen([details]);

  const announce = debounce(message => { live.textContent = message; }, 500);

  function render(animate) {
    const picked = boxes.filter(box => box.checked).map(box => box.value);
    for (const box of boxes) {
      box.disabled = !box.checked && picked.length >= MAX_PICKS;
      box.parentElement.classList.toggle('is-on', box.checked);
      box.parentElement.classList.toggle('is-off', box.disabled);
    }
    hint.textContent = picked.length >= MAX_PICKS ? 'That makes three. Unpick one to choose another.' : 'Pick two or three.';
    const ranked = rankRoles(roles, picked);
    roleList.replaceChildren(...ranked.map(role => {
      const item = el('li', { class: animate ? 'sd-role is-new' : 'sd-role' });
      const dots = el('span', { class: 'sd-dots', 'aria-hidden': 'true' });
      for (let i = 0; i < role.interests.length; i++) dots.append(el('span', { class: i < role.matches.length ? 'is-on' : '' }));
      item.append(el('span', { class: 'sd-role-name' }, role.role), dots,
        el('span', { class: 'sd-role-why' }, `Shares ${listWords(role.matches)} (${role.matches.length} of its ${role.interests.length} interests)`));
      return item;
    }));
    if (!ranked.length) roleList.append(el('li', { class: 'sd-role is-empty' }, 'Pick an interest to see role ideas.'));
    const top = ranked[0];
    nextPanel.classList.toggle('is-empty', !top);
    nextText.textContent = top ? top.step : 'Your next step appears here.';
    nextFrom.textContent = top ? `From the top idea: ${top.role}` : '';
    if (animate) { nextPanel.classList.remove('is-new'); void nextPanel.offsetWidth; nextPanel.classList.add('is-new'); }
    return { picked, top, count: ranked.length };
  }

  for (const box of boxes) {
    box.addEventListener('change', () => {
      const { picked, top, count } = render(!reducedMotion());
      announce(top
        ? `${listWords(picked)} picked. ${count} role ${count === 1 ? 'idea' : 'ideas'}; top idea ${top.role}. Next step: ${top.step}`
        : 'No interests picked.');
    });
  }
  // Start with two interests picked, so the result is visible straight away.
  for (const box of boxes.slice(0, 2)) box.checked = true;
  render(false);
  reveal(document.querySelector('[data-reveal="path"]'));
}

// ---------- Barking Village: the day board ----------

const DOGS = {
  Biscuit: { breed: 'Beagle mix', note: 'Shy around the dryer; likes a treat after a bath.' },
  Juniper: { breed: 'Miniature poodle', note: 'Naps in the quiet room after grooming.' },
  Pepper: { breed: 'Schnauzer', note: 'Gets along with every dog in the play yard.' },
  Moose: { breed: 'Newfoundland', note: 'Needs the large tub and extra towels.' },
};
export { DOGS };

export function dogToday(sessions, dog) {
  return sessions.filter(session => session.dog === dog).sort((a, b) => a.start - b.start)
    .map(session => `${clock(session.start)} ${session.care}, ${session.room}`);
}

const TICK_MS = 900;
export const PLAY_LABEL = 'Play the day';

function bootBarking(root) {
  const table = root.querySelector('[data-bv-table]');
  const grid = root.querySelector('[data-bv-rooms]');
  const timelineHost = root.querySelector('[data-bv-timeline]');
  const controlsHost = root.querySelector('[data-bv-controls]');
  const card = root.querySelector('[data-bv-dog]');
  const clockText = root.querySelector('[data-bv-clock]');
  const details = root.querySelector('[data-bv-details]');
  if (!table || !grid || !timelineHost || !controlsHost || !card || !clockText) return;
  const sessions = parseSessions([...table.tBodies[0].rows].map(row => [...row.cells].map(cell => cell.textContent.trim())));
  const tiles = [...grid.querySelectorAll('[data-room]')];
  const rooms = tiles.map(tile => tile.dataset.room);
  const span = DAY.end - DAY.start;
  const at = minutes => ((minutes - DAY.start) / span).toFixed(4);

  // Controls: a toggle with a fixed name ("Play the day", pressed while playing), and a clock to scrub.
  const play = el('button', { type: 'button', class: 'sd-button', 'aria-pressed': 'false' });
  play.append(el('span', { class: 'sd-play-icon', 'aria-hidden': 'true' }), el('span', {}, PLAY_LABEL));
  const range = el('input', { type: 'range', id: 'bv-time', min: DAY.start, max: DAY.end, step: DAY.step, 'aria-valuetext': '' });
  const output = el('output', { class: 'mono sd-time', for: 'bv-time' });
  const field = el('div', { class: 'sd-range' });
  field.append(el('label', { class: 'mono', for: 'bv-time' }, 'Time of day'), range, output);
  controlsHost.replaceChildren(play, field);
  controlsHost.hidden = false;

  // Timeline: one row per room, sessions as buttons, cleaning as a hatched block, a line for now.
  const timeline = el('div', { class: 'sd-timeline' });
  const axis = el('div', { class: 'sd-axis', 'aria-hidden': 'true' });
  axis.append(el('span'));
  const ticks = el('div', { class: 'sd-axis-ticks' });
  for (let m = DAY.start; m <= DAY.end; m += 120) {
    const tick = el('span', { class: 'mono' }, clock(m));
    tick.style.setProperty('--x', at(m));
    ticks.append(tick);
  }
  axis.append(ticks);
  timeline.append(axis);
  const nowLines = [];
  const buttons = [];
  for (const room of rooms) {
    const row = el('div', { class: 'sd-lane', role: 'group', 'aria-label': room });
    const lane = el('div', { class: 'sd-lane-track' });
    for (const session of sessions.filter(s => s.room === room)) {
      const clean = el('span', { class: 'sd-clean', 'aria-hidden': 'true' });
      clean.style.setProperty('--x', at(session.end));
      clean.style.setProperty('--w', (CLEAN_MINUTES / span).toFixed(4));
      const button = el('button', { type: 'button', class: 'sd-session', 'aria-pressed': 'false', 'aria-label': `${session.dog}, ${session.care}, ${room}, ${clock(session.start)} to ${clock(session.end)}` });
      button.style.setProperty('--x', at(session.start));
      button.style.setProperty('--w', ((session.end - session.start) / span).toFixed(4));
      button.append(el('span', { class: 'sd-session-dog' }, session.dog), el('span', { class: 'sd-session-care' }, session.care));
      button.addEventListener('click', () => { stop(); showDog(session.dog); });
      buttons.push({ button, session });
      lane.append(clean, button);
    }
    const now = el('span', { class: 'sd-now', 'aria-hidden': 'true' });
    nowLines.push(now);
    lane.append(now);
    row.append(el('span', { class: 'mono sd-lane-name', 'aria-hidden': 'true' }, room), lane);
    timeline.append(row);
  }
  const scroller = el('div', { class: 'sd-timeline-scroll', tabindex: '0', role: 'group', 'aria-label': 'Day plan timeline: choose a session to open the dog record' });
  scroller.append(timeline);
  timelineHost.replaceChildren(el('p', { class: 'mono sd-block-title' }, 'Daily plan'), el('p', { class: 'mono sd-swipe', 'aria-hidden': 'true' }, 'Swipe the plan sideways for the afternoon'), scroller);
  timelineHost.hidden = false;
  const live = el('p', { class: 'sd-sr', 'aria-live': 'polite' });
  root.append(live);
  if (details) details.open = false;
  printOpen([details]);
  root.classList.add('is-live');

  // Dog record.
  const name = card.querySelector('[data-bv-dog-name]');
  const breed = card.querySelector('[data-bv-dog-breed]');
  const today = card.querySelector('[data-bv-dog-today]');
  const note = card.querySelector('[data-bv-dog-note]');
  function showDog(dog, quiet = false) {
    for (const { button, session } of buttons) button.setAttribute('aria-pressed', String(session.dog === dog));
    // On load the static record already shows this dog: only mark its sessions.
    if (quiet) return;
    name.textContent = dog;
    breed.textContent = DOGS[dog]?.breed ?? '';
    today.replaceChildren(...dogToday(sessions, dog).map(line => el('li', {}, line)));
    note.textContent = DOGS[dog]?.note ?? '';
    if (!reducedMotion()) { card.classList.remove('is-new'); void card.offsetWidth; card.classList.add('is-new'); }
  }

  let t = DAY.start;
  function render() {
    const statuses = roomStates(sessions, rooms, t);
    statuses.forEach((status, i) => {
      const tile = tiles[i];
      tile.classList.remove('is-free', 'is-session', 'is-cleaning');
      tile.classList.add(`is-${status.state}`);
      tile.querySelector('.sd-room-state').textContent = STATE_LABEL[status.state];
      tile.querySelector('.sd-room-detail').textContent = roomDetail(status);
      tile.querySelector('.sd-room-progress span')?.style.setProperty('--p', status.progress.toFixed(3));
    });
    for (const line of nowLines) line.style.setProperty('--x', at(t));
    for (const { button, session } of buttons) button.classList.toggle('is-now', session.start <= t && t < session.end);
    clockText.textContent = clock(t);
    output.textContent = clock(t);
    range.value = String(t);
    range.setAttribute('aria-valuetext', clock(t));
    if (timer) follow();
    return statuses;
  }
  // While the day plays on a narrow screen, keep the now line in view.
  function follow() {
    if (scroller.scrollWidth <= scroller.clientWidth) return;
    const track = scroller.querySelector('.sd-lane-track');
    const box = track.getBoundingClientRect();
    const x = box.left - scroller.getBoundingClientRect().left + scroller.scrollLeft + ((t - DAY.start) / span) * box.width;
    if (x < scroller.scrollLeft + 40 || x > scroller.scrollLeft + scroller.clientWidth - 40) scroller.scrollLeft = Math.max(0, x - scroller.clientWidth * 0.3);
  }
  const announce = debounce(() => {
    const counts = countStates(roomStates(sessions, rooms, t));
    live.textContent = `${clock(t)}: ${counts.session} in session, ${counts.cleaning} cleaning, ${counts.free} free.`;
  }, 700);

  let timer = 0;
  let visible = false;
  let wanted = false;
  function tick() {
    t = t + DAY.step > DAY.end ? DAY.start : t + DAY.step;
    render();
  }
  function setPlaying(on) {
    wanted = on;
    play.setAttribute('aria-pressed', String(on));
    sync();
  }
  function sync() {
    const run = autoplayRuns({ wanted, visible, hidden: document.hidden });
    if (run && !timer) timer = setInterval(tick, TICK_MS);
    if (!run && timer) { clearInterval(timer); timer = 0; }
  }
  function stop() { if (wanted) setPlaying(false); }
  play.addEventListener('click', () => setPlaying(!wanted));
  root.addEventListener('focusin', event => { if (focusPauses(event.target, play)) stop(); });
  // Scrolling the plan by hand pauses the day, so it does not scroll back.
  for (const type of ['wheel', 'touchstart', 'keydown']) scroller.addEventListener(type, stop, { passive: true });
  range.addEventListener('input', () => { stop(); t = Number(range.value); render(); announce(); });
  document.addEventListener('visibilitychange', sync);
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(entries => { visible = entries.some(entry => entry.isIntersecting); sync(); }, { threshold: 0.15 }).observe(root);
  } else visible = true;

  // Play the day from the morning when motion is welcome; otherwise stay on the static board's time.
  t = reducedMotion() ? BOARD_TIME : DAY.start;
  render();
  showDog(name.textContent.trim(), true);
  setPlaying(!reducedMotion());
}

function boot() {
  const root = document.querySelector('[data-demo]');
  if (!root) return;
  const run = { voicelab: bootVoiceLab, 'work-helper': bootWorkHelper, 'barking-village': bootBarking }[root.dataset.demo];
  run?.(root);
}

// Imported by node tests without a DOM: only boot in a browser.
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
}

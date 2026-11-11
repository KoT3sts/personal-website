// The static build trace (lab/build-trace.html): the recorded agent run that
// built this site, from ../trace/build-trace.json, for visitors who skip the
// build tour or browse with reduced motion. Text is only ever set with
// textContent; nothing is built from HTML strings. The helpers are pure (no
// DOM) so node tests can check them.

export const TRACE_JSON = '../trace/build-trace.json';
export const HONESTY = 'Steps, results and commits are real. Cursor positions and typing are a visualization. Commit times are exact; other times are estimated.';
export const CURSORS = 'The number of cursors is a visualization too; the trace counts role types, not separate agents.';
const ROLES = ['orchestrator', 'implementation-worker', 'quality-reviewer', 'ui-design-director'];
const STATUSES = ['ok', 'error', 'retried', 'fixed'];
const TIMINGS = ['commit', 'message', 'estimated'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const ISO = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::\d{2})?(Z|[+-]\d{2}:\d{2})$/;

const text = (value, max = 240) => (typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, max) : '');

// Valid spans only, in time order (as recorded; nothing is shifted to the
// visitor's time zone).
export function readSpans(data) {
  if (!data || !Array.isArray(data.spans)) return [];
  const ids = new Set();
  return data.spans.filter(span => {
    if (!span || typeof span !== 'object' || !text(span.id) || ids.has(span.id)) return false;
    const start = Date.parse(span.start);
    const end = Date.parse(span.end);
    const ok = ROLES.includes(span.role) && STATUSES.includes(span.status) && TIMINGS.includes(span.timing)
      && text(span.action) && ISO.test(span.start) && ISO.test(span.end) && Number.isFinite(start) && Number.isFinite(end) && start <= end;
    if (ok) ids.add(span.id);
    return ok;
  }).map((span, index) => ({ ...span, index, at: Date.parse(span.start), until: Date.parse(span.end) }))
    .sort((a, b) => a.at - b.at || b.until - a.until || a.index - b.index);
}

const dayOf = iso => ISO.exec(iso)?.slice(1, 4).map(Number) || null;
export function dayLabel(iso) {
  const parts = dayOf(iso);
  if (!parts) return '';
  const [y, m, d] = parts;
  return `${DAYS[new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay()]}, ${MONTHS[m - 1]} ${d}, ${y}`;
}
const clockOf = iso => { const m = ISO.exec(iso); return m ? `${m[4]}:${m[5]}` : ''; };
const short = iso => { const p = dayOf(iso); return p ? `${MONTHS[p[1] - 1].slice(0, 3)} ${p[2]}` : ''; };

// "12:08" for a commit (a point in time); "10:46–11:26" for an interval;
// the date is repeated only when it changes.
export function timeText(span) {
  if (span.start === span.end) return clockOf(span.start);
  const sameDay = span.start.slice(0, 10) === span.end.slice(0, 10);
  return sameDay ? `${clockOf(span.start)}–${clockOf(span.end)}` : `${short(span.start)} ${clockOf(span.start)} – ${short(span.end)} ${clockOf(span.end)}`;
}
// The recorded UTC offset, e.g. "UTC−05:00".
export function offsetText(spans) {
  const zone = ISO.exec(spans[0]?.start || '')?.[6];
  return !zone ? '' : zone === 'Z' ? 'UTC' : `UTC${zone.replace('-', '−')}`;
}

// Steps grouped by the day they started.
export function groupByDay(spans) {
  const groups = [];
  for (const span of spans) {
    const day = span.start.slice(0, 10);
    if (groups.at(-1)?.day !== day) groups.push({ day, label: dayLabel(span.start), spans: [] });
    groups.at(-1).spans.push(span);
  }
  return groups;
}

function datesText(from, to) {
  const a = dayOf(from);
  const b = dayOf(to) || a;
  if (!a) return '';
  const month = n => MONTHS[n - 1].slice(0, 3);
  if (a[0] !== b[0]) return `${month(a[1])} ${a[2]}, ${a[0]} – ${month(b[1])} ${b[2]}, ${b[0]}`;
  if (a[1] !== b[1]) return `${month(a[1])} ${a[2]} – ${month(b[1])} ${b[2]}, ${a[0]}`;
  return a[2] === b[2] ? `${month(a[1])} ${a[2]}, ${a[0]}` : `${month(a[1])} ${a[2]}–${b[2]}, ${a[0]}`;
}

// The run in numbers, all read from the trace file.
export function summarize(data) {
  const spans = readSpans(data);
  const run = data?.run && typeof data.run === 'object' ? data.run : {};
  const byId = new Map(spans.map(span => [span.id, span]));
  const children = id => spans.filter(span => span.parent === id);
  const followed = span => children(span.id).some(child => child.status === 'retried' || child.status === 'fixed' || followed(child));
  const errors = spans.filter(span => span.status === 'error');
  const commits = spans.filter(span => span.timing === 'commit');
  const roles = (Array.isArray(data?.roles) ? data.roles : []).filter(role => ROLES.includes(role?.id)).map(role => ({
    id: role.id, label: text(role.label) || role.id, what: text(role.what), count: spans.filter(span => span.role === role.id).length,
  }));
  const tours = data?.totals?.tour_seconds && typeof data.totals.tour_seconds === 'object'
    ? Object.entries(data.totals.tour_seconds).filter(([w, s]) => /^\d+$/.test(w) && Number.isFinite(s)).map(([w, s]) => ({ width: Number(w), seconds: s })).sort((a, b) => b.width - a.width)
    : [];
  return {
    spans,
    title: text(data?.title),
    sources: text(data?.sources, 1200),
    commits: Number.isInteger(run.commits) ? run.commits : new Set(spans.map(span => span.commit).filter(Boolean)).size,
    from: text(run.from, 40),
    to: text(run.to, 40),
    dates: datesText(run.started || spans[0]?.start, run.ended || spans.at(-1)?.end),
    roles,
    errors: errors.length,
    recovered: errors.filter(followed).length,
    // Commits saved during the run (the starting baseline excluded, as in the run's count).
    saves: new Set(commits.map(span => span.commit).filter(hash => hash && hash !== run.from)).size,
    savesBy: [...new Set(commits.filter(span => span.commit !== run.from).map(span => span.role))],
    tests: text(data?.totals?.tests_last, 120),
    tours,
    byId,
  };
}

// "What I did vs what the agents did", sentence by sentence, from the trace's
// own facts (roles and counts); no shares or percentages are claimed.
export function agentNote(summary) {
  const role = id => summary.roles.find(item => item.id === id);
  const orchestrator = role('orchestrator');
  const lines = [];
  if (orchestrator) {
    const saves = summary.savesBy.length === 1 && summary.savesBy[0] === 'orchestrator' ? `, and it made all ${summary.saves} commits` : '';
    lines.push(`The orchestrator is my primary agent and works under my direction: it ${orchestrator.what}. It recorded ${orchestrator.count} of the ${summary.spans.length} steps${saves}.`);
  }
  const others = ['implementation-worker', 'quality-reviewer', 'ui-design-director'].map(role).filter(Boolean);
  if (others.length) lines.push(`The other roles were delegated work: ${others.map(item => `the ${item.label} (${item.what}) recorded ${item.count} ${item.count === 1 ? 'step' : 'steps'}`).join('; ')}.`);
  if (summary.errors) lines.push(`${summary.errors} steps ended in an error; ${summary.recovered} of them are followed by a recorded retry or fix.`);
  lines.push('Roles count role types, not separate agent instances.');
  return lines;
}

// ---- rendering --------------------------------------------------------------
function el(document, tag, className, parent, value) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (value !== undefined) node.textContent = value;
  parent?.append(node);
  return node;
}

function renderStep(document, list, span) {
  const item = el(document, 'li', 'bt-step', list);
  item.dataset.role = span.role;
  item.dataset.status = span.status;
  el(document, 'span', 'bt-chip', item).setAttribute('aria-hidden', 'true');
  const body = el(document, 'div', 'bt-step-body', item);
  el(document, 'p', 'bt-action', body, text(span.action));
  if (text(span.result)) el(document, 'p', 'bt-result', body, text(span.result));
  const meta = el(document, 'p', 'bt-meta', body);
  el(document, 'span', 'visually-hidden', meta, 'Role: ');
  el(document, 'span', 'bt-role', meta, span.role);
  el(document, 'span', 'visually-hidden', meta, ', status: ');
  el(document, 'span', 'bt-badge bt-state', meta, span.status);
  el(document, 'span', 'visually-hidden', meta, ', time: ');
  el(document, 'span', 'bt-badge bt-timing', meta, span.timing === 'commit' ? 'exact' : 'estimated');
  el(document, 'span', 'bt-time', meta, timeText(span));
  el(document, 'span', 'visually-hidden', meta, ', commit: ');
  el(document, 'span', 'bt-commit', meta, /^[0-9a-f]{7,40}$/.test(span.commit || '') ? span.commit.slice(0, 7) : 'no commit');
  const sections = Array.isArray(span.sections) ? span.sections.filter(name => typeof name === 'string') : [];
  if (sections.length) el(document, 'p', 'bt-sections', body, `Sections: ${sections.join(', ')}`);
  if (text(span.evidence)) el(document, 'p', 'bt-evidence', body, `Evidence: ${text(span.evidence)}`);
}

export function render(document, data) {
  const summary = summarize(data);
  if (!summary.spans.length) throw new Error('empty trace');
  const set = (selector, value) => { const node = document.querySelector(selector); if (node) node.textContent = value; return node; };
  set('[data-bt="title"]', summary.title);
  set('[data-bt="commits"]', String(summary.commits));
  set('[data-bt="steps"]', String(summary.spans.length));
  set('[data-bt="roles-count"]', String(summary.roles.length));
  set('[data-bt="range"]', `${summary.dates}${summary.from && summary.to ? ` · commits ${summary.from}–${summary.to}` : ''}`);
  const roles = document.querySelector('[data-bt="roles"]');
  if (roles) {
    roles.textContent = '';
    summary.roles.forEach(role => {
      const row = el(document, 'div', 'bt-role-row', roles);
      row.dataset.role = role.id;
      const term = el(document, 'dt', '', row);
      el(document, 'span', 'bt-chip', term).setAttribute('aria-hidden', 'true');
      term.append(role.label);
      el(document, 'dd', '', row, `${role.what[0]?.toUpperCase() || ''}${role.what.slice(1)}. ${role.count} recorded ${role.count === 1 ? 'step' : 'steps'}.`);
    });
  }
  const checks = document.querySelector('[data-bt="checks"]');
  if (checks) {
    checks.textContent = '';
    if (summary.tests) el(document, 'li', '', checks, `Last test run: ${summary.tests}.`);
    if (summary.tours.length) el(document, 'li', '', checks, `Build tour length: ${summary.tours.map(tour => `${tour.seconds} s at ${tour.width} px wide`).join(', ')}.`);
    el(document, 'li', '', checks, `${summary.errors} recorded errors; ${summary.recovered} followed by a recorded retry or fix.`);
  }
  const note = document.querySelector('[data-bt="note"]');
  if (note) { note.textContent = ''; agentNote(summary).forEach(line => el(document, 'p', '', note, line)); }
  set('[data-bt="sources"]', summary.sources);
  set('[data-bt="offset"]', offsetText(summary.spans) ? `Times are as recorded (${offsetText(summary.spans)}).` : '');
  const days = document.querySelector('[data-bt="days"]');
  if (days) {
    days.textContent = '';
    groupByDay(summary.spans).forEach((group, k) => {
      const section = el(document, 'section', 'bt-day', days);
      const heading = el(document, 'h3', 'bt-day-title', section, `${group.label} · ${group.spans.length} steps`);
      heading.id = `bt-day-${k + 1}`;
      section.setAttribute('aria-labelledby', heading.id);
      const list = el(document, 'ol', 'bt-steps', section);
      group.spans.forEach(span => renderStep(document, list, span));
    });
  }
  return summary;
}

async function boot(document, window) {
  // Empty (and hidden) in the markup, so a page without JavaScript shows only
  // its <noscript> line.
  const status = document.querySelector('[data-bt="status"]');
  if (status) { status.textContent = 'Loading the recorded trace…'; status.hidden = false; }
  try {
    const response = await window.fetch(TRACE_JSON, { credentials: 'same-origin' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    render(document, await response.json());
    document.querySelectorAll('[data-bt-live]').forEach(node => { node.hidden = false; });
    if (status) status.hidden = true;
  } catch {
    if (status) status.textContent = 'The recorded trace could not be loaded. The raw file is linked below.';
  }
}

if (typeof document !== 'undefined' && typeof window !== 'undefined' && document.querySelector('[data-bt="days"]')) boot(document, window);

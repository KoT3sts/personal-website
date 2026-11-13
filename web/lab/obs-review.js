// Agent observability: the release gate (offline re-scoring) and human review (Good/Bad
// labels kept in this browser, compared with every check). DOM via textContent only.
import * as D from './obs-data.js';
import * as E from './obs-eval.js';

const { el, q } = D;
const pct = v => (v === null ? '–' : `${Math.round(v * 100)}%`);
const fixed = v => (v === null || !Number.isFinite(v) ? '–' : v.toFixed(2));
// Writes text only when it changes, so a live region is not re-announced for nothing.
const put = (node, text) => { if (node.textContent !== text) node.textContent = text; };
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

// ---- release gate
export function initGate({ data, open, onScore }) {
  const checks = E.passFail(data.evaluators);
  const defaults = E.gateDefaults(data.evaluators);
  const published = E.rescore(data.evaluators, data.evaluations, defaults);
  let gate = defaults;
  let scoring = published;
  const rows = new Map();

  function build() {
    const box = q('gate-controls');
    for (const e of checks) {
      const c = E.gateControl(e);
      const row = el('div', 'obs-gate-row', box);
      const head = el('div', 'obs-gate-head', row);
      const check = el('span', 'obs-check obs-gate-req', head);
      const req = el('input', '', check);
      req.type = 'checkbox';
      req.id = `obs-gate-req-${e.id}`;
      req.checked = true;
      const label = el('label', '', check, e.name);
      label.htmlFor = req.id;
      const blocks = el('span', 'mono obs-gate-blocks', head);
      const rule = el('p', 'obs-gate-rule', row);
      let range = null;
      let value = null;
      if (!c.toggle) {
        const line = el('div', 'obs-gate-line', row);
        range = el('input', 'obs-gate-range', line);
        Object.assign(range, { type: 'range', min: String(c.min), max: String(c.max), step: String(c.step), value: String(gate[e.id].value), id: `obs-gate-${e.id}` });
        range.setAttribute('aria-label', `${e.name}: threshold`);
        value = el('span', 'mono obs-gate-value', line);
        value.setAttribute('aria-hidden', 'true');
        // Each step redraws; the live summary waits for change.
        range.addEventListener('input', () => { gate = { ...gate, [e.id]: { ...gate[e.id], value: Number(range.value) } }; score(false); });
        range.addEventListener('change', () => announce());
      } else el('p', 'mono obs-gate-line obs-gate-flag', row, 'Scored 1 or 0: require it or not');
      req.addEventListener('change', () => { gate = { ...gate, [e.id]: { ...gate[e.id], require: req.checked } }; score(); });
      rows.set(e.id, { row, req, range, value, rule, blocks, c });
    }
    q('gate-reset').addEventListener('click', () => {
      gate = defaults;
      for (const [id, r] of rows) { r.req.checked = true; if (r.range) r.range.value = String(gate[id].value); }
      score();
    });
    q('gate-ids').addEventListener('click', event => {
      const a = event.target.closest('a[data-trace]');
      if (a) { event.preventDefault(); open(a.dataset.trace); }
    });
    render();
  }

  function render(live = true) {
    for (const e of checks) {
      const r = rows.get(e.id);
      if (!r) return;
      const s = gate[e.id];
      const words = r.c.rule(r.c.toggle ? null : s.value);
      r.rule.textContent = s.require ? words : `${words}. Not required: it never blocks.`;
      r.row.classList.toggle('is-off', !s.require);
      r.row.classList.toggle('is-moved', !r.c.toggle && s.value !== defaults[e.id].value);
      if (r.range) {
        r.range.disabled = !s.require;
        r.range.setAttribute('aria-valuetext', words);
        r.value.textContent = `${{ atMost: '≤', below: '<', atLeast: '≥' }[e.direction]} ${s.value}${r.c.unit}`;
      }
      const n = scoring.fails[e.id];
      r.blocks.textContent = s.require ? `fails ${n}` : 'off';
    }
    const { blocked, scored, top } = scoring;
    put(q('gate-n'), String(blocked.length));
    put(q('gate-of'), String(scored));
    const name = id => checks.find(e => e.id === id)?.name;
    const most = top ? `${name(top.id)} blocks the most: ${top.fails} ${top.fails === 1 ? 'run' : 'runs'}.` : 'No required check fails.';
    put(q('gate-top'), most);
    put(q('gate-float'), `${blocked.length} of ${scored} blocked${top ? ` · most by ${name(top.id)}` : ''}`);
    if (live) announce();
    const was = published.blocked.length;
    const diff = blocked.length - was;
    const same = blocked.length === was && blocked.every((id, i) => id === published.blocked[i]);
    put(q('gate-delta'), JSON.stringify(gate) === JSON.stringify(defaults)
      ? `The published thresholds, with every check required, block ${was}: the same runs the “Failed a check” filter finds.`
      : same ? `The same ${was} runs as at the published thresholds: whatever the change fails was already blocked by another check.`
        : diff === 0 ? `As many as at the published thresholds (${was}), but not the same runs.`
          : `${Math.abs(diff)} ${diff > 0 ? 'more' : 'fewer'} than at the published thresholds (${was}).`);
    const ul = q('gate-ids');
    ul.replaceChildren();
    for (const id of blocked) {
      const li = el('li', '', ul);
      const a = el('a', 'obs-gate-id', li, `#${Number(id.slice(1))}`);
      a.href = `#${id}`;
      a.dataset.trace = id;
      const fails = [...scoring.labels.get(id)].filter(([c, l]) => l === 'fail' && scoring.required.has(c)).map(([c]) => D.FAIL_WORDS[c] || c);
      a.setAttribute('aria-label', `Trace ${Number(id.slice(1))}: ${fails.join(', ')}. Open trace`);
      a.title = fails.join(', ');
    }
    if (!blocked.length) el('li', 'obs-none', ul, 'Nothing would be blocked.');
    q('gate-reset').disabled = JSON.stringify(gate) === JSON.stringify(defaults);
  }

  function score(live = true) {
    scoring = E.rescore(data.evaluators, data.evaluations, gate);
    render(live);
    onScore(scoring);
  }
  // The hidden live summary, written per change, not per slider step.
  function announce() {
    const { blocked, scored, top } = scoring;
    const name = checks.find(e => e.id === top?.id)?.name;
    const most = top ? `${name} blocks the most: ${top.fails} ${top.fails === 1 ? 'run' : 'runs'}.` : 'No required check fails.';
    put(q('gate-summary'), `${blocked.length} of ${scored} scored runs would be blocked. ${most}`);
  }

  D.whenNear(q('gate-block'), build);
  return { scoring: () => scoring };
}

// ---- human review
// Labels: localStorage, one key, human-labels.json's shape. Another dataset's labels go to
// `setAside` (kept, not compared). Only a failed write means blocked; corrupt reads as none.
const fileOf = f => E.labelsFile(f.labels, f.date, f.labeler, f.dataset);
export function labelStore(ids, dataset) {
  let aside = null;
  let ok = true;
  const storage = () => { try { return window.localStorage; } catch { return null; } };
  return {
    read() {
      let rec = null;
      try { rec = JSON.parse(storage()?.getItem(E.ANNOTATIONS_KEY) || 'null'); } catch { /* none */ }
      const own = E.parseLabels(rec, null);
      const earlier = E.parseLabels(rec?.setAside, null);
      const fits = E.labelsFit(own, dataset);
      aside = !fits ? own : Object.keys(earlier.labels).length ? earlier : null;
      return fits ? E.parseLabels(rec, ids).labels : {};
    },
    write(labels) {
      try {
        const rec = E.labelsFile(labels, today(), null, dataset);
        if (aside) rec.setAside = fileOf(aside);
        if (Object.keys(labels).length || aside) storage().setItem(E.ANNOTATIONS_KEY, JSON.stringify(rec));
        else storage().removeItem(E.ANNOTATIONS_KEY);
      } catch { ok = false; }
    },
    clearAside() { aside = null; },
    get aside() { return aside; },
    get ok() { return ok; },
  };
}
function download(file, name) {
  const url = URL.createObjectURL(new Blob([`${JSON.stringify(file, null, 2)}\n`], { type: 'application/json' }));
  const a = el('a', '', document.body);
  a.href = url;
  a.download = name;
  a.hidden = true;
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
const SET_ASIDE = 'Labels were made on an earlier export and were set aside';

export function initReview({ data, open, selected, order, onLabels, scoring }) {
  const ids = new Set(data.traces.map(t => t.id));
  const dataset = data.meta?.dataset || null;
  const store = labelStore(ids, dataset);
  let mine = store.read();
  let cesar = { labeler: 'Cesar Tortolero', date: null, labels: {} };
  let cesarAside = false;
  let annotating = false;
  let focusRow = 'all';
  let built = false;
  const total = data.traces.length;

  // annotate bar, inside the trace detail
  const toggle = q('annotate-toggle');
  const bar = q('annotate-bar');
  const buttons = [...bar.querySelectorAll('button[data-label]')];
  function setMode(on) {
    annotating = on;
    toggle.setAttribute('aria-pressed', String(on));
    bar.hidden = !on;
  }
  toggle.addEventListener('click', () => setMode(!annotating));
  // Another tab changed the labels: read them again (no write back, so no echo).
  window.addEventListener('storage', event => {
    if (event.key !== E.ANNOTATIONS_KEY && event.key !== null) return;
    mine = store.read();
    changed();
  });
  buttons.forEach(b => b.addEventListener('click', () => label(b.dataset.label)));
  q('annotate-next').addEventListener('click', () => next(false));
  document.addEventListener('keydown', event => {
    if (!annotating || event.altKey || event.ctrlKey || event.metaKey || event.repeat) return;
    if (event.target.closest?.('input, select, textarea, [contenteditable="true"]')) return;
    const key = event.key.toLowerCase();
    if (key === 'g' || key === 'b') { event.preventDefault(); label(key === 'g' ? 'good' : 'bad'); }
    else if (key === 'n') { event.preventDefault(); next(false); }
  });

  function label(value) {
    const id = selected();
    if (!id) return;
    const nextLabels = { ...mine };
    if (E.LABEL_VALUES.includes(value)) nextLabels[id] = value; else delete nextLabels[id];
    mine = nextLabels;
    store.write(mine);
    changed();
  }
  // The next unlabelled trace in list order after the open one (`here`: the open one too).
  function next(scroll, here = false) {
    const list = order();
    const all = [...list, ...data.traces.map(t => t.id).filter(id => !list.includes(id))];
    const at = all.indexOf(selected()) + (here ? 0 : 1);
    const id = [...all.slice(at), ...all.slice(0, at)].find(t => !mine[t]);
    if (id) open(id, scroll);
    else progress();
  }
  function progress() {
    const n = Object.keys(mine).length;
    const text = n === total ? `All ${total} labelled` : `${n} of ${total} labelled`;
    q('annotate-progress').textContent = store.ok ? text : `${text} (this browser blocks storage, so they last until you leave)`;
    q('review-progress').textContent = `${n} of ${total} labelled by you`;
    q('review-download').disabled = n === 0;
    const aside = store.aside;
    const k = aside ? Object.keys(aside.labels).length : 0;
    q('review-aside').hidden = !aside;
    if (aside) put(q('review-aside-text'), `${SET_ASIDE} (${k}): trace numbers may have moved, so they are kept, not compared.`);
    q('review-clear').disabled = n === 0 && !aside;
  }
  function sync() {
    const id = selected();
    const value = id ? mine[id] : undefined;
    buttons.forEach(b => b.setAttribute('aria-pressed', String(Boolean(b.dataset.label) && b.dataset.label === value)));
    q('annotate-current').textContent = id ? `Trace #${Number(id.slice(1))}: ${value === 'good' ? 'Good' : value === 'bad' ? 'Bad' : 'not labelled'}` : '';
    progress();
  }
  function changed() {
    sync();
    onLabels();
    if (built) table();
  }

  // review block
  q('review-start').addEventListener('click', () => { setMode(true); next(true, true); });
  q('review-download').addEventListener('click', () => download(E.labelsFile(mine, today(), null, dataset), 'human-labels.json'));
  q('review-aside-download').addEventListener('click', () => {
    const aside = store.aside;
    if (aside) download(fileOf(aside), `human-labels-${aside.dataset || 'earlier'}.json`);
  });
  // Clearing asks once more on the same button, without a dialog.
  let confirmUntil = 0;
  const clear = q('review-clear');
  clear.addEventListener('click', () => {
    const n = Object.keys(mine).length + Object.keys(store.aside?.labels || {}).length;
    if (Date.now() > confirmUntil) {
      confirmUntil = Date.now() + 5000;
      clear.textContent = `Press again to clear ${n} ${n === 1 ? 'label' : 'labels'}`;
      setTimeout(() => { if (Date.now() >= confirmUntil) clear.textContent = 'Clear my labels'; }, 5100);
      return;
    }
    confirmUntil = 0;
    clear.textContent = 'Clear my labels';
    mine = {};
    store.clearAside();
    store.write(mine);
    changed();
  });

  // agreement table: one row per check, Cesar's labels and yours side by side
  const tbody = q('agree-rows');
  tbody.addEventListener('click', event => { const b = event.target.closest('button[data-row]'); if (b) pick(b.dataset.row); });
  tbody.addEventListener('focusin', event => { const b = event.target.closest('button[data-row]'); if (b) pick(b.dataset.row); });
  function pick(id) {
    if (focusRow === id) return;
    focusRow = id;
    tbody.querySelectorAll('button[data-row]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.row === id)));
    tbody.querySelectorAll('tr').forEach(tr => tr.classList.toggle('is-on', tr.dataset.row === id));
    matrices();
  }
  let rowsCesar = [];
  let rowsMine = [];
  function table() {
    const s = scoring();
    rowsCesar = E.agreementRows(data.evaluators, s, cesar.labels);
    rowsMine = E.agreementRows(data.evaluators, s, mine);
    tbody.replaceChildren();
    rowsCesar.forEach((rc, i) => {
      const rm = rowsMine[i];
      const tr = el('tr', rc.id === 'all' ? 'obs-agree-all' : '', tbody);
      tr.dataset.row = rc.id;
      tr.classList.toggle('is-on', rc.id === focusRow);
      const th = el('th', '', tr);
      th.scope = 'row';
      const b = el('button', 'obs-agree-name', th, rc.name);
      b.type = 'button';
      b.dataset.row = rc.id;
      b.setAttribute('aria-pressed', String(rc.id === focusRow));
      for (const r of [rc, rm]) {
        el('td', 'obs-agree-n', tr, String(r.n));
        // Like the compare table: a share resting on fewer than five traces is dimmed.
        el('td', r.agree === null || r.n < E.MIN_KAPPA_N ? 'is-dim' : '', tr, pct(r.agree));
        el('td', r.kappa === null ? 'is-dim' : '', tr, fixed(r.kappa));
      }
    });
    const n = Object.keys(cesar.labels).length;
    q('agree-head-cesar').textContent = n ? 'Cesar’s labels' : cesarAside ? 'Cesar’s labels · set aside' : 'Cesar’s labels · not labelled yet';
    q('agree-cesar').textContent = n
      ? `Cesar’s labels: ${n} ${n === 1 ? 'trace' : 'traces'}${cesar.date ? `, labelled ${cesar.date}` : ''}.`
      : cesarAside ? `Cesar’s labels: ${SET_ASIDE}.`
        : 'Cesar’s labels: not labelled yet. His column fills in when the file data/human-labels.json has labels.';
    matrices();
  }
  function matrices() {
    const box = q('confusion');
    box.replaceChildren();
    const at = rowsCesar.findIndex(r => r.id === focusRow);
    if (at < 0) return;
    for (const [who, r] of [['Cesar’s labels', rowsCesar[at]], ['Your labels', rowsMine[at]]]) {
      const table = el('table', 'obs-table obs-confusion-table', box);
      el('caption', '', table, `${who} × ${r.name}: ${r.n} ${r.n === 1 ? 'trace' : 'traces'}`);
      const head = el('tr', '', el('thead', '', table));
      el('td', '', head);
      el('th', '', head, r.id === 'all' ? 'All pass' : 'Check passes').scope = 'col';
      el('th', '', head, r.id === 'all' ? 'One fails' : 'Check fails').scope = 'col';
      const body = el('tbody', '', table);
      for (const [name, a, b] of [['Good', 'gp', 'gf'], ['Bad', 'bp', 'bf']]) {
        const tr = el('tr', '', body);
        el('th', '', tr, `${who.startsWith('Cesar') ? 'Cesar' : 'You'} said ${name}`).scope = 'row';
        for (const key of [a, b]) el('td', !r.m[key] ? 'is-zero' : key === 'gp' || key === 'bf' ? 'is-agree' : 'is-disagree', tr, String(r.m[key]));
      }
    }
  }

  const build = () => { built = true; table(); };
  D.whenNear(q('review-block'), build);
  sync();

  return {
    select: sync,
    labelOf: id => mine[id],
    setCesar(json) {
      const parsed = E.parseLabels(json, ids);
      cesarAside = !E.labelsFit(parsed, dataset);
      cesar = cesarAside ? { ...parsed, labels: {} } : parsed;
      cesar.labeler ||= 'Cesar Tortolero';
      if (built) table();
    },
    annotate(on = true) { setMode(on); },
    rescored() { if (built) table(); },
  };
}

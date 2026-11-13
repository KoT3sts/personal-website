// The analysis behind the dashboard's release gate, human review, agent graph, failure
// analysis, pass rate by day, sessions and compare views (web/lab/obs-eval.js), on small
// fixtures and on the real export; plus the page markup those views rely on. Node only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import * as D from '../web/lab/obs-data.js';
import * as E from '../web/lab/obs-eval.js';
import { labelStore } from '../web/lab/obs-review.js';

const web = new URL('../web/', import.meta.url);
const read = path => readFileSync(new URL(path, web), 'utf8');
const page = read('lab/agent-observability.html');
const data = JSON.parse(read('lab/data/agent-traces.json'));
const index = D.evalIndex(data.evaluations);
const checks = E.passFail(data.evaluators);
const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} ≈ ${b}`);

// ---- kappa and agreement ----------------------------------------------------------

test('Cohen’s kappa: perfect agreement is 1, chance is 0, the textbook table is 0.4, total chance is undefined', () => {
  assert.equal(E.kappa({ gp: 12, gf: 0, bp: 0, bf: 8 }), 1);
  near(E.kappa({ gp: 25, gf: 25, bp: 25, bf: 25 }), 0);
  // 50 items: both yes 20, A yes / B no 5, A no / B yes 10, both no 15 -> po 0.7, pe 0.5, kappa 0.4
  near(E.kappa({ gp: 20, gf: 5, bp: 10, bf: 15 }), 0.4, 1e-12);
  near(E.kappa({ gp: 0, gf: 10, bp: 10, bf: 0 }), -1);
  // Near-chance on an unbalanced table: po 0.68, pe 0.68
  near(E.kappa({ gp: 64, gf: 16, bp: 16, bf: 4 }), 0, 1e-12);
  assert.equal(E.kappa({ gp: 9, gf: 0, bp: 0, bf: 0 }), null, 'one label everywhere: pe = 1');
  assert.equal(E.kappa({ gp: 0, gf: 0, bp: 0, bf: 0 }), null, 'nothing to compare');
});

test('agreement: the share that agree, and kappa only from five traces up', () => {
  const m = E.confusion([[true, true], [true, false], [false, false], [false, false]]);
  assert.deepEqual(m, { gp: 1, gf: 1, bp: 0, bf: 2 });
  const small = E.agreement(m);
  assert.equal(small.n, 4);
  assert.equal(small.agree, 0.75);
  assert.equal(small.kappa, null, 'n < 5 shows a dash');
  const five = E.agreement(E.confusion([[true, true], [true, true], [false, false], [false, false], [true, false]]));
  assert.equal(five.n, 5);
  near(five.agree, 0.8);
  near(five.kappa, (0.8 - (3 / 5 * 2 / 5 + 2 / 5 * 3 / 5)) / (1 - (3 / 5 * 2 / 5 + 2 / 5 * 3 / 5)));
  assert.deepEqual(E.agreement(E.confusion([])), { n: 0, m: { gp: 0, gf: 0, bp: 0, bf: 0 }, agree: null, kappa: null });
  assert.equal(E.MIN_KAPPA_N, 5);
});

test('agreement rows: each check on the traces both scored, then all required checks against Good', () => {
  const scoring = E.rescore(data.evaluators, data.evaluations, E.gateDefaults(data.evaluators));
  // Label the first ten traces by a rule that matches "all checks pass" exactly: kappa 1 on the last row.
  const ids = data.traces.slice(0, 10).map(t => t.id);
  const allPass = id => ![...scoring.labels.get(id).values()].includes('fail');
  const labels = Object.fromEntries(ids.map(id => [id, allPass(id) ? 'good' : 'bad']));
  const rows = E.agreementRows(data.evaluators, scoring, labels);
  assert.deepEqual(rows.map(r => r.id), [...checks.map(e => e.id), 'all']);
  const all = rows.at(-1);
  assert.equal(all.n, 10);
  assert.equal(all.agree, 1);
  if (all.m.gp && all.m.bf) assert.equal(all.kappa, 1);
  for (const row of rows.slice(0, -1)) {
    const scored = ids.filter(id => index.get(id)?.has(row.id));
    assert.equal(row.n, scored.length, `${row.id}: only traces the check scored`);
    const agree = scored.filter(id => (labels[id] === 'good') === (index.get(id).get(row.id).label === 'pass')).length;
    assert.equal(row.agree, scored.length ? agree / scored.length : null, row.id);
  }
  // No labels: every row is empty, nothing breaks.
  assert.ok(E.agreementRows(data.evaluators, scoring, {}).every(r => r.n === 0 && r.agree === null && r.kappa === null));
  // The overall row follows the gate: with no check required nothing is scored.
  const none = E.rescore(data.evaluators, data.evaluations, Object.fromEntries(checks.map(e => [e.id, { require: false, value: null }])));
  assert.equal(E.agreementRows(data.evaluators, none, labels).at(-1).n, 0);
});

test('labels: the file shape, unknown ids and values dropped, downloads in trace order', () => {
  const ids = new Set(data.traces.map(t => t.id));
  const parsed = E.parseLabels({ labeler: 'Someone', dataset: 'abc123def456', date: '2026-11-12', labels: { t03: 'good', t01: 'bad', t999: 'good', t02: 'meh', x: 'good', __proto__: 'good' } }, ids);
  assert.deepEqual(parsed, { labeler: 'Someone', dataset: 'abc123def456', date: '2026-11-12', labels: { t03: 'good', t01: 'bad' } });
  assert.deepEqual(E.parseLabels(null, ids), { labeler: null, dataset: null, date: null, labels: {} });
  assert.deepEqual(E.parseLabels({ labels: 'nope', date: 'yesterday', dataset: '../x' }, ids), { labeler: null, dataset: null, date: null, labels: {} });
  assert.deepEqual(E.parseLabels({ labels: { t999: 'good' } }, null).labels, { t999: 'good' }, 'set-aside labels keep ids the current export lacks');
  assert.deepEqual(JSON.stringify(E.labelsFile({ t10: 'bad', t02: 'good' }, '2026-11-12', null, 'abc123def456')), JSON.stringify({ labeler: null, dataset: 'abc123def456', date: '2026-11-12', labels: { t02: 'good', t10: 'bad' } }));
  // Cesar's file starts empty, in the same shape the download writes, on the current export.
  const file = JSON.parse(read('lab/data/human-labels.json'));
  assert.deepEqual(Object.keys(file), ['labeler', 'dataset', 'date', 'labels']);
  assert.equal(file.labeler, 'Cesar Tortolero');
  assert.equal(file.dataset, data.meta.dataset, 'the labels file names the current export');
  assert.match(data.meta.dataset, /^[0-9a-f]{12}$/);
  assert.deepEqual(E.parseLabels(file, ids).labels, file.labels, 'every label in the file is valid');
  // Labels count only on the export they were made on; an empty file fits any.
  const one = { labels: { t01: 'good' } };
  assert.equal(E.labelsFit(E.parseLabels({ ...one, dataset: data.meta.dataset }, ids), data.meta.dataset), true);
  assert.equal(E.labelsFit(E.parseLabels({ ...one, dataset: 'aaaaaaaaaaaa' }, ids), data.meta.dataset), false);
  assert.equal(E.labelsFit(E.parseLabels(one, ids), data.meta.dataset), false, 'no dataset: made before exports had one');
  assert.equal(E.labelsFit(E.parseLabels({ labels: {} }, ids), data.meta.dataset), true);
  assert.equal(E.ANNOTATIONS_KEY, 'cesar:portfolio:obs-annotations:v1');
});

test('the visitor’s labels only touch localStorage, under one key, and are never sent', () => {
  const sources = ['lab/observability.js', 'lab/obs-data.js', 'lab/obs-charts.js', 'lab/obs-eval.js', 'lab/obs-review.js', 'lab/obs-views.js'].map(read);
  const review = read('lab/obs-review.js');
  assert.ok(sources.filter(s => /localStorage/.test(s)).length === 1 && /localStorage/.test(review), 'only obs-review.js uses storage');
  assert.deepEqual([...review.matchAll(/\.(getItem|setItem|removeItem)\(([^,)]+)/g)].map(m => m[2]), ['E.ANNOTATIONS_KEY', 'E.ANNOTATIONS_KEY', 'E.ANNOTATIONS_KEY']);
  assert.doesNotMatch(review, /fetch\(|sendBeacon|XMLHttpRequest/);
  assert.match(page, /never sent anywhere/);
  assert.match(page, /the page sends nothing to any server; it only loads its own files\./);
  assert.match(page, /<div class="obs-review-aside" data-obs="review-aside" hidden>\s*<p class="obs-hint" data-obs="review-aside-text">Labels were made on an earlier export and were set aside\.<\/p>\s*<button type="button" class="obs-btn obs-btn-small" data-obs="review-aside-download">/);
  // Another tab's change is read again; the review table dims a share resting on fewer than five traces.
  assert.match(review, /window\.addEventListener\('storage', event => \{\s*if \(event\.key !== E\.ANNOTATIONS_KEY && event\.key !== null\) return;/);
  assert.match(review, /el\('td', r\.agree === null \|\| r\.n < E\.MIN_KAPPA_N \? 'is-dim' : ''/);
});

// A fake localStorage for the label store.
function fakeStorage(t, { failWrites = false } = {}) {
  const items = new Map();
  const storage = {
    getItem: k => (items.has(k) ? items.get(k) : null),
    setItem: (k, v) => { if (failWrites) throw new Error('QuotaExceededError'); items.set(k, String(v)); },
    removeItem: k => { if (failWrites) throw new Error('SecurityError'); items.delete(k); },
  };
  globalThis.window = { localStorage: storage };
  t.after(() => { delete globalThis.window; });
  return items;
}

test('label store: corrupt JSON is no labels, not blocked storage; only a failed write marks it blocked', t => {
  const ids = new Set(data.traces.map(x => x.id));
  const items = fakeStorage(t);
  items.set(E.ANNOTATIONS_KEY, '{not json');
  const store = labelStore(ids, data.meta.dataset);
  assert.deepEqual(store.read(), {});
  assert.equal(store.ok, true, 'a corrupt record does not flip the storage flag');
  store.write({ t02: 'bad', t01: 'good' });
  const saved = JSON.parse(items.get(E.ANNOTATIONS_KEY));
  assert.deepEqual(saved, { labeler: null, dataset: data.meta.dataset, date: saved.date, labels: { t01: 'good', t02: 'bad' } });
  assert.deepEqual(labelStore(ids, data.meta.dataset).read(), { t01: 'good', t02: 'bad' }, 'a second tab reads the same labels');
  store.write({});
  assert.equal(items.has(E.ANNOTATIONS_KEY), false, 'no labels, no record');
  fakeStorage(t, { failWrites: true });
  const blocked = labelStore(ids, data.meta.dataset);
  blocked.write({ t01: 'good' });
  assert.equal(blocked.ok, false);
  assert.deepEqual(blocked.read(), {}, 'reading after a failed write still works');
});

test('label store: labels from another export are set aside, kept through new writes, and cleared on request', t => {
  const ids = new Set(data.traces.map(x => x.id));
  const items = fakeStorage(t);
  items.set(E.ANNOTATIONS_KEY, JSON.stringify({ labeler: null, dataset: 'aaaaaaaaaaaa', date: '2026-11-11', labels: { t01: 'good', t999: 'bad' } }));
  const store = labelStore(ids, data.meta.dataset);
  assert.deepEqual(store.read(), {}, 'not compared');
  assert.deepEqual(store.aside, { labeler: null, dataset: 'aaaaaaaaaaaa', date: '2026-11-11', labels: { t01: 'good', t999: 'bad' } });
  assert.equal(store.ok, true);
  store.write({ t03: 'bad' });
  const saved = JSON.parse(items.get(E.ANNOTATIONS_KEY));
  assert.deepEqual(saved.labels, { t03: 'bad' });
  assert.deepEqual(saved.setAside, { labeler: null, dataset: 'aaaaaaaaaaaa', date: '2026-11-11', labels: { t01: 'good', t999: 'bad' } }, 'still downloadable');
  const again = labelStore(ids, data.meta.dataset);
  assert.deepEqual(again.read(), { t03: 'bad' });
  assert.equal(again.aside.dataset, 'aaaaaaaaaaaa');
  again.clearAside();
  again.write({});
  assert.equal(items.has(E.ANNOTATIONS_KEY), false);
  // A record from before exports had an id is set aside too.
  items.set(E.ANNOTATIONS_KEY, JSON.stringify({ labeler: null, date: '2026-11-12', labels: { t01: 'good' } }));
  const old = labelStore(ids, data.meta.dataset);
  assert.deepEqual(old.read(), {});
  assert.deepEqual(old.aside.labels, { t01: 'good' });
});

// ---- release gate -------------------------------------------------------------------

test('release gate: every pass/fail check has a control whose default is its published threshold', () => {
  const defaults = E.gateDefaults(data.evaluators);
  assert.deepEqual(Object.keys(defaults), checks.map(e => e.id));
  for (const e of checks) {
    const c = E.GATE[e.id];
    assert.ok(c, `${e.id} has a control`);
    assert.equal(E.gateThreshold(e, defaults[e.id]), e.threshold, `${e.id}: the default is the published threshold, exactly`);
    if (c.toggle) {
      const scores = new Set(data.evaluations.filter(ev => ev.evaluator === e.id).map(ev => ev.score));
      assert.ok([...scores].every(v => v === 0 || v === 1), `${e.id} is a 1/0 check, so only a toggle`);
      continue;
    }
    const v = defaults[e.id].value;
    assert.ok(v >= c.min && v <= c.max, `${e.id} default ${v} inside ${c.min}–${c.max}`);
    assert.ok(Number.isInteger(Math.round((v - c.min) / c.step * 1e6) / 1e6), `${e.id} default on a step`);
    assert.ok(c.rule(v).length > 10, `${e.id} rule in words`);
    assert.match(c.rule(c.min + c.step), /\d/, `${e.id} rule names a moved threshold`);
  }
});

test('release gate: re-scoring at the defaults reproduces every published label, and blocks what “Failed a check” finds', () => {
  const scoring = E.rescore(data.evaluators, data.evaluations, E.gateDefaults(data.evaluators));
  let n = 0;
  for (const ev of data.evaluations) {
    if (!checks.some(e => e.id === ev.evaluator)) continue;
    assert.equal(scoring.labels.get(ev.trace).get(ev.evaluator), ev.label, `${ev.trace}/${ev.evaluator}`);
    n += 1;
  }
  assert.equal(n, D.sum(Object.values(data.rollups.checks).map(c => c.pass + c.fail)));
  const failed = D.filterTraces(data.traces, index, { ...D.EMPTY_FILTERS, failed: true }).map(t => t.id);
  assert.deepEqual(scoring.blocked, failed);
  assert.equal(scoring.scored, new Set(data.evaluations.filter(ev => checks.some(e => e.id === ev.evaluator)).map(ev => ev.trace)).size);
  for (const e of checks) assert.equal(scoring.fails[e.id], data.rollups.checks[e.id].fail, e.id);
  const top = Object.entries(data.rollups.checks).sort((a, b) => b[1].fail - a[1].fail)[0];
  assert.deepEqual(scoring.top, { id: top[0], fails: top[1].fail });
  // The page's static verdict is the same numbers.
  assert.match(page, new RegExp(`data-obs="gate-n">${scoring.blocked.length}<`));
  assert.match(page, new RegExp(`data-obs="gate-of">${scoring.scored}<`));
  const name = data.evaluators.find(e => e.id === top[0]).name;
  assert.ok(page.includes(`>${scoring.blocked.length} of ${scoring.scored} scored runs would be blocked. ${name} blocks the most: ${top[1].fail} runs.</p>`));
  assert.ok(page.includes(`block ${scoring.blocked.length}: the same runs the “Failed a check” filter finds.`));
  assert.ok(page.includes(`data-obs="gate-float" aria-hidden="true">${scoring.blocked.length} of ${scoring.scored} blocked · most by ${name}</p>`));
});

test('release gate: moving a threshold or dropping a check changes exactly the runs it should', () => {
  const gate = E.gateDefaults(data.evaluators);
  const with_ = (id, patch) => E.rescore(data.evaluators, data.evaluations, { ...gate, [id]: { ...gate[id], ...patch } });
  // Tool errors: 0% lets no error through.
  const strict = with_('tool_error_rate', { value: 0 });
  assert.equal(strict.fails.tool_error_rate, data.traces.filter(t => t.toolCalls > 0 && t.toolErrors > 0).length);
  // A 60 s latency budget passes every trace (the slowest p90 is under it).
  const max = Math.max(...data.evaluations.filter(ev => ev.evaluator === 'latency_budget').map(ev => ev.score));
  assert.ok(max < 60);
  assert.equal(with_('latency_budget', { value: 60 }).fails.latency_budget, 0);
  // Not requiring a check keeps its labels but stops it from blocking.
  const off = with_('review_before_commit', { require: false });
  assert.equal(off.fails.review_before_commit, 0);
  assert.ok(off.labels.get(data.evaluations.find(ev => ev.evaluator === 'review_before_commit').trace).has('review_before_commit'));
  assert.ok(off.blocked.length < E.rescore(data.evaluators, data.evaluations, gate).blocked.length);
  // Nothing required: nothing scored, nothing blocked.
  const none = E.rescore(data.evaluators, data.evaluations, Object.fromEntries(checks.map(e => [e.id, { require: false, value: gate[e.id].value }])));
  assert.deepEqual([none.scored, none.blocked.length, none.top], [0, 0, null]);
  // Directions follow the exporter.
  assert.equal(E.DIRECTIONS.atMost(0.1, 0.1), true);
  assert.equal(E.DIRECTIONS.below(30, 30), false);
  assert.equal(E.DIRECTIONS.atLeast(1, 1), true);
});

// ---- monitor, sessions, compare ------------------------------------------------------

test('pass rate by day: every scored run lands on its day; a day with none is a gap, not a zero', () => {
  const days = E.daysOf(data.traces);
  assert.deepEqual(days, Object.keys(data.rollups.byDay));
  for (const e of checks) {
    const rows = E.passRateByDay(data.traces, data.evaluations, e.id, days);
    assert.deepEqual(rows.map(r => r.day), days);
    assert.equal(D.sum(rows.map(r => r.n)), data.rollups.checks[e.id].pass + data.rollups.checks[e.id].fail, e.id);
    assert.equal(D.sum(rows.map(r => r.pass)), data.rollups.checks[e.id].pass, e.id);
    for (const r of rows) assert.equal(r.rate, r.n ? r.pass / r.n : null, `${e.id} ${r.day}`);
  }
  const gaps = checks.flatMap(e => E.passRateByDay(data.traces, data.evaluations, e.id, days)).filter(r => r.n === 0);
  assert.ok(gaps.length > 0 && gaps.every(r => r.rate === null), 'the data has gaps, drawn as gaps');
});

test('sessions and compare groups agree with the rollups', () => {
  const groups = E.compareGroups(data.traces);
  assert.equal(groups[0].ids.size, data.traces.length);
  const halves = groups.filter(g => g.id.startsWith('days:'));
  const days = E.daysOf(data.traces);
  const cut = Math.ceil(days.length / 2);
  assert.deepEqual(halves.map(g => g.id), [`days:${days[0]}:${days[cut - 1]}`, `days:${days[cut]}:${days.at(-1)}`], 'the halves come from the days in the data');
  assert.deepEqual(halves.map(g => g.label), [E.dayRange(days.slice(0, cut)), E.dayRange(days.slice(cut))]);
  assert.equal(halves[0].ids.size + halves[1].ids.size, data.traces.length, 'the two halves split the window');
  assert.deepEqual([E.dayRange(['2026-11-07', '2026-11-08', '2026-11-09']), E.dayRange(['2026-11-30', '2026-12-02']), E.dayRange(['2026-11-12'])], ['Nov 7–9', 'Nov 30 – Dec 2', 'Nov 12']);
  // Odd day counts give the first half the middle day; one day gives no halves.
  const odd = ['2026-11-01', '2026-11-02', '2026-11-03'].map((day, i) => ({ id: `t0${i + 1}`, day, session: 'S1' }));
  assert.deepEqual(E.compareGroups(odd).filter(g => g.id.startsWith('days:')).map(g => g.ids.size), [2, 1]);
  assert.equal(E.compareGroups(odd.slice(0, 1)).filter(g => g.id.startsWith('days:')).length, 0);
  for (const [id, s] of Object.entries(data.rollups.sessions)) {
    const g = groups.find(x => x.id === `session:${id}`);
    assert.equal(g.ids.size, s.traces, id);
    for (const r of E.groupRates(data.evaluators, data.evaluations, g.ids)) {
      const c = s.checks[r.id];
      if (!c) { assert.equal(r.n, 0, `${id} ${r.id} not scored`); continue; }
      assert.deepEqual([r.pass, r.n], [c.pass, c.scored], `${id} ${r.id}`);
      near(r.rate, c.rate, 5e-5);
    }
  }
  for (const r of E.groupRates(data.evaluators, data.evaluations, groups[0].ids)) assert.deepEqual([r.pass, r.n], [data.rollups.checks[r.id].pass, data.rollups.checks[r.id].pass + data.rollups.checks[r.id].fail]);
  // The presets come from the data: the two halves, the last two sessions (S10 sorts after S9).
  const sessions = D.sessionsOf(data.traces);
  assert.deepEqual(sessions, Object.keys(data.rollups.sessions));
  assert.deepEqual(D.sessionsOf([{ session: 'S10' }, { session: 'S9' }, { session: 'S1' }]), ['S1', 'S9', 'S10']);
  const presets = E.comparePresets(groups);
  assert.deepEqual(presets.days, { a: halves[0].id, b: halves[1].id, label: `${halves[0].label} vs ${halves[1].label}` });
  assert.deepEqual(presets.sessions, { a: `session:${sessions.at(-2)}`, b: `session:${sessions.at(-1)}`, label: `${sessions.at(-2)} vs ${sessions.at(-1)}` });
  assert.deepEqual(E.comparePresets(E.compareGroups(odd.slice(0, 1))), { days: null, sessions: null });
  assert.match(page, /data-cmp="days">First half vs second half</);
  assert.match(page, /data-cmp="sessions">Last two sessions</);
  assert.doesNotMatch(read('lab/obs-views.js') + read('lab/obs-eval.js'), /'session:S\d|2026-11-/, 'no session or date is written into the code');
  assert.match(page, /Descriptive, not an experiment: the groups did different tasks/);
});

// ---- failures and the agent graph ------------------------------------------------------

test('failure analysis: calls per class equal the rollup; every class has plain words', () => {
  const stats = E.errorClassStats(data.traces, data.meta.errorClasses);
  assert.deepEqual(Object.fromEntries(stats.map(s => [s.cls, s.calls])), data.rollups.errorClasses);
  for (const s of stats) {
    assert.equal(s.traces, data.traces.filter(t => D.errorClassesOf(t)[s.cls]).length, s.cls);
    assert.ok(D.ERROR_CLASS_WORDS[s.cls]?.length > 10, `${s.cls} described`);
  }
  // A span's class count: a failed TOOL span counts once, a CHAIN its merged count.
  assert.equal(D.spanClassCount({ kind: 'TOOL', status: 'error', errorClass: 'timeout' }, 'timeout'), 1);
  assert.equal(D.spanClassCount({ kind: 'TOOL', status: 'ok' }, 'timeout'), 0);
  assert.equal(D.spanClassCount({ kind: 'CHAIN', errorClasses: { timeout: 3 } }, 'timeout'), 3);
  assert.match(page, /The message itself is private and never published; only its class is\./);
});

test('agent graph: a fixed layout, orchestrators left and subagents right, sized and coloured from the rollup', () => {
  const graph = data.rollups.agentGraph;
  const a = E.graphLayout(graph);
  assert.deepEqual(E.graphLayout(graph), a, 'deterministic');
  assert.equal(a.nodes.length, graph.nodes.length);
  assert.equal(a.edges.length, graph.edges.length);
  const targets = new Set(graph.edges.map(e => e.to));
  for (const n of a.nodes) {
    assert.equal(n.root, !targets.has(n.agent), n.agent);
    assert.equal(n.x, n.root ? 0.1 : 0.5, n.agent);
    assert.ok(n.y > 0 && n.y < 1, `${n.agent} y ${n.y}`);
    assert.ok(n.r >= 7 && n.r <= 22, `${n.agent} r ${n.r}`);
    assert.equal(n.bucket, E.rateBucket(n.toolErrors, n.toolCalls));
  }
  const roots = a.nodes.filter(n => n.root).map(n => n.y);
  for (let i = 1; i < roots.length; i++) assert.ok(roots[i] - roots[i - 1] >= 0.2 - 1e-9, 'roots keep their distance');
  const subs = a.nodes.filter(n => !n.root);
  for (let i = 1; i < subs.length; i++) assert.ok(subs[i].y > subs[i - 1].y);
  assert.equal(subs[0].agent, graph.edges.reduce((m, e) => (e.count > m.count ? e : m)).to, 'the most-started subagent is on top');
  assert.equal(a.nodes[0].agent, 'build');
  assert.match(E.edgePath(a.edges[0]), /^M[\d.]+ [\d.]+C[\d.]+ [\d.]+ [\d.]+ [\d.]+ [\d.]+ [\d.]+$/);
  assert.equal(E.rateBucket(0, 10), 0);
  assert.equal(E.rateBucket(1, 100), 1);
  assert.equal(E.rateBucket(3, 100), 2);
  assert.equal(E.rateBucket(1, 10), 3);
  assert.equal(E.rateBucket(0, 0), -1, 'no tool calls');
  const narrow = E.graphLayout(graph, { left: 0.07, right: 0.44 });
  assert.ok(narrow.nodes.every(n => n.x === (n.root ? 0.07 : 0.44)));
  // Every trace's path and edges are drawn: its agents are nodes and its handoffs are edges.
  const names = new Set(graph.nodes.map(n => n.agent));
  const pairs = new Set(graph.edges.map(e => `${e.from}>${e.to}`));
  for (const t of data.traces) {
    assert.ok(t.agentPath.every(n => names.has(n)), t.id);
    assert.ok(t.agentEdges.every(e => pairs.has(`${e.from}>${e.to}`)), t.id);
  }
});

// ---- the page --------------------------------------------------------------------------

test('page order: trace list and waterfall first, then gate, review, graph, failures, monitor, sessions, compare and the charts', () => {
  const at = marker => { const i = page.indexOf(marker); assert.ok(i > 0, marker); return i; };
  const order = ['data-obs="filters"', 'id="obs-traces-title"', 'data-obs="detail"', 'data-obs="gate-block"', 'data-obs="review-block"', 'data-obs="graph-block"',
    'data-obs="fail-block"', 'data-obs="monitor-block"', 'data-obs="sessions-block"', 'data-obs="compare-block"', 'data-obs="charts"', 'id="obs-evals-title"', 'id="obs-download-title"', 'id="obs-data-title"'];
  const positions = order.map(at);
  assert.deepEqual([...positions].sort((x, y) => x - y), positions);
  // Every jump link has a target.
  const toc = page.match(/<nav class="obs-toc"[\s\S]*?<\/nav>/)[0];
  const links = [...toc.matchAll(/href="#([^"]+)"/g)].map(m => m[1]);
  assert.ok(links.length >= 10);
  for (const id of links) assert.ok(page.includes(`id="${id}"`), id);
  // Each new section has a heading and a one-line hint.
  for (const block of ['gate-block', 'review-block', 'graph-block', 'fail-block', 'monitor-block', 'sessions-block', 'compare-block']) {
    const html = page.slice(page.indexOf(`data-obs="${block}"`));
    assert.match(html.slice(0, 600), /<h2 id="obs-[a-z]+-title">[^<]+<\/h2>\s*<p class="obs-hint">[^<]+<\/p>/, block);
  }
  assert.match(page, /An offline re-scoring of recorded runs: the scores are fixed and only the thresholds move\. Arize runs the live version on new traffic and calls it online evals\./);
  // Annotate: buttons with their shortcuts.
  for (const [label, key] of [['good', 'G'], ['bad', 'B']]) assert.match(page, new RegExp(`data-label="${label}" aria-keyshortcuts="${key}" aria-pressed="false">`));
  assert.match(page, /data-obs="annotate-next" aria-keyshortcuts="N">Next unlabelled/);
  assert.match(page, /Cohen’s kappa/);
});

test('download: both files linked with their sizes, the attributes they use, and an untested Phoenix snippet', () => {
  for (const file of ['agent-traces.json', 'agent-traces.openinference.jsonl']) {
    assert.match(page, new RegExp(`<a class="lab-link" href="\\./data/${file.replace(/\./g, '\\.')}" download>`));
    const size = page.match(new RegExp(`data-size="${file.replace(/\./g, '\\.')}">([^<]+)<`))[1];
    assert.equal(size, `${Math.round(statSync(new URL(`lab/data/${file}`, web)).size / 1000)} KB`, file);
  }
  const listed = [...page.match(/<ul class="obs-attrs"[\s\S]*?<\/ul>/)[0].matchAll(/<code>(.+?)<\/code>/g)].map(m => m[1].replace(/<wbr>/g, ''));
  // error.class.<class> stands for one attribute per class (error.class.not_found, …).
  const used = new Set(read('lab/data/agent-traces.openinference.jsonl').trimEnd().split('\n').flatMap(line => Object.keys(JSON.parse(line).attributes))
    .map(key => (/^error\.class\.[a-z_]+$/.test(key) ? 'error.class.&lt;class&gt;' : key)));
  assert.deepEqual(new Set(listed), used, 'the list is exactly the attributes in the file');
  const code = page.match(/<pre class="lab-code"[^>]*><code>([\s\S]*?)<\/code><\/pre>/)[1];
  assert.match(code, /OTLPSpanExporter\(endpoint="http:\/\/localhost:6006\/v1\/traces"\)/);
  assert.match(code, /pd\.read_json\("agent-traces\.openinference\.jsonl", lines=True\)/);
  assert.doesNotMatch(code, /[<>&]/, 'no characters that need escaping inside the code block');
  // Run unchanged against Phoenix 20.16.0 on 2026-11-13: it showed every trace and every published span.
  assert.match(page, /<strong>Tested November 13, 2026\.<\/strong> This snippet ran unchanged against a local Arize Phoenix 20\.16\.0/);
  assert.equal(page.match(/<span data-phoenix-traces>([^<]+)<\/span>/)[1], D.formatInt(data.traces.length));
  assert.equal(page.match(/<span data-phoenix-spans>([^<]+)<\/span>/)[1], D.formatInt(read('lab/data/agent-traces.openinference.jsonl').trimEnd().split('\n').length));
  assert.doesNotMatch(page, /Not run here/);
  const shot = page.match(/<figure class="obs-shot">\s*<img ([^>]+)>\s*<figcaption>([^<]+)<\/figcaption>/);
  assert.ok(shot, 'the Phoenix screenshot sits next to the snippet, with a caption');
  assert.match(shot[1], /^src="\.\/phoenix-traces\.webp" width="1178" height="900" loading="lazy" decoding="async" alt="Arize Phoenix [^"]{40,}"$/);
  const webp = readFileSync(new URL('lab/phoenix-traces.webp', web));
  assert.equal(webp.toString('ascii', 0, 4), 'RIFF');
  assert.equal(webp.toString('ascii', 8, 12), 'WEBP');
  assert.ok(webp.length <= 60_000, `${webp.length} bytes`);
  assert.match(shot[2], /Total Cost column, that is its own estimate from model names and token counts, not a real cost: the work ran on a flat-rate subscription/);
  assert.match(page, /the spans get new trace and span ids/);
  // The docs link is Phoenix's OTLP exporter page, not the import-existing-traces page.
  assert.match(page, /Phoenix docs: <a class="lab-link" href="https:\/\/arize\.com\/docs\/phoenix\/tracing\/concepts-tracing\/otel-openinference\/exporter">Exporter and OTLP<\/a>/);
  assert.doesNotMatch(page, /importing-existing-traces/);
});

test('the essay and the homepage keep their imports from obs-data.js', () => {
  assert.equal(typeof D.topic, 'function');
  assert.equal(typeof D.dayLabel, 'function');
  assert.equal(D.topic(data.traces[0]), data.traces[0].topic);
  assert.equal(D.topic({}), 'site work');
});

test('the "What my labels showed" note matches Cesar’s labels and the data', () => {
  const labels = JSON.parse(read('lab/data/human-labels.json')).labels;
  const note = page.match(/<div class="obs-finding"[\s\S]*?<\/div>/)[0].replace(/<[^>]+>/g, '');
  const traces = data.traces;
  const good = traces.filter(t => labels[t.id] === 'good');
  assert.equal(Object.keys(labels).length, traces.length);
  assert.match(note, new RegExp(`all ${traces.length} runs myself: ${good.length} good, ${traces.length - good.length} bad`));
  const scoring = E.rescore(data.evaluators, data.evaluations, E.gateDefaults(data.evaluators));
  const rows = E.agreementRows(data.evaluators, scoring, labels);
  const k = id => rows.find(r => r.id === id).kappa.toFixed(2);
  assert.match(note, new RegExp(`reaches a kappa of ${k('all')}`));
  // Every check below zero is counted, not just the two review checks, and those two are the lowest.
  const checkRows = rows.filter(r => r.id !== 'all');
  const negative = checkRows.filter(r => r.kappa !== null && r.kappa < 0);
  const words = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
  assert.match(note, new RegExp(`and ${words[negative.length]} of the ${words[checkRows.length]} pass/fail checks fall below zero, most of all the two review checks`));
  assert.deepEqual(negative.sort((a, b) => a.kappa - b.kappa).slice(0, 2).map(r => r.id).sort(), ['review_addressed', 'review_before_commit']);
  const small = E.agreement(E.confusion(traces.map(t => [labels[t.id] === 'good', t.toolCalls < 40])));
  assert.match(note, new RegExp(`${Math.round(small.agree * 100)}% of the time \\(kappa ${small.kappa.toFixed(2)}, interval`));
  assert.ok(rows.filter(r => r.kappa !== null).every(r => r.kappa < small.kappa), 'size beats every check');
  const large = traces.filter(t => t.toolCalls >= 40);
  const bad = list => list.filter(t => labels[t.id] === 'bad').length;
  assert.match(note, new RegExp(`Of the ${large.length} runs with 40 calls or more I marked ${bad(large)} bad; of the ${traces.length - large.length} smaller ones, ${bad(traces.filter(t => t.toolCalls < 40))}`));
  const median = v => { const a = [...v].sort((x, y) => x - y); const m = a.length >> 1; return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2; };
  const of = lab => large.filter(t => labels[t.id] === lab);
  const mins = lab => Math.round(median(of(lab).map(t => (t.end - t.start) / 60000)));
  const calls = lab => median(of(lab).map(t => t.toolCalls));
  const rate = lab => (100 * median(of(lab).map(t => t.toolErrors / t.toolCalls))).toFixed(1);
  assert.match(note, new RegExp(`median of ${mins('bad')} minutes and ${calls('bad')} tool calls, the good ones ${mins('good')} minutes and ${calls('good')}`));
  assert.match(note, new RegExp(`a median of ${rate('bad')}% against ${rate('good')}%`));
  const largeLabels = Object.fromEntries(large.map(t => [t.id, labels[t.id]]));
  const rec = E.agreementRows(data.evaluators, scoring, largeLabels).find(r => r.id === 'recovered_after_error');
  assert.equal(rec.m.gf, 0, 'every long run that failed recovery is labelled bad');
  assert.match(note, new RegExp(`all ${rec.m.bf} runs that failed “Recovered after error” are runs I marked bad \\(kappa ${rec.kappa.toFixed(2)}, interval [^,]+, on ${rec.n} runs\\)`));
  const longRows = E.agreementRows(data.evaluators, scoring, largeLabels).filter(r => r.id !== 'recovered_after_error' && r.kappa !== null);
  const others = Math.max(...longRows.map(r => r.kappa));
  assert.ok(rec.kappa > 0.3 && others <= 0.075, 'only recovery agrees meaningfully on the long runs');
  assert.match(note, new RegExp(`every other check stays at ${others.toFixed(2)} or below`));
  // The 40-call line is the exporter's large-trace rule, fixed before the labels existed.
  assert.equal(data.meta.largeTrace.minToolCalls, 40);
  const errorRate = data.evaluators.find(e => e.id === 'tool_error_rate');
  assert.match(note, new RegExp(`the ${Math.round(errorRate.threshold * 100)}% threshold never fires on a long run`));
  const ids = new Set(large.map(t => t.id));
  assert.ok(data.evaluations.filter(e => e.evaluator === 'tool_error_rate' && ids.has(e.trace)).every(e => e.label === 'pass'), 'the recorded error-rate label passes on every long run');
});

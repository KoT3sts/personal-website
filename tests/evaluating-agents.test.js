// "How I evaluate agents" (web/lab/evaluating-agents.html): a write-up with five figures
// built from same-origin JSON (evaluating-agents.js). Checks the security headers,
// structure and links, that nothing internal or hype-worded slips in, that every number
// on the page is already published on the homepage, the evaluation lab, the build trace
// or computed from the agent telemetry (lab/data/agent-traces.json), that each figure's
// static fallback matches the JSON, and the reading floor.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { summarize } from '../web/lab/build-trace.js';
import { measures, failures, delegation, matrix, where } from '../web/lab/evaluating-agents-data.js';

const web = new URL('../web/', import.meta.url);
const read = path => readFileSync(new URL(path, web), 'utf8');
const page = read('lab/evaluating-agents.html');
const css = read('lab/evaluating-agents.css');
const lab = read('lab/sentiment-eval.html');
const trace = read('lab/build-trace.html');
const traceJson = read('trace/build-trace.json');
const script = read('lab/evaluating-agents.js');
const helper = read('lab/evaluating-agents-data.js');
const telemetry = JSON.parse(read('lab/data/agent-traces.json'));
const sentiment = JSON.parse(read('lab/data/sentiment-eval.json'));

const entities = { '&amp;': '&', '&quot;': '"', '&#x27;': "'", '&lt;': '<', '&gt;': '>', '&nbsp;': ' ' };
// Visible text: comments, scripts and styles dropped; inline tags vanish, block tags become spaces.
const plain = html => html.replace(/<!--[\s\S]*?-->/g, '').replace(/<(script|style)\b[\s\S]*?<\/\1>/g, ' ')
  .replace(/<\/?(?:a|span|strong|em|code|sup|b|i)(?:\s[^>]*)?>/g, '').replace(/<[^>]+>/g, ' ')
  .replace(/&(?:amp|quot|#x27|lt|gt|nbsp);/g, match => entities[match]).replace(/\s+/g, ' ').trim();
const main = page.match(/<main[\s\S]*?<\/main>/)[0];
const readingLabel = main.match(/<dd class="mono" data-reading-time>([^<]+)<\/dd>/)?.[1];
const mainText = plain(main);
// The reading floor counts the prose; figures (captions, tables, labels) are read as needed.
const words = plain(main.replace(/<figure\b[\s\S]*?<\/figure>/g, ' ')).split(' ').filter(Boolean).length;
const figures = [...main.matchAll(/<figure\b([^>]*)>([\s\S]*?)<\/figure>/g)].map(match => ({ attrs: match[1], html: match[2] }));
const meta = key => page.match(new RegExp(`<meta (?:name|property)="${key}" content="([^"]*)"`))?.[1];

test('the same strict CSP and referrer policy as the evaluation lab, and one same-origin module', () => {
  const csp = tag => tag.match(/<meta http-equiv="Content-Security-Policy" content="[^"]+">/)[0];
  assert.equal(csp(page), csp(lab), 'CSP copied exactly from sentiment-eval.html');
  assert.match(page, /<meta name="referrer" content="strict-origin-when-cross-origin">/);
  const scripts = [...page.matchAll(/<script\b[^>]*>/g)].map(match => match[0]);
  assert.deepEqual(scripts, ['<script type="application/ld+json">', '<script type="module" src="./evaluating-agents.js">'], 'structured data and the figures module only');
  assert.match(page, /<script type="module" src="\.\/evaluating-agents\.js"><\/script>/, 'no inline code');
  assert.doesNotMatch(page, /\sstyle="|\son[a-z]+="/);
  for (const sheet of ['../project.css', './lab.css', './evaluating-agents.css']) assert.ok(page.includes(`<link rel="stylesheet" href="${sheet}">`), sheet);
  JSON.parse(page.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
});

test('title, one h1, the four sections, and og/twitter meta that match the canonical url', () => {
  assert.match(page, /<title>How I evaluate agents — Cesar Tortolero<\/title>/);
  assert.equal(page.match(/<h1[\s>]/g)?.length, 1);
  assert.match(page, /<h1 id="ea-title" class="lab-title">How I evaluate agents<\/h1>/);
  const h2 = [...page.matchAll(/<h2 id="[^"]+">([^<]+)<\/h2>/g)].map(match => match[1]);
  assert.deepEqual(h2, ['What to measure', 'How to catch failures', 'When fewer agents beat more', 'A checklist for calling an agent done', 'Read next']);
  const canonical = page.match(/<link rel="canonical" href="([^"]+)">/)[1];
  assert.match(canonical, /^https:\/\/[^/]+\/lab\/evaluating-agents\.html$/);
  assert.equal(meta('og:url'), canonical);
  for (const key of ['description', 'og:title', 'og:description', 'og:image', 'og:image:alt', 'twitter:card', 'twitter:title', 'twitter:description', 'twitter:image']) assert.ok(meta(key), key);
  const items = page.match(/<ol class="ea-checklist">([\s\S]*?)<\/ol>/)[1].match(/<li>/g).length;
  assert.ok(items >= 6 && items <= 8, `checklist has 6–8 items, got ${items}`);
});

test('links: both lab pages, back to Work, and both lab pages and the sitemap link here', () => {
  assert.match(page, /<a class="cs-back" href="\.\.\/#work"><span class="cs-arrow icon icon-arrow-w" aria-hidden="true"><\/span> All projects<\/a>/);
  for (const href of ['./sentiment-eval.html', './build-trace.html', '../#work']) assert.ok(page.includes(`href="${href}"`), href);
  for (const [, ref] of page.matchAll(/\s(?:href|src)="(\.{1,2}\/[^"#]*)/g)) {
    const target = new URL(ref, new URL('lab/evaluating-agents.html', web));
    assert.ok(statSync(target.pathname.endsWith('/') ? new URL('index.html', target) : target), `${ref} exists`);
  }
  for (const [name, html] of [['sentiment-eval', lab], ['build-trace', trace]]) {
    assert.match(html, /<a class="lab-link" href="\.\/evaluating-agents\.html">How I evaluate agents <span class="icon icon-arrow-e" aria-hidden="true"><\/span><\/a>/, name);
  }
  assert.match(read('sitemap.xml'), /<loc>https:\/\/[^<]+\/lab\/evaluating-agents\.html<\/loc>\s*<lastmod>2026-11-1[12]<\/lastmod>/);
  assert.ok(page.includes('href="./agent-observability.html"'), 'the figures point to the observability dashboard');
});

test('nothing internal: no employer systems, tickets, hosts, accounts or email addresses', () => {
  const forbidden = [/\bJira\b/i, /SPARK-\d/i, /Splunk/i, /ServiceNow/i, /Confluence/i, /\bADP\b/, /adp\.com/i, /oneadp/i, /\bcaas\b/i,
    /dev-?hub/i, /Data-AI Portal/i, /deployment dashboard/i, /hub-?spoke/i, /\bRITM\d/i, /\bCTASK/i, /\bCHG\d/i, /tortolec/i,
    /payroll/i, /\.internal\b/i, /\bes\.ad\b/i, /[\w.+-]+@[\w-]+\.[a-z]{2,}/i, /\b(?:\d{1,3}\.){3}\d{1,3}\b/, /arn:aws/i, /\b\d{12}\b/];
  for (const pattern of forbidden) assert.doesNotMatch(page, pattern, `${pattern}`);
});

test('arrows on the three lab pages are drawn icons, never glyphs, and stay out of accessible names', () => {
  for (const [name, html] of [['evaluating-agents', page], ['sentiment-eval', lab], ['build-trace', trace]]) {
    assert.doesNotMatch(plain(html.replace(/<(?:meta|title)[^>]*>[^<]*/g, '')), /[←↑→↓↔↗↘]/, `${name}: no arrow glyphs`);
    for (const [tag] of html.matchAll(/<span class="(?:cs-arrow )?icon icon-arrow-[a-z]+"[^>]*>/g)) assert.match(tag, /aria-hidden="true"><\/span>$|aria-hidden="true">$/, `${name}: ${tag}`);
  }
  assert.doesNotMatch(read('lab/build-trace.js'), /[←↑→↓↔↗↘]/, 'trace times use an en dash');
});

test('plain writing: no hype words, no em dashes in the body', () => {
  const slop = /\b(?:delve|delving|robust|leverag\w*|seamless\w*|cutting-edge|game-chang\w*|tapestry|unlock\w*|supercharg\w*|revolutioni[sz]\w*|synerg\w*|holistic|empower\w*|elevate|in today's|it's worth noting)\b/i;
  assert.doesNotMatch(mainText, slop);
  assert.doesNotMatch(mainText, /—/, 'no em dashes in the write-up');
});

// The allowed sources: visible text of the homepage and the lab, and only the worded
// parts of the trace (title, span action/result/evidence, totals). Timestamps, commit
// hashes and the run block are left out, so their digits cannot whitelist anything.
const numbers = text => [...text.matchAll(/(?<![\p{L}\d.])[+\-−]?\d[\d,]*(?:\.\d+)?/gu)].map(match => match[0].replace(/^[+\-−]/, '').replace(/,/g, '').replace(/\.$/, ''));
const traceData = JSON.parse(traceJson);
const span = id => traceData.spans.find(item => item.id === id);
const traceWords = [traceData.title, ...traceData.spans.flatMap(item => [item.action, item.result, item.evidence]), JSON.stringify(traceData.totals)].join(' ');

// The figures' numbers, computed here straight from the telemetry and the lab JSON (not
// through evaluating-agents-data.js), so a wrong helper cannot whitelist its own output.
const total = values => values.reduce((a, b) => a + b, 0);
const nearest = (values, p) => [...values].sort((a, b) => a - b)[Math.max(0, Math.ceil(p * values.length) - 1)];
const comma = value => Math.round(value).toLocaleString('en-US');
const share = (part, whole) => ((part / whole) * 100).toFixed(1);
const gen = tokens => tokens.output + tokens.reasoning;
const T = (() => {
  const { traces, rollups, evaluators, evaluations, meta: info } = telemetry;
  const calls = total(traces.map(trace => trace.toolCalls));
  const errors = total(traces.map(trace => trace.toolErrors));
  const tokens = total(traces.map(trace => gen(trace.tokens)));
  const llm = rollups.latencyByKind.LLM;
  const tools = Object.entries(rollups.tools).filter(([, tool]) => tool.errors > 0).sort(([a, x], [b, y]) => y.errors - x.errors || a.localeCompare(b));
  const failed = traces.flatMap(trace => trace.spans).filter(item => item.kind === 'TOOL' && item.status === 'error').map(item => ({ ...item, ms: item.end - item.start }));
  const buckets = {
    fast: failed.filter(item => item.ms < 1000).length,
    slow: failed.filter(item => item.ms >= 1000 && item.ms < 60000).length,
    timeout: failed.filter(item => item.ms >= 60000 && item.name !== 'task').length,
    stopped: failed.filter(item => item.ms >= 60000 && item.name === 'task').length,
  };
  const groups = [true, false].map(yes => {
    const all = traces.filter(trace => (trace.subagentRuns > 0) === yes);
    const used = all.filter(trace => trace.toolCalls > 0);
    const c = total(used.map(trace => trace.toolCalls));
    const e = total(used.map(trace => trace.toolErrors));
    return { traces: all.length, used: used.length, calls: c, errors: e, rate: share(e, c),
      perCall: Math.round(nearest(used.map(trace => gen(trace.tokens) / trace.toolCalls), 0.5)), medianCalls: nearest(used.map(trace => trace.toolCalls), 0.5) };
  });
  // Each evaluator states its output: pass/fail, number or category.
  const evals = evaluators.map(evaluator => {
    const rows = evaluations.filter(row => row.evaluator === evaluator.id);
    const scores = rows.map(row => row.score);
    const counts = (evaluator.classes || []).map(label => [label, rows.filter(row => row.label === label).length]);
    const top = counts.reduce((best, item) => (item[1] > best[1] ? item : best), ['', 0]);
    return { id: evaluator.id, name: evaluator.name, output: evaluator.output, pass: rows.filter(row => row.label === 'pass').length,
      fail: rows.filter(row => row.label === 'fail').length, none: traces.length - rows.length, scored: rows.length, top,
      median: nearest(scores, 0.5), min: Math.min(...scores), max: Math.max(...scores) };
  });
  const ref = sentiment.reference;
  return { traces, calls, errors, tokens, llm, tools, failed, buckets, groups, evals, ref, info, classes: rollups.errorClasses,
    rate: share(errors, calls), p50: (llm.p50 / 1000).toFixed(1), p90: (llm.p90 / 1000).toFixed(1), perCall: Math.round(tokens / calls),
    withCalls: traces.filter(trace => trace.toolCalls > 0).length, evaluators: evaluators.length };
})();
const telemetryNumbers = [T.calls, T.errors, T.rate, T.p50, T.p90, T.llm.n, T.perCall, T.tokens, T.failed.length, T.withCalls, T.traces.length,
  T.info.spans, T.evaluators, figures.length, ...figures.map((_, i) => i + 1),
  ...T.tools.flatMap(([, tool]) => [tool.errors, tool.n, share(tool.errors, tool.n)]), ...Object.values(T.buckets),
  ...T.groups.flatMap(group => Object.values(group)), ...Object.values(T.classes),
  ...T.evals.flatMap(row => [row.pass, row.fail, row.none, row.scored, row.top[1], row.median, row.min, row.max])].join(' ');

test('every number on the page is already published on the homepage, the evaluation lab, the build trace or the telemetry', () => {
  const summary = summarize(traceData);
  // Counts the build-trace page computes from the same file (summarize() in build-trace.js).
  const derived = [...summary.roles.map(role => role.count), summary.errors, summary.recovered, summary.saves, summary.spans.length].join(' ');
  const known = new Set([plain(read('index.html')), plain(lab), traceWords, derived, telemetryNumbers].flatMap(numbers));
  const text = [plain(main.replace(/<dd class="mono" data-reading-time>[^<]*<\/dd>/, '')), page.match(/<title>([^<]+)/)[1],
    ...['description', 'og:title', 'og:description', 'twitter:title', 'twitter:description'].map(meta)].join(' ');
  const found = numbers(text);
  assert.ok(found.length >= 15, 'the write-up cites the evidence');
  for (const number of found) assert.ok(known.has(number), `${number} is not published on the homepage, the lab, the trace or the telemetry`);
  // The headline numbers stay tied to their sources.
  assert.match(mainText, /0\.008 F1/);
  assert.match(mainText, /−0\.021 to \+0\.038/);
  assert.match(mainText, new RegExp(`${summary.roles.find(role => role.id === 'orchestrator').count} of the ${summary.spans.length} steps`));
  assert.match(mainText, new RegExp(`${summary.errors} ended in an error, and ${summary.recovered} of those`));
  for (const role of ['implementation-worker', 'quality-reviewer', 'ui-design-director']) {
    assert.match(mainText, new RegExp(`the ${role} ${summary.roles.find(item => item.id === role).count}\\b|The ${role} recorded ${summary.roles.find(item => item.id === role).count}\\b`), role);
  }
});

test('"all 16 commits" were saved by the orchestrator, computed from the trace like the build-trace page does', () => {
  const summary = summarize(traceData);
  assert.deepEqual(summary.savesBy, ['orchestrator'], 'every commit span belongs to the orchestrator');
  assert.equal(summary.saves, traceData.run.commits);
  assert.match(mainText, new RegExp(`made all ${summary.saves} commits`));
});

test('worded counts match their source spans, and no other worded count appears', () => {
  const wordCounts = { two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12 };
  // Two delegated tasks stopped midway (s11, s22) and were resumed (s13, s25).
  const stopped = traceData.spans.filter(item => item.role === 'implementation-worker' && item.status === 'error'
    && traceData.spans.some(child => child.parent === item.id && child.status === 'retried'));
  assert.deepEqual(stopped.map(item => item.id), ['s11', 's22']);
  assert.match(span('s11').result, /interrupted/i);
  assert.match(span('s22').result, /Connection lost/);
  assert.deepEqual(['s13', 's25'].map(id => span(id).parent), ['s11', 's22']);
  // s31: six smaller findings; s46/s47: five low-priority findings, all fixed; s20: two labels.
  assert.equal(span('s31').role, 'quality-reviewer');
  assert.match(span('s31').result, /No high-severity issues; six smaller findings/);
  assert.equal(span('s46').role, 'quality-reviewer');
  assert.match(span('s46').result, /five low-priority findings/);
  assert.match(span('s47').result, /All five low-priority findings fixed before saving/);
  assert.match(span('s20').result, /caught two labels; both were reworded/);
  // The trace covers the Nov 10–11 redesign: commits 3839873 to 7395a47 (rounds 4–5 in the handoff).
  assert.deepEqual([traceData.run.from, traceData.run.to, traceData.run.started.slice(0, 10), traceData.run.ended.slice(0, 10)], ['3839873', '7395a47', '2026-11-10', '2026-11-11']);
  const phrases = [
    [/For each task I would want four things/, () => assert.equal(page.match(/<h2 id="measure-title">[\s\S]*?<ul class="cs-points ea-points">([\s\S]*?)<\/ul>/)[1].match(/<li>/g).length, 4, 'four measures listed')],
    [/less accurate of the two/, () => assert.match(plain(lab), /Two sentiment models/)],
    [/Two were delegated tasks that stopped midway/, () => assert.equal(stopped.length, wordCounts.two)],
    [/One number against four|The four measures/, () => assert.equal(page.match(/<h2 id="measure-title">[\s\S]*?<ul class="cs-points ea-points">([\s\S]*?)<\/ul>/)[1].match(/<li>/g).length, 4, 'four measures listed')],
    [/caught two homepage labels/, () => assert.match(span('s20').result, /caught two labels/)],
    [/no high-severity issues and six smaller findings/, () => assert.match(span('s31').result, /six smaller findings/)],
    [/reported five low-priority findings, all fixed before saving/, () => assert.match(span('s47').result, /All five/)],
  ];
  for (const [pattern, check] of phrases) { assert.match(mainText, pattern); check(); }
  // Any other number word must be added here on purpose, with its source.
  const allowed = phrases.map(([pattern]) => pattern);
  for (const match of mainText.matchAll(new RegExp(`\\b(?:${Object.keys(wordCounts).join('|')})\\b`, 'gi'))) {
    const around = mainText.slice(Math.max(0, match.index - 60), match.index + 80);
    assert.ok(allowed.some(pattern => pattern.test(around)), `unsourced worded count "${match[0]}" in: …${around}…`);
  }
});

test('reading floor: 900–1,350 words, an honest reading time, a ~68ch measure and no text under 11px', () => {
  assert.ok(words >= 900 && words <= 1350, `${words} words`);
  const minutes = Number(readingLabel?.match(/^About a (\d+)-minute read$/)?.[1]);
  assert.equal(minutes, Math.round(words / 230), 'reading time at about 230 words a minute');
  assert.ok(minutes >= 5 && minutes <= 7);
  assert.match(css, /\.ea-prose \{ max-width: 68ch;/);
  assert.match(css, /\.ea-checklist \{ max-width: 68ch;/);
  for (const size of css.matchAll(/font-size: (?:clamp\()?([\d.]+)px/g)) assert.ok(Number(size[1]) >= 11, size[0]);
  assert.doesNotMatch(css, /@import/);
  for (const [url] of css.matchAll(/url\([^)]*\)/g)) assert.match(url, /^url\("data:image\/svg\+xml,/, 'only inline SVG masks');
  assert.doesNotMatch(css, /content: "[^"]+"/, 'arrows are drawn masks, not font glyphs');
});

// Rows of a fallback table as [header, ...cells] text.
const tableRows = name => {
  const table = main.match(new RegExp(`<table class="lab-table ea-table" data-ea-table="${name}">([\\s\\S]*?)</table>`))?.[1];
  assert.ok(table, `table ${name}`);
  return [...table.match(/<tbody>([\s\S]*?)<\/tbody>/)[1].matchAll(/<tr>([\s\S]*?)<\/tr>/g)]
    .map(row => [...row[1].matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/g)].map(cell => plain(cell[1])));
};

test('five figures, each with a caption, a data table or list, and its live part hidden until the script runs', () => {
  assert.equal(figures.length, 5);
  figures.forEach(({ attrs, html }, i) => {
    const id = attrs.match(/aria-labelledby="([^"]+)"/)?.[1];
    assert.ok(id && html.includes(`<figcaption id="${id}">`), `figure ${i + 1} is labelled by its caption`);
    assert.match(html, new RegExp(`<p class="mono ea-fig-kicker">Figure ${i + 1} · `), `figure ${i + 1} kicker`);
    assert.ok(/<table class="lab-table ea-table"/.test(html) || /<ol class="ea-flow-steps">/.test(html), `figure ${i + 1} has a table or list`);
    for (const [tag] of html.matchAll(/<div class="[^"]*" data-ea-live[^>]*>/g)) assert.match(tag, /\shidden>$/, `figure ${i + 1}: live part hidden without the script`);
    if (/data-ea-table/.test(html)) assert.match(html, /<details class="ea-data" open>/, `figure ${i + 1}: the table is open without the script`);
    for (const [tag] of html.matchAll(/<table\b[^>]*>/g)) assert.ok(html.includes('<caption'), tag);
  });
  assert.match(figures[1].html, /Illustration/, 'the loop is labelled an illustration');
  assert.match(figures[1].attrs + figures[1].html, /Figure 2 · Illustration/);
  // Only the live regions that help: statuses, the verdict, the checklist state, and
  // figure 5's Previous/Next announcement.
  assert.equal((page.match(/aria-live="polite"/g) || []).length, 5);
  assert.doesNotMatch(page, /aria-live="assertive"/);
});

test('the static fallbacks match the telemetry and the lab JSON', () => {
  const a = T.ref.A;
  const b = T.ref.B;
  assert.equal(T.ref.threshold, 0.5);
  assert.deepEqual(tableRows('measures'), [
    ['Task success', 'Not measured, no task labels'],
    ['Groundedness', 'Not measured, no text kept'],
    ['Tool-call errors', `${T.errors} of ${comma(T.calls)} calls failed, ${T.rate}%`],
    ['Model step latency', `median ${T.p50} s, p90 ${T.p90} s, ${comma(T.llm.n)} steps`],
    ['Generated tokens per tool call, all traces pooled', `${T.perCall}, from ${comma(T.tokens)} output and reasoning tokens`],
    ['Lab F1 at threshold 0.50', `A ${a.f1.toFixed(3)}, B ${b.f1.toFixed(3)}`],
    ['Lab IMDb accuracy at 0.50', `A ${T.ref.slices.A.imdb.accuracy.toFixed(3)}, B ${T.ref.slices.B.imdb.accuracy.toFixed(3)}`],
  ]);
  assert.deepEqual(tableRows('tools'), T.tools.map(([name, tool]) => [name, String(tool.errors), comma(tool.n), `${share(tool.errors, tool.n)}%`]));
  assert.deepEqual(tableRows('buckets').map(row => row[1]), Object.values(T.buckets).map(String));
  assert.equal(total(Object.values(T.buckets)), T.failed.length);
  const [yes, no] = T.groups;
  assert.deepEqual(tableRows('delegation'), [
    ['Traces', String(yes.traces), String(no.traces)], ['Traces with tool calls', String(yes.used), String(no.used)],
    ['Tool calls', comma(yes.calls), comma(no.calls)], ['Failed calls', String(yes.errors), String(no.errors)],
    ['Share of calls that failed', `${yes.rate}%`, `${no.rate}%`], ['Median generated tokens per call', String(yes.perCall), String(no.perCall)],
    ['Median tool calls per trace', String(yes.medianCalls), String(no.medianCalls)],
  ]);
  // 13 rows: pass/fail counts, a number's median and range, a category's most common label.
  const value = v => (v >= 1000 ? comma(v) : String(v));
  assert.equal(T.evals.length, 13);
  assert.deepEqual(tableRows('evaluators'), T.evals.map(row => (row.output === 'number'
    ? [row.name, `median ${value(row.median)}, range ${value(row.min)} to ${value(row.max)}`, String(row.none)]
    : row.output === 'category' ? [row.name, `most often ${row.top[0].replace(/_/g, ' ')}, in ${row.top[1]} of ${row.scored} traces`, String(row.none)]
      : [row.name, String(row.pass), String(row.fail), String(row.none)])));
  assert.deepEqual(T.evals.map(row => row.output).filter(output => output !== 'pass/fail'), ['number', 'number', 'number', 'category']);
  assert.doesNotMatch(page, /delegation_used|Delegation used/, 'the retired evaluator is gone');
  // The numbers written into the tiles and the loop, which the script refreshes from the JSON.
  const written = Object.fromEntries([...main.matchAll(/<span data-ea-m="(\w+)">([^<]*)<\/span>/g)].map(match => [match[1], match[2]]));
  assert.deepEqual(written, { rate: T.rate, errors: String(T.errors), calls: comma(T.calls), p50: T.p50, p90: T.p90, steps: comma(T.llm.n),
    perCall: String(T.perCall), traces: String(T.traces.length), spans: comma(T.info.spans), evaluators: String(T.evaluators) });
  // Captions cite the same counts.
  assert.match(mainText, new RegExp(`Of ${comma(T.calls)} tool calls, ${T.errors} failed`));
  assert.match(mainText, new RegExp(`uses the ${T.failed.length} failures published as single spans`));
  assert.match(mainText, new RegExp(`its ${T.evals.find(row => row.name === 'Review before commit').fail} fails mean no recorded reviewer run`));
  assert.match(mainText, new RegExp(`${T.withCalls} of the ${T.traces.length}, placed by how many calls`));
  // Figure 5 splits on subagent runs and says so; Delegation on large tasks is the narrower check.
  const fit = T.evals.find(row => row.id === 'delegation_fit');
  assert.match(mainText, /A trace counts as delegated when it has at least one subagent run\./);
  assert.match(mainText, new RegExp(`scores only the ${fit.scored} large traces, and passes the ${fit.pass} where subagents made at least half of the tool calls\\.`));
  assert.deepEqual([telemetry.meta.thresholds.delegation_fit.threshold, telemetry.meta.thresholds.delegation_fit.direction], [0.5, 'atLeast'], 'the caption states the threshold');
  // The classify step in the exporter: the published error classes, in the prose, linked to the dashboard.
  const order = Object.entries(T.classes).filter(([, n]) => n > 0).sort((x, y) => y[1] - x[1]);
  const said = order.map(([label, n]) => `${label.replace(/_/g, ' ')} ${n}`);
  assert.match(mainText, new RegExp(`the ${T.errors} failed calls split into ${said.slice(0, -1).join(', ')} and ${said.at(-1)}\\.`));
  assert.equal(total(Object.values(T.classes)), T.errors, 'every failed call has one class');
  assert.match(main, /<a class="lab-link" href="\.\/agent-observability\.html#obs-fail-title">dashboard’s failure analysis<\/a>/);
  assert.match(mainText, new RegExp(`a median of ${yes.medianCalls} tool calls against ${no.medianCalls}\\.`));
  assert.match(mainText, new RegExp(`Results across ${T.traces.length} traces`));
  // The page's helper agrees with this independent count.
  const m = measures(telemetry);
  assert.deepEqual([m.calls, m.errors, m.rate, m.p50, m.p90, m.perCall], [T.calls, T.errors, T.rate, T.p50, T.p90, T.perCall]);
  const f = failures(telemetry);
  assert.deepEqual(f.buckets.map(bucket => bucket.count), Object.values(T.buckets));
  assert.deepEqual(f.tools.map(tool => tool.name), T.tools.map(([name]) => name));
  assert.deepEqual(delegation(telemetry).groups.map(group => [group.traces, group.scored, group.calls, group.errors, group.rate, group.perCall, group.medianCalls]),
    T.groups.map(group => [group.traces, group.used, group.calls, group.errors, group.rate, group.perCall, group.medianCalls]));
  assert.deepEqual(matrix(telemetry).rows.map(row => [row.pass, row.fail, row.none]), T.evals.map(row => [row.pass, row.fail, row.none]));
  assert.deepEqual(matrix(telemetry).rows.map(row => [row.numeric, row.category, row.top && [row.top.label, row.top.count]]),
    T.evals.map(row => [row.output === 'number', row.output === 'category', row.output === 'category' ? row.top : null]));
});

test('the figures script: same-origin JSON only, no HTML sinks, no storage, motion respects the reader', () => {
  const code = `${script}\n${helper}`;
  assert.equal((code.match(/\bfetch\(/g) || []).length, 1, 'one fetch, through load()');
  assert.match(script, /fetch\(url, \{ credentials: 'same-origin' \}\)/);
  const urls = [...code.matchAll(/['"`](\.{1,2}\/[^'"`]*\.json)['"`]/g)].map(match => match[1]);
  assert.deepEqual([...new Set(urls)].sort(), ['./data/agent-traces.json', './data/sentiment-eval.json']);
  for (const url of urls) assert.ok(['./data/agent-traces.json', './data/sentiment-eval.json', '../trace/build-trace.json'].includes(url), url);
  assert.doesNotMatch(code, /https?:\/\/(?!www\.w3\.org\/2000\/svg)/, 'no other origin');
  assert.doesNotMatch(code, /innerHTML|outerHTML|insertAdjacentHTML|document\.write|\beval\(|new Function/);
  assert.doesNotMatch(code, /localStorage|sessionStorage|indexedDB|document\.cookie/, 'the checklist is saved nowhere');
  assert.doesNotMatch(code, /setAttribute\(\s*['"]style['"]/, 'CSSOM only, no style attributes');
  assert.match(script, /prefers-reduced-motion: reduce/);
  assert.match(css, /@media \(prefers-reduced-motion: no-preference\) \{[\s\S]*?\.ea-bar-fill \{ transition/);
  assert.match(script, /IntersectionObserver/, 'figures render when they near the viewport');
  // The dashboard link only carries an id that came from the data file, through encodeURIComponent.
  assert.match(script, /agent-observability\.html#\$\{encodeURIComponent\(id\)\}/);
  assert.ok(Buffer.byteLength(code) <= 31000, `${Buffer.byteLength(code)} bytes of script (the scatter's keyboard reading and table added about 1.8 KB, number and category rows in figure 4 about 0.9 KB)`);
});

test('the checklist ticks without saving, with a progress ring and a polite status', () => {
  assert.match(page, /<div class="ea-progress" data-ea-progress hidden>/);
  assert.match(page, /<span class="ea-progress-state" data-ea-state aria-live="polite">Not done until all are true\.<\/span>/);
  assert.match(page, /<button type="button" class="ea-button" data-ea-reset>Clear ticks<\/button>/);
  assert.match(css, /\.ea-checklist\.is-live label \{ display: block; min-height: 44px;/);
});

test('figure labels name the work in plain words, never the exporter\'s round labels or "undefined"', () => {
  const labels = [...failures(telemetry).spans.map(item => item.where), ...delegation(telemetry).points.map(item => item.where),
    ...matrix(telemetry).traces.map(item => item.where)];
  assert.ok(labels.length > 100);
  for (const label of labels) {
    assert.ok(typeof label === 'string' && label.trim(), 'a label for every trace');
    assert.doesNotMatch(label, /Round\b|undefined|null/, label);
  }
  assert.ok(labels.some(label => / · [A-Z][a-z]{2} \d{1,2}$/.test(label)), 'topic and day, e.g. "hero, Icarus and layout · Nov 10"');
  assert.equal(where({}), 'site work', 'no round and no day');
  assert.equal(where({ round: 'Round 99', day: '2026-11-12' }), 'site work · Nov 12', 'an unknown round falls back');
  // The script prints the helper's label, never trace.round.
  assert.doesNotMatch(script.replace(/Math\.round/g, ''), /\.round\b|Round /);
  assert.match(script, /\$\{span\.where\}/);
});

// ---- Figure 5 run for real in a tiny fake DOM (no jsdom in the repo) -----------------

class FakeNode {
  constructor(tag) { Object.assign(this, { tagName: tag.toUpperCase(), children: [], dataset: {}, attrs: {}, on: {}, className: '', text: '', value: '', max: '', hidden: false, parent: null }); this.style = { setProperty() {} }; }
  get classList() {
    const list = () => this.className.split(/\s+/).filter(Boolean);
    const add = c => { if (!list().includes(c)) this.className = [...list(), c].join(' '); };
    const remove = c => { this.className = list().filter(x => x !== c).join(' '); };
    return { add, remove, contains: c => list().includes(c), toggle: (c, on) => (on ? add(c) : remove(c)) };
  }
  append(...nodes) { for (const node of nodes) { node.parent = this; this.children.push(node); } }
  prepend(node) { node.parent = this; this.children.unshift(node); }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter(child => child !== this); }
  replaceChildren(...nodes) { this.children = []; this.append(...nodes); }
  set textContent(value) { this.text = String(value); this.children = []; }
  get textContent() { return this.text + this.children.map(child => child.textContent).join(''); }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  getAttribute(k) { return this.attrs[k] ?? null; }
  addEventListener(type, fn) { (this.on[type] ||= []).push(fn); }
  fire(type) { for (const fn of this.on[type] || []) fn({ target: this, clientX: 0, clientY: 0 }); }
  querySelector(sel) { return sel === 'svg' ? this.children.find(child => child.tagName === 'SVG') || null : null; }
  all(test) { return [this, ...this.children.flatMap(child => child.all(test))].filter(test); }
}

test('figure 5: the scatter says its x-axis is log, lists every dot under "Show the numbers", and a slider reads the dots by keyboard', async t => {
  const block = figures[4].html;
  assert.match(block, /<details class="ea-data ea-numbers">\s*<summary>Show the numbers<\/summary>/);
  assert.match(block, /<label class="visually-hidden" for="ea-point">[^<]+<\/label>\s*<input type="range" id="ea-point" min="0" max="0" step="1" value="0">/);
  assert.match(block, /data-ea-point-step="-1">Previous<\/button>[\s\S]*data-ea-point-step="1">Next<\/button>/);
  // The buttons keep focus, so a polite live region (outside the hidden plot) says where they moved.
  assert.match(block, /<\/div>\s*(?:<!--[\s\S]*?-->\s*)?<p class="visually-hidden" data-ea-point-status aria-live="polite"><\/p>/);
  assert.ok(block.indexOf('data-ea-point-status') > block.indexOf('data-ea-point-step="1"'), 'after the picker, not inside the aria-hidden plot');
  // The log axis spans at least one decade: log10(xmax) is never 0.
  assert.match(script, /const xmax = Math\.max\(10, 10 \*\* Math\.ceil\(Math\.log10\(/);
  assert.match(script, /const x = calls => pad\.l \+ \(Math\.log10\(calls\) \/ Math\.log10\(xmax\)\)/, 'the x-axis really is log10');
  assert.match(script, /const y = v => h - pad\.b - \(v \/ ymax\)/, 'the y-axis starts at zero');
  // The pointer path from the Phase 1 fix stays: one frame per burst, no rewrite on the same dot.
  assert.match(script, /if \(first\) requestAnimationFrame\(nearest\);/);
  assert.match(script, /if \(best === hot\) return;/);

  const parts = Object.fromEntries(['plot', 'tip', 'pairs', 'range', 'rows', 'live', 'details', 'prev', 'next', 'status'].map(name => [name, new FakeNode(name)]));
  Object.assign(parts.plot, { clientWidth: 640, getBoundingClientRect: () => ({ left: 0, top: 0, width: 640, height: 270 }) });
  parts.tip.hidden = true;
  parts.prev.dataset.eaPointStep = '-1';
  parts.next.dataset.eaPointStep = '1';
  const selectors = { '[data-ea-plot]': 'plot', '[data-ea-tip]': 'tip', '[data-ea-pairs]': 'pairs', '#ea-point': 'range', '[data-ea-points]': 'rows', '[data-ea-live]': 'live', 'details.ea-data': 'details', '[data-ea-point-status]': 'status' };
  const fig = Object.assign(new FakeNode('figure'), { dataset: { eaFig: 'delegation' } });
  fig.querySelector = sel => parts[selectors[sel]] || null;
  fig.querySelectorAll = sel => (sel === '[data-ea-point-step]' ? [parts.prev, parts.next] : []);
  const document = {
    activeElement: null,
    createElement: tag => new FakeNode(tag),
    createElementNS: (ns, tag) => new FakeNode(tag),
    querySelectorAll: sel => (sel === '[data-ea-fig]' ? [fig] : []),
    querySelector: () => null,
  };
  const globals = { document, window: { addEventListener() {} }, requestAnimationFrame: fn => { fn(0); return 1; },
    fetch: async url => ({ ok: true, json: async () => JSON.parse(read(new URL(url, new URL('lab/', web)).pathname.replace(/^.*\/web\//, ''))) }) };
  const saved = Object.fromEntries(Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  t.after(() => { for (const [key, d] of Object.entries(saved)) { if (d) Object.defineProperty(globalThis, key, d); else delete globalThis[key]; } });
  for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  await import('../web/lab/evaluating-agents.js');
  for (let i = 0; i < 100 && !parts.rows.children.length; i++) await new Promise(resolve => setTimeout(resolve, 10));

  const points = delegation(telemetry).points;
  const order = [...points].sort((a, b) => a.calls - b.calls || a.id.localeCompare(b.id));
  assert.equal(parts.rows.children.length, T.withCalls, 'one row per dot');
  assert.equal(points.length, T.withCalls);
  assert.deepEqual(parts.rows.children.map(tr => tr.children[1].textContent.replace(/,/g, '')), order.map(p => String(p.calls)), 'fewest to most calls');
  assert.deepEqual(parts.rows.children[0].children.map(cell => cell.textContent).slice(2), [String(order[0].errors), order[0].rate.toFixed(1), Math.round(order[0].perCall).toLocaleString('en-US'), order[0].delegated ? 'Yes' : 'No']);
  const svg = parts.plot.children[0];
  assert.ok(svg.all(node => node.tagName === 'TEXT' && node.textContent === 'Tool calls in the trace (log scale)').length === 1, 'x-axis title names the log scale');
  assert.equal(parts.range.max, String(T.withCalls - 1));
  // Keyboard: focus reads the first dot, input moves along, the buttons step, blur hides the tip.
  document.activeElement = parts.range;
  parts.range.value = '0';
  parts.range.fire('focus');
  assert.equal(parts.tip.hidden, false);
  assert.ok(parts.tip.textContent.startsWith(`${order[0].id} (`));
  assert.equal(parts.range.getAttribute('aria-valuetext'), parts.tip.textContent);
  assert.equal(svg.all(node => node.classList.contains('is-hot')).length, 1, 'one dot lit');
  parts.range.value = String(T.withCalls - 1);
  parts.range.fire('input');
  assert.ok(parts.tip.textContent.startsWith(`${order.at(-1).id} (`));
  assert.equal(parts.status.textContent, '', 'the slider speaks for itself: no live announcement');
  parts.next.fire('click');
  assert.equal(parts.range.value, String(T.withCalls - 1), 'Next stops at the last dot');
  assert.ok(parts.status.textContent.startsWith(`${order.at(-1).id} (`), 'Next announces the dot');
  parts.prev.fire('click');
  assert.ok(parts.tip.textContent.startsWith(`${order.at(-2).id} (`));
  assert.equal(parts.status.textContent, parts.tip.textContent, 'Previous announces what the tip shows');
  parts.range.fire('blur');
  assert.equal(parts.tip.hidden, true);
  assert.equal(svg.all(node => node.classList.contains('is-hot')).length, 0);
});

test('figure 4 and the badges use the shared status tokens from lab.css; fail is hatched, not hue alone', () => {
  assert.match(css, /\.ea-cell\.is-pass \{ background: var\(--status-pass\); \}/);
  assert.match(css, /\.ea-cell\.is-fail \{ background: repeating-linear-gradient\(135deg, var\(--status-fail\) 0 3px, #[0-9a-f]{6} 3px 5px\); \}/);
  assert.match(css, /\.ea-cell\.is-none \{ background: none; box-shadow: inset 0 0 0 1px var\(--status-na\); \}/);
  assert.doesNotMatch(css, /#b4692c|#dfae84/, 'no orange fail left');
});

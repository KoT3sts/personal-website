// "How I evaluate agents" (web/lab/evaluating-agents.html): a static write-up with no
// script. Checks the security headers, structure and links, that nothing internal or
// hype-worded slips in, that every number on the page is already published on the
// homepage, the evaluation lab or the build trace, and the reading floor.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { summarize } from '../web/lab/build-trace.js';

const web = new URL('../web/', import.meta.url);
const read = path => readFileSync(new URL(path, web), 'utf8');
const page = read('lab/evaluating-agents.html');
const css = read('lab/evaluating-agents.css');
const lab = read('lab/sentiment-eval.html');
const trace = read('lab/build-trace.html');
const traceJson = read('trace/build-trace.json');

const entities = { '&amp;': '&', '&quot;': '"', '&#x27;': "'", '&lt;': '<', '&gt;': '>', '&nbsp;': ' ' };
// Visible text: comments, scripts and styles dropped; inline tags vanish, block tags become spaces.
const plain = html => html.replace(/<!--[\s\S]*?-->/g, '').replace(/<(script|style)\b[\s\S]*?<\/\1>/g, ' ')
  .replace(/<\/?(?:a|span|strong|em|code|sup|b|i)(?:\s[^>]*)?>/g, '').replace(/<[^>]+>/g, ' ')
  .replace(/&(?:amp|quot|#x27|lt|gt|nbsp);/g, match => entities[match]).replace(/\s+/g, ' ').trim();
const main = page.match(/<main[\s\S]*?<\/main>/)[0];
const readingLabel = main.match(/<dd class="mono" data-reading-time>([^<]+)<\/dd>/)?.[1];
const mainText = plain(main);
const words = mainText.split(' ').filter(Boolean).length;
const meta = key => page.match(new RegExp(`<meta (?:name|property)="${key}" content="([^"]*)"`))?.[1];

test('the same strict CSP and referrer policy as the evaluation lab, and no script at all', () => {
  const csp = tag => tag.match(/<meta http-equiv="Content-Security-Policy" content="[^"]+">/)[0];
  assert.equal(csp(page), csp(lab), 'CSP copied exactly from sentiment-eval.html');
  assert.match(page, /<meta name="referrer" content="strict-origin-when-cross-origin">/);
  const scripts = [...page.matchAll(/<script\b[^>]*>/g)].map(match => match[0]);
  assert.deepEqual(scripts, ['<script type="application/ld+json">'], 'only structured data; the page works without JavaScript');
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
  assert.match(read('sitemap.xml'), /<loc>https:\/\/[^<]+\/lab\/evaluating-agents\.html<\/loc>\s*<lastmod>2026-11-11<\/lastmod>/);
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

test('every number on the page is already published on the homepage, the evaluation lab or the build trace', () => {
  const summary = summarize(traceData);
  // Counts the build-trace page computes from the same file (summarize() in build-trace.js).
  const derived = [...summary.roles.map(role => role.count), summary.errors, summary.recovered, summary.saves, summary.spans.length].join(' ');
  const known = new Set([plain(read('index.html')), plain(lab), traceWords, derived].flatMap(numbers));
  const text = [plain(main.replace(/<dd class="mono" data-reading-time>[^<]*<\/dd>/, '')), page.match(/<title>([^<]+)/)[1],
    ...['description', 'og:title', 'og:description', 'twitter:title', 'twitter:description'].map(meta)].join(' ');
  const found = numbers(text);
  assert.ok(found.length >= 15, 'the write-up cites the evidence');
  for (const number of found) assert.ok(known.has(number), `${number} is not published on the homepage, the lab or the trace`);
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
  assert.match(traceData.title, /rounds 4–5/);
  const phrases = [
    [/For each task I would want four things/, () => assert.equal(page.match(/<h2 id="measure-title">[\s\S]*?<ul class="cs-points ea-points">([\s\S]*?)<\/ul>/)[1].match(/<li>/g).length, 4, 'four measures listed')],
    [/less accurate of the two/, () => assert.match(plain(lab), /Two sentiment models/)],
    [/Two were delegated tasks that stopped midway/, () => assert.equal(stopped.length, wordCounts.two)],
    [/caught two homepage labels/, () => assert.match(span('s20').result, /caught two labels/)],
    [/no high-severity issues and six smaller findings/, () => assert.match(span('s31').result, /six smaller findings/)],
    [/reported five low-priority findings, all fixed before saving/, () => assert.match(span('s47').result, /All five/)],
    [/rounds 4–5 only/, () => assert.match(traceData.title, /rounds 4–5/)],
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

// Project pages in web/projects/: metadata, links, the "In 30 seconds" block, the
// charts, and that every factual sentence and number on a page is already published
// (homepage, a lab page or the build trace) or recorded with its source in a ledger,
// docs/case-study-facts*.json. Ledger quotes from files (docs/case-study-sources/,
// docs/case-study-answers.md, HANDOFF.md) are checked word for word. Plain text checks,
// no DOM, plus the pure helpers of web/projects/case-charts.js.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { access, readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { countText, formatNumber, makeClusters, parseNumber, placePoints, rng, wrap } from '../web/projects/case-charts.js';

const web = new URL('../web/', import.meta.url);
const projects = new URL('projects/', web);
const read = url => readFile(url, 'utf8');
const exists = url => access(url).then(() => true, () => false);
const meta = (html, attr, name) => html.match(new RegExp(`<meta ${attr}="${name}" content="([^"]*)"`))?.[1];

const SLUGS = ['agent-workflow', 'thoughts-to-text', 'companion-chatbot', 'voicelab', 'work-helper', 'barking-village'];
// Homepage story id for each page, in gallery order.
const STORIES = ['project-agents', 'project-bci', 'project-chatbot', 'project-voicelab', 'project-work-helper', 'project-barking'];

const decode = text => text
  .replace(/&nbsp;/g, ' ').replace(/&rsquo;|&#39;/g, "'").replace(/&quot;/g, '"')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
// Inline tags vanish (so "by <strong>15%</strong>." reads "by 15%."); block tags become spaces.
const INLINE = /<\/?(?:strong|em|span|time|a|abbr|b|i)(?:\s[^>]*)?>/g;
const plain = html => decode(html.replace(INLINE, '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
const norm = text => text.toLowerCase().replace(/[’]/g, "'").replace(/\s+/g, ' ').trim();

async function siteUrl() {
  const html = await read(new URL('index.html', web));
  return html.match(/<link rel="canonical" href="([^"]+)"/)[1];
}

// Published sources a case-study sentence may come from. Scripts and styles are
// dropped so only visible text (and visually hidden labels) count.
const stripCode = html => html.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<style[\s\S]*?<\/style>/g, ' ');
const strings = value => (typeof value === 'string' ? [value] : Array.isArray(value) ? value.flatMap(strings) : value && typeof value === 'object' ? Object.values(value).flatMap(strings) : []);
const corpus = (async () => {
  const homepage = norm(plain(stripCode(await read(new URL('index.html', web)))));
  const labDir = new URL('lab/', web);
  const labPages = (await readdir(labDir)).filter(name => name.endsWith('.html')).sort();
  const lab = (await Promise.all(labPages.map(async name => norm(plain(stripCode(await read(new URL(name, labDir)))))))).join(' | ');
  const trace = norm(strings(JSON.parse(await read(new URL('trace/build-trace.json', web)))).join(' | '));
  return { homepage, lab, trace, all: [homepage, lab, trace].join(' | ') };
})();
const RESUME = 'résumé 2026-11';
// "method" (docs/case-study-facts-side.json): how an on-page demo works; quotes point at code
// or a named reference, so they are not text-checked, but each entry explains itself in a note.
const METHOD = 'method';
// "opinion": Cesar's views written in his voice. Published because he asked for them, but they
// wait for his read (pending-cesar), like résumé-only facts. No other source may be pending.
const OPINION = 'opinion';
const MAY_WAIT = [RESUME, OPINION];
// A ledger entry's chart values: a list ["142", …] or rows {"Implementation": "104", …}
// (a row may hold one value per column: {"Two servers": ["about 2,400", …]}).
const valuesOf = fact => strings(fact.values ?? []);
// Row header text without its .cc-mark note ("Nov 10 (in the replay)" -> "Nov 10").
const rowLabel = th => norm(plain(th.replace(/<span class="cc-mark">[\s\S]*?<\/span>/g, '')));
function chartTables(html) {
  return [...mainOf(html).matchAll(/<figure[^>]*data-chart="[\w-]+"[^>]*>([\s\S]*?)<\/figure>/g)].flatMap(([, inner]) => [...inner.matchAll(/<table[\s\S]*?<\/table>/g)].map(([table]) => {
    const body = table.match(/<tbody>([\s\S]*?)<\/tbody>/)?.[1] ?? '';
    return [...body.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map(([, row]) => ({
      label: rowLabel(row.match(/<th[^>]*>([\s\S]*?)<\/th>/)?.[1] ?? ''),
      cells: [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(match => plain(match[1])),
    }));
  }));
}
const BUILT_IN = ['homepage', 'lab', 'trace'];
const root = new URL('../', import.meta.url);
const docs = new URL('../docs/', import.meta.url);
// Every ledger: docs/case-study-facts.json, docs/case-study-facts-side.json, …, plus
// tests/case-study-facts-pages.json (entries added by the pages fix while docs/ belonged
// to another task; same format, same checks).
const ledgers = (async () => {
  const names = (await readdir(docs)).filter(name => /^case-study-facts.*\.json$/.test(name)).sort();
  const urls = [...names.map(name => new URL(name, docs)), new URL('./case-study-facts-pages.json', import.meta.url)];
  return Promise.all(urls.map(async url => ({ name: url.pathname.split('/').pop(), ...JSON.parse(await read(url)) })));
})();
const facts = ledgers.then(list => list.flatMap(ledger => ledger.facts.map(fact => ({ ...fact, ledger: ledger.name }))));
const sourceList = fact => [].concat(fact.source);
// Source ids backed by a file in the repository: { file: 'docs/…' } or a plain path string.
const sourceFiles = ledgers.then(async list => {
  const files = {};
  for (const ledger of list) {
    for (const [id, value] of Object.entries(ledger.sources || {})) {
      if (BUILT_IN.includes(id)) continue;
      const file = typeof value === 'object' && value ? value.file : (/^[\w./-]+\.(?:txt|md|json)$/.test(value) ? value : null);
      if (file && await exists(new URL(file, root))) files[id] = norm(decode(await read(new URL(file, root))));
    }
  }
  return files;
});
const knownSources = ledgers.then(list => new Set([...BUILT_IN, RESUME, METHOD, OPINION, ...list.flatMap(ledger => Object.keys(ledger.sources || {}))]));
// Digits compared without thousands separators: "$5,070.56" matches "$5070.56".
const digits = text => norm(text).replace(/(\d),(?=\d{3})/g, '$1');
// A sentence as compared: normalised, without its closing period, colon or question mark.
const clean = text => norm(text).replace(/[.:?]$/, '');
const mainOf = html => html.match(/<main[^>]*>([\s\S]*?)<\/main>/)[1];
// Short mono labels (diagram node labels like "Input", link-card kinds like "PDF · KSU",
// chart legends) are labels like <dt>, not claims: at most four words and no digits.
const FLOW_LABEL = /<p class="mono cs-flow-label">([^<]*)<\/p>/g;
const MONO_LABEL = /<(span|p) class="mono(?: [\w-]+)*">([^<]*)<\/\1>/g;
const isLabel = text => text.trim().split(/\s+/).length <= 4 && !/\d/.test(text);
// Chart data tables are checked as numbers (below), not as sentences.
const stripData = html => html.replace(/<table[\s\S]*?<\/table>/g, ' ').replace(/<(?:button|svg|summary)[\s\S]*?<\/(?:button|svg|summary)>/g, ' ');
function claims(html) {
  const main = stripData(mainOf(html));
  const labels = [...main.matchAll(FLOW_LABEL)].map(match => match[1]);
  const body = main
    .replace(/<h[12][^>]*>[\s\S]*?<\/h[12]>/g, '')       // headings
    .replace(/<dt[^>]*>[\s\S]*?<\/dt>/g, '')             // labels
    .replace(FLOW_LABEL, '')                              // diagram labels
    .replace(/<ul class="cc-legend"[^>]*>([\s\S]*?)<\/ul>/g, (_, items) => { labels.push(...[...items.matchAll(/<li[^>]*>([^<]*)<\/li>/g)].map(match => match[1])); return ''; })
    .replace(MONO_LABEL, (match, _, text) => (isLabel(text) ? (labels.push(text), '') : match))
    .replace(/<dd class="mono">\d\d \/ 06<\/dd>/g, '');  // position in the set
  const lines = body.replace(/<\/(?:p|li|dd|figcaption)>/g, '\n').split('\n').map(plain).filter(Boolean);
  return { labels, sentences: lines.flatMap(line => line.split(/(?<=[.!?])\s+/)) };
}
// Numbers are scanned everywhere in <main> except the synthetic data of an illustration.
const numbersOf = html => mainOf(html).replace(/(<figure[^>]*data-illustration[^>]*>)([\s\S]*?<\/figure>)/g, (_, open, rest) => open + rest.replace(/<table[\s\S]*?<\/table>/g, ' '));

const pages = Promise.all(SLUGS.map(async slug => ({ slug, html: await read(new URL(`${slug}.html`, projects)) })));

test('every project page exists with title, description, canonical, Open Graph and JSON-LD', async () => {
  const site = await siteUrl();
  for (const { slug, html } of await pages) {
    const url = `${site}projects/${slug}.html`;
    assert.match(html, /^<!doctype html>\n<html lang="en">/, slug);
    assert.match(html, /<meta name="viewport" content="width=device-width, initial-scale=1">/, slug);
    assert.match(html, /<title>[^<]+ — Cesar Tortolero<\/title>/, slug);
    assert.ok(meta(html, 'name', 'description')?.length > 50, `${slug} description`);
    assert.equal(html.match(/<link rel="canonical" href="([^"]+)"/)?.[1], url, `${slug} canonical`);
    assert.equal(meta(html, 'property', 'og:url'), url, `${slug} og:url`);
    assert.ok(meta(html, 'property', 'og:title'), `${slug} og:title`);
    assert.ok(meta(html, 'property', 'og:description'), `${slug} og:description`);
    for (const key of ['og:image', 'twitter:image']) {
      const value = meta(html, 'property', key) || meta(html, 'name', key);
      assert.ok(value?.startsWith(site), `${slug} ${key} is absolute on the site`);
      assert.ok(await exists(new URL(value.slice(site.length), web)), `${slug} ${key} file exists`);
    }
    const ld = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
    assert.equal(ld['@type'], 'CreativeWork');
    assert.equal(ld.url, url);
    assert.equal(ld.author['@type'], 'Person');
    assert.equal(ld.author.name, 'Cesar Tortolero');
    assert.ok(ld.image.startsWith(site) && await exists(new URL(ld.image.slice(site.length), web)), `${slug} JSON-LD image exists`);
    assert.equal(html.match(/<h1[\s>]/g)?.length, 1, `${slug} has one h1`);
    // At most one script: the page's own module (case-charts.js or side-demos.js), no inline code.
    const scripts = [...html.matchAll(/<script(?![^>]*application\/ld\+json)(?![^>]*count\.js)[^>]*>[\s\S]*?<\/script>/g)].map(match => match[0]);
    assert.ok(scripts.length <= 1, `${slug}: one module script at most`);
    for (const tag of scripts) assert.match(tag, /^<script type="module" src="\.\/(?:case-charts|side-demos)\.js"><\/script>$/, `${slug}: ${tag}`);
  }
});

test('relative links and assets resolve, and the shared stylesheet fonts exist', async () => {
  for (const { slug, html } of await pages) {
    const refs = [...html.matchAll(/\s(?:href|src)="([^"]+)"/g)].map(match => match[1]).filter(ref => !/^(?:https?:|mailto:|#)/.test(ref));
    assert.ok(refs.length >= 10, `${slug} has its links`);
    for (const ref of refs) {
      assert.ok(!ref.startsWith('/'), `${slug}: ${ref} is relative (works from dist/ and the dev server)`);
      const target = new URL(ref.split('#')[0], new URL(`${slug}.html`, projects));
      const file = target.pathname.endsWith('/') ? new URL('index.html', target) : target;
      assert.ok(await exists(file), `${slug}: ${ref} exists`);
    }
    assert.match(html, /href="\.\.\/project\.css"/);
    assert.match(html, /<a class="cs-wordmark" href="\.\.\/">/, `${slug} wordmark links home`);
    assert.match(html, /href="\.\.\/#work"/, `${slug} links back to the gallery`);
    assert.match(html, /href="\.\.\/#contact"/, `${slug} links to contact`);
    assert.match(html, new RegExp(`<img[^>]+src="\\.\\./assets/${slug}\\.svg"[^>]+alt="[^"]{40,}"`), `${slug} cover with alt text`);
  }
  const css = await read(new URL('project.css', web));
  // The arrow icons are inline data: masks; every other url() is a font file.
  const urls = [...css.matchAll(/url\("([^"]+)"\)/g)].map(match => match[1]).filter(url => !url.startsWith('data:'));
  assert.equal(urls.length, 2);
  for (const url of urls) assert.ok(await exists(new URL(url, new URL('project.css', web))), `${url} exists`);
});

test('previous and next links walk the six projects in gallery order', async () => {
  const all = await pages;
  for (const [i, { slug, html }] of all.entries()) {
    const prev = SLUGS[(i + SLUGS.length - 1) % SLUGS.length];
    const next = SLUGS[(i + 1) % SLUGS.length];
    assert.match(html, new RegExp(`<a href="\\./${prev}\\.html" rel="prev">`), `${slug} prev`);
    assert.match(html, new RegExp(`<a href="\\./${next}\\.html" rel="next">`), `${slug} next`);
  }
});

test('each homepage story links to its project page, and each cover is described once', async () => {
  const index = await read(new URL('index.html', web));
  const stories = index.match(/<div class="project-stories">([\s\S]*?)\n\s*<\/div>/)[1];
  for (const [i, slug] of SLUGS.entries()) {
    const story = stories.match(new RegExp(`<section id="${STORIES[i]}"[\\s\\S]*?</section>`))?.[0];
    assert.ok(story, `${STORIES[i]} exists`);
    assert.match(story, new RegExp(`<a class="text-link[^"]*" href="\\./projects/${slug}\\.html">Read the case study`), `${STORIES[i]} links to ${slug}`);
    // On the homepage the explorer link describes the cover (alt=""); the case
    // study keeps a full description on its own cover.
    assert.match(index, new RegExp(`src="\\./assets/${slug}\\.svg" alt=""`), `${slug} homepage cover is described by its link`);
    const { html } = (await pages)[i];
    assert.match(html, new RegExp(`src="\\.\\./assets/${slug}\\.svg" alt="[^"]{40,}"`), `${slug} case-study cover keeps its description`);
    // Title, category, lead and footnote are the story's own words.
    for (const cls of ['story-category', 'story-lead', 'story-footnote']) {
      const text = plain(story.match(new RegExp(`class="[^"]*${cls}[^"]*">([\\s\\S]*?)</(?:span|p)>`))[1]);
      assert.ok(norm(plain(html)).includes(norm(text)), `${slug} repeats the story's ${cls}: ${text}`);
    }
  }
});

test('every factual sentence and number on a project page is on the homepage, a lab page, in the trace, or in a ledger', async () => {
  const { all } = await corpus;
  const recorded = await facts;
  for (const { slug, html } of await pages) {
    const mine = recorded.filter(fact => fact.page === slug);
    const listed = mine.map(fact => clean(fact.sentence));
    const values = mine.flatMap(valuesOf).map(digits);
    const { labels, sentences } = claims(html);
    assert.ok(sentences.length >= 4, `${slug} has content`);
    for (const label of labels) {
      assert.ok(isLabel(label), `${slug}: label "${label}" is a short label, not a claim`);
    }
    for (const sentence of sentences) {
      const text = clean(sentence);
      assert.ok(all.includes(text) || listed.some(fact => fact.includes(text)), `${slug}: "${sentence}" is not on the homepage, a lab page or in the trace, and not in a ledger`);
    }
    // Numbers and named venues are published somewhere or recorded with a source
    // (chart values through a ledger entry's "values").
    const metrics = plain(numbersOf(html)).match(/[+$]?\d[\d,.]*%?|NCUR|CDay|1st Place/g) || [];
    for (const metric of metrics.map(token => token.replace(/[.,]$/, '')).filter(token => token !== '06' && !/^0\d$/.test(token))) {
      const token = digits(metric);
      assert.ok(all.includes(norm(metric)) || listed.some(fact => digits(fact).includes(token)) || values.includes(token), `${slug}: ${metric} has a source`);
    }
    const description = meta(html, 'name', 'description');
    for (const metric of description.match(/\d[\d,]*%|\$[\d,]+|NCUR|CDay \d+/g) || []) {
      assert.ok(all.includes(norm(metric)), `${slug} description: ${metric} is published on the site`);
    }
  }
});

test('every ledger entry is still on its page and backed by its source', async () => {
  const published = await corpus;
  const files = await sourceFiles;
  const known = await knownSources;
  const recorded = await facts;
  assert.ok(recorded.length > 0);
  const text = Object.fromEntries((await pages).map(({ slug, html }) => [slug, norm(plain(mainOf(html)))]));
  const seen = new Set();
  for (const fact of recorded) {
    const where = `${fact.ledger} · ${fact.page}: "${fact.sentence}"`;
    const ids = sourceList(fact);
    assert.ok(SLUGS.includes(fact.page), `${where}: page is one of the six`);
    for (const id of ids) assert.ok(known.has(id), `${where}: source ${id} is declared in a ledger's "sources"`);
    assert.ok(['verbatim', 'reworded'].includes(fact.wording), `${where}: wording is verbatim or reworded`);
    assert.ok(!seen.has(`${fact.page}|${clean(fact.sentence)}`), `${where} is listed once`);
    seen.add(`${fact.page}|${clean(fact.sentence)}`);
    assert.ok(text[fact.page].includes(clean(fact.sentence)), `${where} no longer appears on its page: update or remove the entry`);
    const quotes = [].concat(fact.quote ?? []);
    assert.ok(quotes.length && quotes.every(quote => typeof quote === 'string' && quote.trim()), `${where} quotes its source`);
    assert.ok(['pending-cesar', 'approved'].includes(fact.status), `${where}: status is approved or pending-cesar`);
    if (fact.status === 'pending-cesar') assert.ok(ids.some(id => MAY_WAIT.includes(id)), `${where}: only résumé and opinion entries may wait for Cesar; anything else must be sourced and approved`);
    if (ids.includes(OPINION)) assert.ok(ids.some(id => !MAY_WAIT.includes(id)), `${where}: an opinion also cites the direction it was written from`);
    if (ids.includes(RESUME)) continue; // Résumé-only facts wait for Cesar; he flips them to "approved".
    if (ids.includes(METHOD)) {
      assert.equal(fact.status, 'approved', `${where}: method entries are approved`);
      assert.ok(typeof fact.note === 'string' && fact.note.trim(), `${where}: method entries explain themselves in a note`);
      continue;
    }
    // Everything else is checked against the text of its sources.
    const haystacks = ids.filter(id => id !== OPINION).map(id => published[id] ?? files[id]);
    assert.ok(haystacks.every(Boolean), `${where}: every source of this entry has text to check (${ids.join(', ')})`);
    for (const quote of quotes) assert.ok(haystacks.some(source => source.includes(clean(quote))), `${where}: quote "${quote}" is in ${ids.join(' or ')}`);
    if (fact.wording === 'verbatim') assert.ok(haystacks.some(source => source.includes(clean(fact.sentence))), `${where} is verbatim in ${ids.join(' or ')}`);
    // Chart values: on the page, and their numbers in one of the quotes (or, with "counted",
    // counted from the quoted items, e.g. prompts per emotion).
    for (const value of valuesOf(fact)) {
      assert.ok(digits(text[fact.page]).includes(digits(value)), `${where}: value ${value} is on the page`);
      if (fact.counted) continue;
      for (const number of digits(value).match(/\$?\d[\d.]*/g) ?? []) assert.ok(quotes.some(quote => digits(quote).includes(number)), `${where}: value ${number} is in a quote`);
    }
  }
});

test('facts waiting for Cesar are listed here (informational, never fails)', async t => {
  const pending = (await facts).filter(fact => fact.status === 'pending-cesar');
  t.diagnostic(`${pending.length} pending-cesar fact(s) across the ledgers`);
  for (const fact of pending) t.diagnostic(`pending-cesar · ${fact.page}: ${fact.sentence} (source: ${sourceList(fact).join(', ')})`);
});

test('the source excerpts exist, say where they came from, and every file source is used', async () => {
  const dir = new URL('../docs/case-study-sources/', import.meta.url);
  const names = (await readdir(dir)).filter(name => name.endsWith('.txt'));
  assert.ok(names.length >= 8);
  for (const name of names) assert.match(await read(new URL(name, dir)), /^(?:URL: https:\/\/\S+|Source: )/, `${name} starts with its URL or source`);
  const files = await sourceFiles;
  const used = new Set((await facts).flatMap(sourceList));
  for (const id of Object.keys(files)) assert.ok(used.has(id), `source ${id} is quoted by at least one entry`);
});

test('each page leads with an "In 30 seconds" block before the cover', async () => {
  const PROJECT = ['Problem', 'My part', 'Result', 'Proof'];
  const SIDE = { voicelab: ['Problem', 'What it is', 'Stage'], 'work-helper': ['Problem', 'Built so far', 'Stage'], 'barking-village': ['Problem', 'What it is', 'Covers'] };
  for (const { slug, html } of await pages) {
    const main = mainOf(html);
    const brief = main.match(/<section class="cs-grid cs-brief" aria-labelledby="brief-title">\s*<h2 class="cs-rail mono cs-brief-title" id="brief-title">In 30 seconds<\/h2>\s*<dl class="cs-main cs-brief-list">([\s\S]*?)<\/dl>\s*<\/section>/);
    assert.ok(brief, `${slug} has the block`);
    assert.ok(main.indexOf('cs-brief') < main.indexOf('cs-cover'), `${slug}: the block comes before the cover`);
    assert.deepEqual([...brief[1].matchAll(/<dt class="mono">([^<]+)<\/dt>/g)].map(match => match[1]), SIDE[slug] ?? PROJECT, `${slug} rows`);
  }
  const html = Object.fromEntries((await pages).map(({ slug, html }) => [slug, html]));
  for (const href of ['../lab/build-trace.html', '../lab/evaluating-agents.html']) assert.ok(html['agent-workflow'].includes(`<a class="cs-text-link" href="${href}">`), `agent workflow proof links to ${href}`);
  assert.match(html['companion-chatbot'], /<dt class="mono">Proof<\/dt><dd><ul class="cs-proof">[\s\S]*?href="\.\.\/lab\/sentiment-eval\.html"/, 'chatbot proof links to the lab');
  // Decision and limit sections only where the facts support them (questions for the rest: docs/case-study-questions.md).
  const has = (slug, id) => html[slug].includes(`id="${id}-title"`);
  for (const slug of ['agent-workflow', 'thoughts-to-text', 'companion-chatbot']) assert.ok(has(slug, 'decision') && has(slug, 'limit'), `${slug} has a decision and a limit`);
  for (const slug of ['voicelab', 'work-helper', 'barking-village']) assert.ok(!has(slug, 'decision'), `${slug} has no unsupported decision section`);
});

test('the result pages carry their sourced facts, and the removed claims stay removed', async () => {
  const html = Object.fromEntries((await pages).map(({ slug, html }) => [slug, html]));
  // +15%, 95% and 20% have no source (docs/case-study-answers.md, Q6 and Q11–Q15): not in the text, meta or JSON-LD of any page.
  for (const [slug, page] of Object.entries(html)) {
    assert.doesNotMatch(page, /\b(?:95|20|15)\s?%|\b(?:95|20|15) percent/i, `${slug}: no 95%, 20% or 15% claim`);
    assert.doesNotMatch(page, /Research Peer Mentor/, `${slug}: the mentoring title is a separate role`);
  }
  const bci = html['thoughts-to-text'];
  for (const token of ['NCUR', '$2,000', 'Md Abdullah Al Hafiz Khan', 'https://digitalcommons.kennesaw.edu/undergradsymposiumksu/Fall2022/presentations/136', 'https://digitalcommons.kennesaw.edu/undergradsymposiumksu/spring2022/presentations/255', 'https://digitalcommons.kennesaw.edu/undergradsymposiumksu/Fall2022/presentations/163']) assert.ok(bci.includes(token), `BCI page shows ${token}`);
  const chat = html['companion-chatbot'];
  assert.ok(chat.includes('I led the four-person capstone team, handling the planning and direction, and designed the backend LLM: the DistilGPT-2 server and the sentiment module. One teammate designed the React Native app, and two others helped with it briefly.'), 'chatbot role sentence, verbatim');
  for (const token of ['First Place', 'C-Day', 'https://www.kennesaw.edu/ccse/events/computing-showcase/sp24-cday-winners.php', 'https://youtu.be/NBu8LE_WF8Q', 'https://virtualcompanionchatbot.wordpress.com/wp-content/uploads/2024/04/ind13-virtualcompanionshipchatbot-finalreport.pdf', 'https://virtualcompanionchatbot.wordpress.com/', 'https://github.com/NoahDClark/VirtualCompanionChatbot', 'https://digitalcommons.kennesaw.edu/cgi/viewcontent.cgi?article=1411&amp;context=cday']) assert.ok(chat.includes(token), `chatbot page shows ${token}`);
  assert.equal((chat.match(/href="\.\.\/lab\/sentiment-eval\.html"/g) || []).length, 1, 'one link to the evaluation lab');
  assert.doesNotMatch(chat, /<iframe|<video|<embed/, 'the video is a link, not an embed');
  const agents = html['agent-workflow'];
  // Nothing ties the workflow to an employer: no company, system, tool or host names.
  assert.doesNotMatch(agents, /Jenkins|Bitbucket|\bADP\b|Jira|Confluence|Splunk|Artifactory|Harness|SPARK-|\.oneadp\.|\.adp\.com/, 'agent workflow names no employer systems');
  assert.match(plain(agents), /Measured through November 11, 2026/);
  assert.match(plain(agents), /The build trace is a recorded run of this same workflow/);
  assert.doesNotMatch(agents, /github\.com\/KoT3sts\/personal-website/, 'the repository is not linked until it is pushed');
});

test('every chart is a figure with a caption and its data; illustrations say so', async () => {
  let charts = 0;
  for (const { slug, html } of await pages) {
    const figures = [...html.matchAll(/<figure[^>]*data-chart="([\w-]+)"[^>]*>([\s\S]*?)<\/figure>/g)];
    if (figures.length) {
      assert.match(html, /<link rel="stylesheet" href="\.\/case-charts\.css">/, `${slug} loads the chart styles`);
      assert.match(html, /<script type="module" src="\.\/case-charts\.js"><\/script>/, `${slug} loads the chart module`);
    }
    for (const [figure, type, inner] of figures) {
      charts++;
      const caption = inner.match(/<figcaption>([\s\S]*?)<\/figcaption>/)?.[1];
      assert.ok(caption && plain(caption).length > 20, `${slug} ${type}: has a caption`);
      if (type === 'counters') assert.match(inner, /<dl class="cc-stats">[\s\S]*class="cc-num"/, `${slug} counters: numbers in a <dl>`);
      else assert.match(inner, /<div class="cc-canvas"><\/div>/, `${slug} ${type}: has a canvas`);
      if (type === 'graph') assert.ok(/<div class="cc-data"[\s\S]*<ol class="cc-nodes"[\s\S]*<ul class="cc-edges"/.test(inner), `${slug} graph: nodes and edges as lists`);
      if (['bars', 'columns', 'line', 'waffle', 'scatter'].includes(type)) assert.match(inner, /<div class="cc-data"[^>]*>\s*<table class="cc-table">\s*<caption>[^<]+<\/caption>\s*<thead>[\s\S]*<th scope="row"/, `${slug} ${type}: a data table with a caption and row headers`);
      const illustration = /data-illustration/.test(figure) || type === 'scatter';
      if (illustration) assert.match(plain(caption), /^Illustration\b/, `${slug} ${type}: the caption starts with "Illustration"`);
    }
  }
  assert.ok(charts >= 12, `${charts} charts`);
});

test('case-charts.js: numbers count up to exactly what the page says, and illustrations are seeded', () => {
  assert.deepEqual(parseNumber('$5,070.56'), { value: 5070.56, decimals: 2, grouped: true, before: '$', after: '' });
  assert.deepEqual(parseNumber('38%'), { value: 38, decimals: 0, grouped: false, before: '', after: '%' });
  assert.equal(parseNumber('about half'), null);
  for (const written of ['514', '38%', '1,360', '$5,070.56', 'about 2,400']) {
    const parsed = parseNumber(written);
    assert.equal(countText(parsed, 1), written, `${written} ends as written`);
    assert.equal(countText(parsed, 0).replace(/[^\d]/g, '').replace(/^0+/, ''), '', `${written} starts at zero`);
  }
  assert.equal(formatNumber(22000, { grouped: true }), '22,000');
  const a = rng(11); const b = rng(11);
  assert.deepEqual([a(), a(), a()], [b(), b(), b()]);
  assert.deepEqual(wrap('Correct or take over', 10), ['Correct or', 'take over']);
  const clusters = makeClusters([24, 24, 24, 24, 24], 11);
  assert.equal(clusters.points.length, 120);
  const strays = noise => placePoints(clusters, noise).filter(point => point.stray).length;
  assert.equal(strays(0), 0, 'no mixing without noise');
  assert.ok(strays(1) > strays(0.2), 'more noise, more mixing');
});

test('case-charts.css and .js: readable, reduced motion, print, no HTML from strings', async () => {
  const css = await read(new URL('projects/case-charts.css', web));
  for (const [, size] of css.matchAll(/font-size: ([\d.]+)px/g)) assert.ok(Number(size) >= 11, `font-size ${size}px`);
  assert.match(css, /@media print \{[^]*\.cc-wait \.cc-anim \{ visibility: visible; \}/);
  assert.match(css, /@media screen and \(prefers-reduced-motion: no-preference\)/);
  assert.doesNotMatch(css, /url\(\s*["']?(?:https?:)?\/\//);
  const js = await read(new URL('projects/case-charts.js', web));
  assert.doesNotMatch(js, /innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\(|new Function|fetch\(|XMLHttpRequest|localStorage|sessionStorage/);
  assert.doesNotMatch(js, /setAttribute\(\s*['"]style['"]/, 'no style attributes (CSP)');
  assert.match(js, /prefers-reduced-motion: reduce/);
  const pkg = JSON.parse(await read(new URL('../package.json', import.meta.url)));
  assert.match(pkg.scripts.check, /node --check web\/projects\/case-charts\.js/);
});

test('chart tables match the values recorded in the ledger, row by row', async () => {
  const html = Object.fromEntries((await pages).map(({ slug, html }) => [slug, html]));
  let checked = 0;
  for (const fact of (await facts).filter(entry => entry.values && !Array.isArray(entry.values))) {
    const where = `${fact.page}: "${fact.sentence}"`;
    const rows = Object.entries(fact.values).map(([label, value]) => [norm(label), [].concat(value)]);
    const table = chartTables(html[fact.page]).find(found => found.length === rows.length && rows.every(([label]) => found.some(row => row.label === label)));
    assert.ok(table, `${where}: a chart table with exactly the rows ${rows.map(([label]) => label).join(', ')}`);
    for (const [label, values] of rows) {
      const row = table.find(found => found.label === label);
      assert.deepEqual(row.cells.map(digits), values.map(digits), `${where}: row ${label}`);
      checked++;
    }
  }
  assert.ok(checked >= 30, `${checked} rows checked`);
  // Totals the captions state.
  const sum = (slug, first) => chartTables(html[slug]).find(table => table[0]?.label === first).reduce((total, row) => total + Number(digits(row.cells[0])), 0);
  assert.equal(sum('agent-workflow', 'nov 7'), 55, 'commits per day add up to 55');
  assert.match(plain(mainOf(html['agent-workflow'])), /55 commits over five days, through November 11, 2026/);
  assert.match(plain(mainOf(html['agent-workflow'])), /stop at a fixed commit from November 11/, 'the site counts are pinned to a commit');
  // Dates, not internal round numbers or commit hashes, in the visible text.
  assert.doesNotMatch(plain(mainOf(html['agent-workflow'])), /\brounds?\b|\b[0-9a-f]{7}\b/i, 'no rounds or commit hashes');
  assert.equal(sum('companion-chatbot', 'joy'), 10, 'the test set has 10 prompts');
  assert.ok(sum('agent-workflow', 'general purpose') <= 527, 'the top roles fit in 527 delegations');
});

test('no unsourced claim or employer system name anywhere on the site', async () => {
  const walk = async dir => (await Promise.all((await readdir(dir, { withFileTypes: true })).map(entry => {
    const url = new URL(entry.name + (entry.isDirectory() ? '/' : ''), dir);
    return entry.isDirectory() ? walk(url) : [url];
  }))).flat();
  const files = (await walk(web)).filter(url => /\.(?:html|svg)$/.test(url.pathname));
  assert.ok(files.length >= 20, `${files.length} pages and images`);
  const SYSTEMS = /Bitbucket|Jira\b|Confluence|Splunk|Harness|SPARK-\d|oneadp|\.adp\.com|deployment-dashboard/i;
  for (const url of files) {
    const name = url.pathname.slice(web.pathname.length);
    let body = await read(url);
    assert.doesNotMatch(body, /\b(?:95|20|15)\s?%|\b(?:95|20|15) percent|\+15\b/i, `${name}: no 95%, 20% or +15% claim`);
    // The homepage's career sections (What I can do, Experience) list the CI tools Cesar used
    // at work (Jenkins, Artifactory); nothing else may name them, the workflow story included.
    if (name === 'index.html') body = body.replace(/<section id="(?:capabilities|experience)"[\s\S]*?<\/section>\s*(?=<section id="(?:experience|work)")/g, '');
    assert.doesNotMatch(body, SYSTEMS, `${name}: no employer system names`);
    assert.doesNotMatch(body, /Jenkins|Artifactory/, `${name}: no employer CI tools outside Experience: ${body.slice(Math.max(0, body.search(/Jenkins|Artifactory/) - 160), body.search(/Jenkins|Artifactory/) + 20)}`);
  }
});

test('sitemap.xml lists every project page', async () => {
  const xml = await read(new URL('sitemap.xml', web));
  const site = await siteUrl();
  for (const slug of SLUGS) assert.ok(xml.includes(`<loc>${site}projects/${slug}.html</loc>`), `${slug} in sitemap`);
});

test('dev server serves the project pages and stylesheet', async () => {
  const port = 43000 + Math.floor(Math.random() * 2000);
  const server = spawn(process.execPath, [fileURLToPath(new URL('../scripts/serve.mjs', import.meta.url))], { env: { ...process.env, PORT: String(port) }, stdio: ['ignore', 'pipe', 'inherit'] });
  try {
    await new Promise((resolve, reject) => {
      server.stdout.once('data', resolve);
      server.once('exit', code => reject(new Error(`server exited ${code}`)));
    });
    for (const [path, type] of [...SLUGS.map(slug => [`/projects/${slug}.html`, /^text\/html/]), ['/project.css', /^text\/css/]]) {
      const response = await fetch(`http://127.0.0.1:${port}${path}`);
      assert.equal(response.status, 200, path);
      assert.match(response.headers.get('content-type'), type, path);
      await response.arrayBuffer();
    }
  } finally {
    server.kill();
  }
});

test('the pages fix: honest review sentence, the BCI records told apart, NCUR flagged, and source links next to key claims', async () => {
  const html = Object.fromEntries((await pages).map(({ slug, html }) => [slug, html]));
  const telemetry = JSON.parse(await read(new URL('lab/data/agent-traces.json', web)));
  const d = telemetry.rollups.delegations;
  const all = Object.values(d).reduce((a, b) => a + b, 0);
  const review = telemetry.evaluations.filter(row => row.evaluator === 'review_before_commit');
  const pass = review.filter(row => row.label === 'pass').length;
  assert.ok(plain(html['agent-workflow']).includes(`review and verification were selective: a verifier ran in ${d['verification-runner']} of ${all} delegations and a reviewer in ${d['quality-reviewer']}, and “Review before commit” passed in only ${pass} of ${review.length} scored traces`));
  assert.match(html['thoughts-to-text'], /stipend\. <span class="mono cs-flag">Self-reported, no public record<\/span>/, 'NCUR and the stipend are marked as self-reported');
  assert.match(plain(html['thoughts-to-text']), /the Spring 2022 poster is titled for an invasive BCI and sets out the aim, while the Fall 2022 talk is titled for a non-invasive BCI/);
  // "Reproduce this" / "Check the source" rows: a label and link names only (no new claims),
  // each pointing at public evidence that exists: a lab page, a published data file or a public record.
  const PUBLIC = /^(?:\.\.\/lab\/[\w-]+\.html(?:#[\w-]+)?|\.\.\/lab\/data\/[\w.-]+\.json|\.\.\/trace\/build-trace\.json|https:\/\/(?:digitalcommons\.kennesaw\.edu|virtualcompanionchatbot\.wordpress\.com|github\.com\/NoahDClark)\/\S+)$/;
  let rows = 0;
  for (const [slug, page] of Object.entries(html)) {
    for (const [row] of page.matchAll(/<p class="cs-repro">[\s\S]*?<\/p>/g)) {
      rows += 1;
      assert.match(row, /^<p class="cs-repro"><span class="mono cs-repro-label">(?:Reproduce this|Check the source)<\/span>/, `${slug}: ${row}`);
      const links = [...row.matchAll(/<a class="cs-repro-link" href="([^"]+)"><span class="mono">([^<]+)<\/span>/g)];
      assert.ok(links.length, `${slug}: a row has links`);
      for (const [, href, name] of links) {
        assert.match(href, PUBLIC, `${slug}: ${href} is public evidence`);
        assert.doesNotMatch(name, /\d/, `${slug}: link names stay labels`);
        if (href.startsWith('../')) assert.ok(await exists(new URL(href.split('#')[0], new URL(`${slug}.html`, projects))), `${slug}: ${href} exists`);
      }
    }
  }
  assert.ok(rows >= 6, `${rows} source rows`);
});

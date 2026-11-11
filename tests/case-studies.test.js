// Project pages in web/projects/: metadata, links, the "In 30 seconds" block, and
// that every factual sentence on a page is already published (homepage, a lab page
// or the build trace) or recorded with its source in docs/case-study-facts.json.
// Plain text checks, no DOM.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { access, readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

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
const SOURCES = ['homepage', 'lab', 'trace', RESUME];
const facts = readFile(new URL('../docs/case-study-facts.json', import.meta.url), 'utf8').then(JSON.parse).then(file => file.facts);
// A sentence as compared: normalised, without its closing period, colon or question mark.
const clean = text => norm(text).replace(/[.:?]$/, '');
const mainOf = html => html.match(/<main[^>]*>([\s\S]*?)<\/main>/)[1];
// Diagram node labels (e.g. "Input", "My part") are labels like <dt>, not claims.
const FLOW_LABEL = /<p class="mono cs-flow-label">([^<]*)<\/p>/g;
function claims(html) {
  const main = mainOf(html);
  const labels = [...main.matchAll(FLOW_LABEL)].map(match => match[1]);
  const body = main
    .replace(/<h[12][^>]*>[\s\S]*?<\/h[12]>/g, '')       // headings
    .replace(/<dt[^>]*>[\s\S]*?<\/dt>/g, '')             // labels
    .replace(FLOW_LABEL, '')                              // diagram labels
    .replace(/<dd class="mono">\d\d \/ 06<\/dd>/g, '');  // position in the set
  const lines = body.replace(/<\/(?:p|li|dd|figcaption)>/g, '\n').split('\n').map(plain).filter(Boolean);
  return { labels, sentences: lines.flatMap(line => line.split(/(?<=[.!?])\s+/)) };
}

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
    assert.doesNotMatch(html, /<script(?![^>]*application\/ld\+json)/, `${slug} needs no JavaScript`);
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

test('every factual sentence on a project page is on the homepage, a lab page, in the trace, or in docs/case-study-facts.json', async () => {
  const { all } = await corpus;
  const recorded = await facts;
  for (const { slug, html } of await pages) {
    const listed = recorded.filter(fact => fact.page === slug).map(fact => clean(fact.sentence));
    const { labels, sentences } = claims(html);
    assert.ok(sentences.length >= 4, `${slug} has content`);
    for (const label of labels) {
      assert.ok(label.split(/\s+/).length <= 3 && !/\d/.test(label), `${slug}: diagram label "${label}" is a short label, not a claim`);
    }
    for (const sentence of sentences) {
      const text = clean(sentence);
      assert.ok(all.includes(text) || listed.some(fact => fact.includes(text)), `${slug}: "${sentence}" is not on the homepage, a lab page or in the trace, and not in docs/case-study-facts.json`);
    }
    // Numbers and named venues are published somewhere or recorded with a source.
    const metrics = plain(mainOf(html)).match(/[+$]?\d[\d,.]*%?|NCUR|CDay|1st Place/g) || [];
    for (const metric of metrics.map(token => token.replace(/[.,]$/, '')).filter(token => token !== '06' && !/^0\d$/.test(token))) {
      assert.ok(all.includes(norm(metric)) || listed.some(fact => fact.includes(norm(metric))), `${slug}: ${metric} has a source`);
    }
    const description = meta(html, 'name', 'description');
    for (const metric of description.match(/\d[\d,]*%|\$[\d,]+|NCUR|CDay \d+/g) || []) {
      assert.ok(all.includes(norm(metric)), `${slug} description: ${metric} is published on the site`);
    }
  }
});

test('every entry in docs/case-study-facts.json is still on its page and backed by its source', async () => {
  const sources = await corpus;
  const recorded = await facts;
  assert.ok(recorded.length > 0);
  const text = Object.fromEntries((await pages).map(({ slug, html }) => [slug, norm(plain(mainOf(html)))]));
  const seen = new Set();
  for (const fact of recorded) {
    const where = `${fact.page}: "${fact.sentence}"`;
    assert.ok(SLUGS.includes(fact.page), `${where}: page is one of the six`);
    assert.ok(SOURCES.includes(fact.source), `${where}: source is one of ${SOURCES.join(', ')}`);
    assert.ok(['verbatim', 'reworded'].includes(fact.wording), `${where}: wording is verbatim or reworded`);
    assert.ok(!seen.has(`${fact.page}|${clean(fact.sentence)}`), `${where} is listed once`);
    seen.add(`${fact.page}|${clean(fact.sentence)}`);
    assert.ok(text[fact.page].includes(clean(fact.sentence)), `${where} no longer appears on its page: update or remove the entry`);
    const quotes = [].concat(fact.quote ?? []);
    assert.ok(quotes.length && quotes.every(quote => typeof quote === 'string' && quote.trim()), `${where} quotes its source`);
    if (fact.source === RESUME) {
      // Résumé-only facts wait for Cesar; he flips them to "approved".
      assert.ok(['pending-cesar', 'approved'].includes(fact.status), `${where}: status`);
    } else {
      assert.equal(fact.status, 'approved', `${where}: facts already published on the site are approved`);
      for (const quote of quotes) assert.ok(sources[fact.source].includes(clean(quote)), `${where}: quote "${quote}" is in the ${fact.source}`);
      if (fact.wording === 'verbatim') assert.ok(sources[fact.source].includes(clean(fact.sentence)), `${where} is verbatim in the ${fact.source}`);
    }
  }
});

test('résumé facts waiting for Cesar are listed here (informational, never fails)', async t => {
  const pending = (await facts).filter(fact => fact.status === 'pending-cesar');
  t.diagnostic(`${pending.length} pending-cesar fact(s) in docs/case-study-facts.json`);
  for (const fact of pending) t.diagnostic(`pending-cesar · ${fact.page}: ${fact.sentence} (source: ${fact.source})`);
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
  assert.ok(has('agent-workflow', 'decision') && has('agent-workflow', 'limit'));
  assert.ok(has('companion-chatbot', 'limit'));
  for (const slug of ['thoughts-to-text', 'voicelab', 'work-helper', 'barking-village']) assert.ok(!has(slug, 'decision'), `${slug} has no unsupported decision section`);
});

test('the result pages carry the published metrics', async () => {
  const byslug = Object.fromEntries((await pages).map(({ slug, html }) => [slug, plain(html)]));
  for (const token of ['15%', 'NCUR', '$2,000']) assert.ok(byslug['thoughts-to-text'].includes(token), `BCI page shows ${token}`);
  for (const token of ['95%', '20%', '1st Place', 'CDay 2024']) assert.ok(byslug['companion-chatbot'].includes(token), `chatbot page shows ${token}`);
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

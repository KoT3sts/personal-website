// Project pages in web/projects/: metadata, links, and that every factual
// line on a page is already published on the homepage (no new claims).
// Plain text checks, no DOM.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { access, readFile } from 'node:fs/promises';
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
  const urls = [...css.matchAll(/url\("([^"]+)"\)/g)].map(match => match[1]);
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

test('every factual line on a project page is already on the homepage', async () => {
  const index = norm(plain(await read(new URL('index.html', web))));
  for (const { slug, html } of await pages) {
    const main = html.match(/<main[^>]*>([\s\S]*?)<\/main>/)[1]
      .replace(/<h[12][^>]*>[\s\S]*?<\/h[12]>/g, '')       // headings
      .replace(/<dt[^>]*>[\s\S]*?<\/dt>/g, '')             // labels
      .replace(/<dd class="mono">\d\d \/ 06<\/dd>/g, '');  // position in the set
    const lines = main.replace(/<\/(?:p|li|dd|figcaption)>/g, '\n').split('\n').map(plain).filter(Boolean);
    assert.ok(lines.length >= 4, `${slug} has content`);
    for (const line of lines) {
      for (const sentence of line.split(/(?<=[.!?])\s+/)) {
        const text = norm(sentence).replace(/[.:]$/, '');
        assert.ok(index.includes(text), `${slug}: "${sentence}" is not on the homepage`);
      }
    }
    // Metrics and named venues must match the homepage exactly.
    const metrics = plain(html.match(/<main[^>]*>([\s\S]*?)<\/main>/)[1]).match(/[+$]?\d[\d,]*%?|NCUR|CDay|1st Place/g) || [];
    for (const metric of metrics.filter(token => token !== '06' && !/^0\d$/.test(token))) {
      assert.ok(index.includes(norm(metric)), `${slug}: ${metric} is on the homepage`);
    }
    const description = meta(html, 'name', 'description');
    for (const metric of description.match(/\d[\d,]*%|\$[\d,]+|NCUR|CDay \d+/g) || []) {
      assert.ok(index.includes(norm(metric)), `${slug} description: ${metric} is on the homepage`);
    }
  }
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

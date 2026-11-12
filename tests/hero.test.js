// Portrait-led hero (SPECIFICATION V02). Plain text checks on the shipped
// files, so they run under node without a DOM.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');
const bytes = path => readFile(new URL(path, import.meta.url));

const html = await read('../web/index.html');
const hero = html.match(/<section id="home"[\s\S]*?<\/section>/)?.[0] ?? '';
const art = hero.match(/<div class="hero-art"[\s\S]*?<div class="art-coordinate[^>]*>[^<]*<\/div>\s*<\/div>/)?.[0] ?? '';
const attr = (tag, name) => tag.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1];

// Image dimensions from the file headers (PNG IHDR, WebP VP8/VP8L/VP8X).
function pngSize(data) {
  assert.equal(data.toString('ascii', 1, 4), 'PNG');
  return [data.readUInt32BE(16), data.readUInt32BE(20)];
}
function webpSize(data) {
  assert.equal(data.toString('ascii', 0, 4), 'RIFF');
  assert.equal(data.toString('ascii', 8, 12), 'WEBP');
  const chunk = data.toString('ascii', 12, 16);
  if (chunk === 'VP8X') return [1 + data.readUIntLE(24, 3), 1 + data.readUIntLE(27, 3)];
  if (chunk === 'VP8L') { const bits = data.readUInt32LE(21); return [1 + (bits & 0x3fff), 1 + ((bits >> 14) & 0x3fff)]; }
  return [data.readUInt16LE(26) & 0x3fff, data.readUInt16LE(28) & 0x3fff];
}

test('the hero shows Cesar\'s portrait as content, in front of the headline', () => {
  assert.ok(art, 'hero art block');
  assert.ok(hero.indexOf('id="hero-title"') < hero.indexOf('class="hero-art"'), 'the art follows the headline');
  assert.doesNotMatch(art.match(/<div class="hero-art"[^>]*>/)[0], /aria-hidden/, 'the art block is not hidden: it holds the portrait');
  const picture = art.match(/<picture class="hero-portrait">[\s\S]*?<\/picture>/)?.[0];
  assert.ok(picture, '<picture class="hero-portrait">');
  const img = picture.match(/<img[^>]*>/)[0];
  assert.equal(attr(img, 'alt'), 'Cesar Tortolero');
  assert.equal(attr(img, 'fetchpriority'), 'high');
  assert.equal(attr(img, 'loading'), undefined, 'never lazy: it is the first screen');
  assert.equal(attr(img, 'src'), './assets/cesar-portrait-640.png');
  assert.equal(attr(img, 'width'), '560');
  assert.equal(attr(img, 'height'), '671');
  const source = picture.match(/<source[^>]*>/)[0];
  assert.equal(attr(source, 'type'), 'image/webp');
  assert.deepEqual(attr(source, 'srcset').split(',').map(entry => entry.trim()), ['./assets/cesar-portrait-560.webp 560w', './assets/cesar-portrait-1040.webp 1040w']);
  // sizes follows portrait.css: phone (<=760), tablet (<=1100), desktop.
  const sizes = attr(source, 'sizes');
  assert.ok(sizes.startsWith('(max-width: 760px) '), sizes);
  assert.ok(sizes.includes(', (max-width: 1100px) '), sizes);
  assert.doesNotMatch(sizes.split('(max-width: 1100px)')[1], /\(max-width/, 'one unconditional desktop size last');
});

test('the portrait files match their srcset descriptors and the declared aspect ratio', async () => {
  const [pw, ph] = pngSize(await bytes('../web/assets/cesar-portrait-640.png'));
  assert.deepEqual([pw, ph], [640, 767]);
  for (const [file, width] of [['cesar-portrait-560.webp', 560], ['cesar-portrait-1040.webp', 1040]]) {
    const [w, h] = webpSize(await bytes(`../web/assets/${file}`));
    assert.equal(w, width, `${file} width matches its ${width}w descriptor`);
    assert.ok(Math.abs(w / h - 560 / 671) < 0.005, `${file} keeps the 560x671 aspect`);
  }
  assert.ok(Math.abs(pw / ph - 560 / 671) < 0.005, 'the PNG fallback keeps the aspect');
});

test('the sculpture is a small decorative accent, no longer preloaded or high priority', () => {
  assert.doesNotMatch(html, /rel="preload"[^>]*sculpture\.svg/, 'no sculpture preload');
  assert.doesNotMatch(html, /<img[^>]*\/sculpture\.svg/, 'the sculpture is not an <img> any more');
  assert.equal((html.match(/fetchpriority="high"/g) || []).length, 1, 'only the portrait is high priority');
  const orbit = art.match(/<div class="hero-orbit" aria-hidden="true">[\s\S]*?<\/svg>\s*<\/div>/)?.[0];
  assert.ok(orbit, 'inline, aria-hidden orbit accent');
  assert.match(orbit, /<svg class="sculpture"[^>]*focusable="false"/);
  assert.ok(art.indexOf('hero-orbit') < art.indexOf('hero-portrait'), 'drawn behind the portrait');
  assert.equal((orbit.match(/class="orbiter[^"]*"/g) || []).length, 2, 'two orbit points');
  // Gradient ids are namespaced so they cannot clash with other inline SVG.
  for (const id of orbit.match(/\sid="([^"]+)"/g) || []) assert.match(id, /id="sculpture-/);
  assert.match(art, /<div class="orbit-label[^"]*" aria-hidden="true">/);
  assert.match(art, /<div class="art-coordinate[^"]*" aria-hidden="true">/);
});

test('the orbit points pause with the hero loop, the tour and reduced motion', async () => {
  const motion = await read('../web/motion.css');
  const styles = await read('../web/styles.css');
  assert.match(motion, /\.hero-orbit \.orbiter \{[^}]*offset-path: path\([^}]*animation: hero-orbit /);
  assert.match(motion, /\.hero\[data-loop="paused"\] \.orbiter, html\.agentic-running \.orbiter \{ animation-play-state: paused; \}/);
  assert.match(styles, /prefers-reduced-motion: reduce\) \{ html \{[^}]*\} \*, \*::before, \*::after \{ animation: none !important;/);
  const motionJs = await read('../web/motion.js');
  assert.match(motionJs, /const LOOPS = \[[^\]]*'\.hero'/, 'the hero is a watched loop');
  assert.doesNotMatch(motionJs, /syncSculpture|#still/, 'no more SVG-image fragment switching');
});

test('a portrait that fails to load hands the centre back to the sculpture', async () => {
  const motionJs = await read('../web/motion.js');
  const portrait = await read('../web/portrait.css');
  const motion = await read('../web/motion.css');
  assert.match(motionJs, /hero\.dataset\.portrait = 'failed'/);
  assert.match(portrait, /\.hero\[data-portrait="failed"\] \.hero-portrait \{ display: none; \}/);
  assert.match(portrait, /\.hero\[data-portrait="failed"\] \.hero-orbit \{[^}]*width: 100%/);
  assert.match(motion, /\.hero\[data-portrait="failed"\] \.hero-art::before \{ display: block; \}/, 'ground shadow only for the fallback');
});

test('the build tour places the portrait with its own reveal and still builds the accent', async () => {
  const entrance = await read('../web/entrance.js');
  const portrait = await read('../web/portrait.css');
  assert.match(entrance, /\{ sel: '\.hero-portrait', role: 'art', kind: 'reveal'[^}]*art: true, act: 'placing portrait' \}/);
  assert.match(entrance, /\{ sel: '\.sculpture', role: 'art', kind: 'reveal'/);
  assert.match(entrance, /\{ sel: '\.hero-orbit', role: 'motion', kind: 'orbit'/);
  assert.match(entrance, /\['box-art', '\.hero-art', 'boxing portrait'\]/);
  // entrance.css loads later with `.agentic-target[data-build-kind="art"][data-build-state]`
  // (three classes/attributes); the portrait's reveal must outrank it.
  assert.match(portrait, /\.hero \.hero-portrait\.agentic-target\[data-build-state="pending"\] \{[^}]*mask-position: 0 100%/);
  assert.match(portrait, /\.hero \.hero-portrait\.agentic-target\[data-build-state="placing"\] \{[^}]*transition:[^}]*mask-position var\(--agentic-d/);
});

test('the link card uses the portrait, not the sculpture, at 1200x630', async () => {
  const card = await read('../scripts/og-card.html');
  assert.match(card, /<img src="\.\.\/web\/assets\/cesar-portrait-1040\.webp"/);
  assert.doesNotMatch(card, /sculpture\.svg/);
  // JPEG frame size from the first SOF marker.
  const data = await bytes('../web/assets/og-card.jpg');
  let offset = 2;
  let size = null;
  while (offset < data.length && !size) {
    const marker = data[offset + 1];
    const length = data.readUInt16BE(offset + 2);
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) size = [data.readUInt16BE(offset + 7), data.readUInt16BE(offset + 5)];
    offset += 2 + length;
  }
  assert.deepEqual(size, [1200, 630]);
  assert.match(html, /og:image:width" content="1200"/);
  assert.match(html, /og:image:height" content="630"/);
});

test('contact polish: the copy toast clears the headline and the glow waits for the reveal', async () => {
  const motion = await read('../web/motion.css');
  assert.match(motion, /@media \(max-width: 760px\) \{[^@]*\.contact-actions \{ margin-top: 56px; \}[^@]*\.contact-toast \{ bottom: calc\(100% \+ 10px\);/);
  assert.match(motion, /\.contact h2\[data-headline\] \{ text-shadow: 0 0 40px #e3eac500; \}/);
  assert.match(motion, /\.contact h2 \{ transition: text-shadow /);
});

// ---- Round 7: proof strip, figures stated once, skills, deferred flow field ----

const plainText = markup => markup.replace(/<span class="visually-hidden">[^<]*<\/span>/g, '').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
const sectionOf = id => html.match(new RegExp(`<section id="${id}"[\\s\\S]*?\\n    </section>`))?.[0] ?? '';

test('the proof strip: three facts under the intro, each linking to where it is backed up', async () => {
  const strip = hero.match(/<ul class="hero-proof" aria-label="Highlights">([\s\S]*?)<\/ul>/)?.[1];
  assert.ok(strip, 'a labelled list in the hero');
  assert.ok(hero.indexOf('class="hero-intro"') < hero.indexOf('class="hero-proof"') && hero.indexOf('class="hero-proof"') < hero.indexOf('class="hero-actions'), 'after the intro, before the actions (reading order)');
  const links = [...strip.matchAll(/<li><a href="(#[a-z]+)"><span class="proof-figure">([\s\S]*?)<\/span> <span class="proof-label mono">([^<]+?) <span class="icon icon-arrow-s" aria-hidden="true"><\/span><\/span><\/a><\/li>/g)];
  assert.deepEqual(links.map(([, href]) => href), ['#experience', '#experience', '#approach']);
  assert.deepEqual(links.map(([, , figure]) => plainText(figure)), ['~ 350', '250+', 'Day minutes']);
  assert.deepEqual(links.map(([, , , label]) => label), ['Developers I helped train', 'Agents running on the platform I teach', 'Firewall checks across 24 AWS accounts']);
  // The arrow in "Day → minutes" is a drawn icon; screen readers hear "Day to minutes".
  assert.match(links[2][2], /^Day <span class="icon icon-arrow-e" aria-hidden="true"><\/span><span class="visually-hidden">to <\/span>minutes$/);
  // "~" is not read out: screen readers hear "About 350".
  assert.match(links[0][2], /^<span aria-hidden="true">~<\/span><span class="visually-hidden">About <\/span>350$/);
  // Every fact is stated where the link lands.
  const experience = plainText(sectionOf('experience'));
  const approach = plainText(sectionOf('approach'));
  assert.match(experience, /to ~350 developers/);
  assert.match(experience, /The platform now runs 250\+ agents/);
  assert.match(approach, /about a day of manual testing[^.]*\. Asking why led to a diagnostics app that runs the same checks from one screen in minutes\./);
  // The build tour sets it during the hero stop (one grouped job, so the label cap holds).
  const entrance = await read('../web/entrance.js');
  assert.match(entrance, /\{ sel: '\.hero-proof > li', role: 'type', kind: 'reveal', wave: \d+, each: true, group: '\.hero-proof', grouped: true, act: 'setting proof figures' \}/);
  assert.match(entrance, /const HERO_BADGES = 6;/);
  // Mono label, large display figure; placed per breakpoint without shrinking type.
  const styles = await read('../web/styles.css');
  const portrait = await read('../web/portrait.css');
  assert.match(styles, /\.proof-figure \{ font-size: clamp\(26px, [^;]+\); font-weight: var\(--display-weight\);/);
  assert.match(portrait, /@media \(min-width: 1101px\) \{[^@]*\.hero-bottom \.hero-proof \{ grid-column: 1; grid-row: 2;/);
});

test('each headline figure is stated once on the page (plus the strip), where it is explained', () => {
  const main = html.match(/<main id="main">([\s\S]*)<\/main>/)[1].replace(/<ul class="hero-proof"[\s\S]*?<\/ul>/, '');
  const body = plainText(main);
  const count = pattern => (body.match(pattern) || []).length;
  assert.equal(count(/~350/g), 1, '~350: the Experience bullet');
  assert.equal(count(/250\+/g), 1, '250+: the Experience bullet');
  assert.equal(count(/18\+/g), 2, '18+: the Experience bullet and the Approach story');
  assert.equal(count(/\b24(?:-account| AWS accounts)/g), 2, '24 accounts: the Experience bullet and the Approach story');
  assert.equal(count(/about a day/g), 1, 'a day to minutes: the Approach story only (plus the strip)');
  assert.equal(count(/firewall/gi), 2, 'the firewall app: the Experience bullet and one Approach story');
  assert.doesNotMatch(html, /class="xp-marks"/, 'no milestone rows repeating the bullets');
  const capabilities = plainText(sectionOf('capabilities'));
  assert.doesNotMatch(capabilities, /~350|250\+|18\+|\b24\b|about a day/);
  // The Approach focus chips restate the story in words, not figures.
  for (const [, chips] of sectionOf('approach').matchAll(/<ul class="approach-focus mono" aria-label="In practice">([\s\S]*?)<\/ul>/g)) assert.doesNotMatch(chips, /\d|→/, chips);
});

test('skills: a compact grid of core skills in five groups, each on the résumé', () => {
  const list = html.match(/<dl class="skill-list">([\s\S]*?)<\/dl>/)[1];
  const groups = [...list.matchAll(/<div><dt>([^<]+)<\/dt><dd><ul class="tag-list">([\s\S]*?)<\/ul><\/dd><\/div>/g)].map(([, name, tags]) => [name.replace('&amp;', '&'), [...tags.matchAll(/<li>([^<]+)<\/li>/g)].map(match => match[1])]);
  assert.deepEqual(groups, [
    ['Languages', ['Python', 'SQL', 'TypeScript']],
    ['LLMs & agents', ['MCP', 'LangChain', 'RAG', 'LLM evaluation']],
    ['ML & MLOps', ['scikit-learn', 'TensorFlow', 'MLflow']],
    ['Cloud & infra', ['AWS Bedrock AgentCore', 'Amazon SageMaker', 'AWS Lambda', 'Terraform', 'Docker']],
    ['Backend & testing', ['FastAPI', 'pytest']],
  ]);
});

test('the About flow field loads only once About is near, with a no-script copy', async () => {
  const about = sectionOf('about');
  const flow = about.match(/<div class="about-flow" aria-hidden="true">([\s\S]*?)<\/div>/)?.[1] ?? '';
  const [lazy, fallback] = flow.match(/<img[^>]*>/g) || [];
  assert.equal(attr(lazy, 'data-src'), './assets/about-flow.svg');
  assert.equal(attr(lazy, 'src'), undefined, 'no src in the markup: nothing is fetched with the page');
  assert.equal(attr(lazy, 'decoding'), 'async');
  assert.match(flow, /<noscript><img src="\.\/assets\/about-flow\.svg" alt="" width="1600" height="1000" decoding="async"><\/noscript>/);
  assert.equal(attr(fallback, 'src'), './assets/about-flow.svg');
  const app = await read('../web/app.js');
  assert.match(app, /deferAboutFlow\(document, window\);/, 'initPortfolio wires it');
  assert.match(app, /addEventListener\('beforeprint', load\)/, 'printing from the top still loads the image');
  assert.match(app, /const intents = \['wheel', 'touchstart', 'pointerdown', 'keydown'\];/);
  assert.match(app, /entry\.intersectionRect\.height > 0/, 'the edge-adjacent fold does not count');
  assert.match(app, /dataset\.tour === 'play'\) timer = window\.setTimeout\(load, /, 'ahead of the build tour');
  const styles = await read('../web/styles.css');
  assert.match(styles, /\.about-flow img:not\(\[src\]\) \{ display: none; \}/);
});

test('deferAboutFlow: nothing at the fold edge, loads on intent, a real overlap, a deep link or ahead of the tour', async () => {
  const { deferAboutFlow, FLOW_TOUR_LEAD_MS } = await import('../web/app.js');
  function rig({ scrollY = 0, tour } = {}) {
    const listeners = new Map();
    const timers = [];
    let observed = null;
    const image = {
      dataset: { src: './assets/about-flow.svg' }, src: undefined,
      removeAttribute(name) { if (name === 'data-src') delete this.dataset.src; },
      closest: () => 'about-section',
    };
    const document = { querySelector: () => (image.dataset.src ? image : null), documentElement: { dataset: tour ? { tour } : {} } };
    const window = {
      scrollY,
      performance: { now: () => 1000 },
      addEventListener: (type, fn) => listeners.set(type, fn),
      removeEventListener: type => listeners.delete(type),
      setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; },
      clearTimeout() {},
      IntersectionObserver: class { constructor(callback) { observed = { callback }; } observe(target) { observed.target = target; } disconnect() { observed.gone = true; } },
    };
    deferAboutFlow(document, window);
    return { image, window, listeners, timers, io: () => observed };
  }
  const idle = rig();
  assert.equal(idle.image.src, undefined, 'not fetched with the page');
  assert.equal(idle.io().target, 'about-section');
  idle.io().callback([{ intersectionRect: { height: 0 } }]);
  assert.equal(idle.image.src, undefined, 'the section touching the fold is not "near" yet');
  idle.listeners.get('scroll')();
  assert.equal(idle.image.src, undefined, 'a scroll event at the very top does nothing');
  assert.deepEqual(idle.timers, [], 'no timer without the tour');
  idle.listeners.get('wheel')();
  assert.equal(idle.image.src, './assets/about-flow.svg', 'a wheel turn loads it');
  assert.equal(idle.image.dataset.src, undefined);
  assert.equal(idle.listeners.size, 0, 'listeners removed');
  assert.ok(idle.io().gone);

  const overlap = rig();
  overlap.io().callback([{ intersectionRect: { height: 1 } }]);
  assert.equal(overlap.image.src, './assets/about-flow.svg', 'a real overlap loads it');

  const deep = rig({ scrollY: 900 });
  assert.equal(deep.image.src, './assets/about-flow.svg', 'a page that opens lower down loads it at once');

  const tour = rig({ tour: 'play' });
  assert.equal(tour.timers.length, 1);
  assert.equal(tour.timers[0].ms, FLOW_TOUR_LEAD_MS - 1000, 'counted from navigation start');
  tour.timers[0].fn();
  assert.equal(tour.image.src, './assets/about-flow.svg', 'loaded ahead of the tour reaching About');
});

// ---- Round 10: the proof figures count up (an enhancement) ----

test('the proof figures count up over a hidden copy; the markup and screen readers keep the final figures', async () => {
  // The markup is unchanged: no-script and screen readers get the final figures.
  const strip = hero.match(/<ul class="hero-proof" aria-label="Highlights">([\s\S]*?)<\/ul>/)?.[1] ?? '';
  assert.doesNotMatch(strip, /proof-count|data-count/);
  const charts = await read('../web/home-charts.js');
  const css = await read('../web/home-charts.css');
  // The counting copy is aria-hidden and laid over the final text, which keeps the width.
  assert.match(charts, /document\.querySelectorAll\('\.hero-proof \.proof-figure'\)/);
  assert.match(charts, /ink\.setAttribute\('aria-hidden', 'true'\)/);
  assert.match(css, /\.proof-count\.is-counting \.proof-count-final \{ color: transparent; \}/);
  assert.match(css, /\.proof-count-ink \{ position: absolute;/);
  // It starts when the strip is shown (after the tour places it) and never with reduced motion.
  assert.match(charts, /whenShown\(document, window, counter\.figure\.closest\('li'\)/);
  assert.match(charts, /if \(!counters\.length \|\| !motionAllowed\(window\)\) return counters;/);
  const app = await read('../web/app.js');
  assert.match(app, /try \{ initHomeCharts\(document, window\); \} catch/);
  assert.ok(app.indexOf('initHomeCharts(document, window)') < app.indexOf('  bootEntrance(document, window);\n'), 'drawn before the tour plans its targets');
});

// ---- November 12: availability line, intro, and the first-visit-only build tour ----

test('the kicker is the availability line: open to AI/ML roles, where and how, with its status dot', async () => {
  const kicker = hero.match(/<div class="hero-kicker mono">([\s\S]*?)<\/div>/)?.[1] ?? '';
  assert.match(kicker, /^<span class="status-dot" aria-hidden="true"><\/span> /, 'the dot stays, hidden from screen readers');
  assert.equal(plainText(kicker), 'OPEN TO AI/ML ENGINEER ROLES · NYC AREA, HYBRID OR REMOTE');
  assert.doesNotMatch(kicker, /MORRISTOWN/);
  // Phones: two lines, the separator kept for screen readers only, the dot beside the first line.
  const styles = await read('../web/styles.css');
  const phone = styles.match(/@media \(max-width: 480px\) \{([^@]*?)\}\n/)?.[1] ?? '';
  assert.match(phone, /\.kicker-sep \{ position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect\(0 0 0 0\);/);
  assert.match(phone, /\.kicker-where \{ display: block; \}/);
  assert.match(phone, /\.hero-kicker \{ align-items: flex-start;/);
  // The tour types it as before (one job), under an honest label.
  const entrance = await read('../web/entrance.js');
  assert.match(entrance, /\{ sel: '\.hero-kicker', role: 'copy', kind: 'type', wave: \d+, charMs: \d+, act: 'writing availability' \}/);
});

test('the intro says where the work happens; the scope line adds to it without repeating it', () => {
  const intro = hero.match(/<div class="hero-intro">([\s\S]*?)<\/div>/)?.[1] ?? '';
  const [lead, scope] = [...intro.matchAll(/<p[^>]*>([^<]+)<\/p>/g)].map(match => match[1]);
  assert.equal(lead, 'At ADP I build AI agents and LLM evaluation on AWS.');
  assert.ok(scope && !/AI agents|evaluation|developers|250\+|minutes/i.test(scope), `scope repeats the lead or the proof strip: ${scope}`);
});

test('"Watch it get built": an outline pill after the résumé and the links, in one order on screen and for Tab', async () => {
  const actions = hero.match(/<div class="hero-actions[^"]*">([\s\S]*?)\n {8}<\/div>/)?.[1] ?? '';
  assert.doesNotMatch(actions, /hero-buttons/, 'no wrapper: the pills are direct children');
  // DOM order = visual order at every width: résumé, LinkedIn, Email, tour pill.
  const links = [...actions.matchAll(/<a [^>]*>[\s\S]*?<\/a>/g)].map(match => match[0]);
  assert.equal(links.length, 4, 'résumé, LinkedIn, Email, tour');
  assert.match(links[0], /^<a class="pill-button" href="\.\/assets\/Cesar_Tortolero_Resume\.pdf" download/, 'the résumé comes first');
  assert.match(links[1], /linkedin\.com/);
  assert.match(links[2], /^<a href="mailto:/);
  assert.ok(actions.indexOf('class="hero-links') > actions.indexOf('Cesar_Tortolero_Resume.pdf') && actions.indexOf('class="hero-links') < actions.indexOf('data-tour-replay'), 'the links sit between the pills');
  const tour = links[3];
  assert.match(tour, /^<a class="pill-button pill-ghost hero-tour" href="\.\/lab\/build-trace\.html" data-tour-replay /, 'a real link: works without scripts');
  assert.equal(attr(tour, 'aria-label'), 'Watch it get built: the recorded agent run behind this page');
  // No "~" the accessible name would not say; the length itself is decoration (the label says it in words).
  assert.equal(plainText(tour), 'Watch it get built 55 S');
  assert.match(tour, /<span class="pill-meta" aria-hidden="true">55 S<\/span> <span class="icon icon-arrow-e" aria-hidden="true"><\/span><\/a>$/);
  assert.doesNotMatch(tour, /target=|download/);
  const styles = await read('../web/styles.css');
  // Same height as the résumé pill: 1px border in place of 1px of padding; both stretch to the column.
  assert.match(styles, /\.pill-button \{ display: inline-flex; align-items: center; gap: 12px; padding: 14px 22px;/);
  assert.match(styles, /\.pill-ghost \{ padding: 13px 21px; border: 1px solid #[0-9a-f]{6}; background: transparent; color: var\(--ink\); box-shadow: none; \}/);
  assert.match(styles, /\.hero-actions \{ justify-self: end; display: grid; justify-items: end; gap: \d+px; \}/, 'one column in DOM order');
  assert.match(styles, /\.hero-actions > \.pill-button \{ justify-self: stretch; min-height: 44px; \}/, 'both pills one width, at least 44px');
  // Nothing reorders the column or flattens it anywhere (visual order = tab order).
  assert.doesNotMatch(styles, /\.hero-buttons|\.hero-tour \{ order|\.hero-actions[^{]*\{[^}]*\border:/);
  // The replay look follows the same check as the click (bindTourButton's data-tour-mode), not :root[data-tour];
  // in link mode the length keeps its space unseen, so the pill's box never changes.
  assert.match(styles, /\.hero-tour:not\(\[data-tour-mode="replay"\]\) \.pill-meta \{ visibility: hidden; \}/);
  assert.match(styles, /\.hero-tour\[data-tour-mode="replay"\] \.icon \{ --icon: url\(/);
  assert.doesNotMatch(styles, /:root\[data-tour\] \.hero-tour/);
  // Hidden while any tour runs: no second start, and nothing for the tour to build.
  assert.match(styles, /:root\.agentic-touring \.hero-tour \{ visibility: hidden; \}/);
  const entrance = await read('../web/entrance.js');
  assert.match(entrance, /\{ sel: '\.hero-actions \.pill-button:not\(\[data-tour-replay\]\)', role: 'links', kind: 'reveal', wave: \d+, act: 'wiring résumé' \}/);
  assert.match(entrance, /\{ sel: '\.hero-links a', role: 'links', kind: 'reveal', wave: \d+, each: true, group: '\.hero-links', act: 'wiring links' \}/);
  assert.match(entrance, /const POOL_SKIP = '[^']*\[data-tour-replay\]'/);
  // A replay that throws mid-start settles the page (the hero link comes back).
  assert.match(entrance, /replay: \(\) => \{\s*try \{ startTour\(true\); \}\s*catch \{ try \{ stop\(false\); \}/);
  // app.js wires it to the same replay as the footer link, and sets the mode the CSS reads.
  const app = await read('../web/app.js');
  assert.match(app, /bindTourButton\(tourButton, \{[\s\S]*?replay: \(\) => lazy\.handle\.replay\(\),/);
  assert.match(app, /button\.dataset\.tourMode = mode;/);
  // The visible length and the spoken one agree (measured tours: 54.6 s at 1280, 51.9 s at 390).
  const seconds = tour.match(/>(\d+) S</)[1];
  assert.match(app, new RegExp(`a ${seconds}-second replay`));
});

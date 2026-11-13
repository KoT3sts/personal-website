// The side-project demos (web/projects/voicelab.html, work-helper.html,
// barking-village.html with side-demos.js, text-signals.js and side-demos.css):
// the analysis is right on known inputs, the static fallback in each page matches
// what the script would show, figures are labelled as illustrations or sample data,
// the scripts make no requests, and every sentence is sourced. Plain text, no DOM.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { analyze, flesch, format, splitSentences, syllables, words } from '../web/projects/text-signals.js';
import { BOARD_TIME, CLEAN_MINUTES, DOGS, PLAY_LABEL, autoplayRuns, focusPauses, clock, countStates, dogToday, interestsOf, parseRange, parseRoles, parseSessions, rankRoles, roomDetail, roomStates, STATE_LABEL } from '../web/projects/side-demos.js';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const SLUGS = ['voicelab', 'work-helper', 'barking-village'];
const html = Object.fromEntries(SLUGS.map(slug => [slug, read(`web/projects/${slug}.html`)]));
const scripts = { 'side-demos.js': read('web/projects/side-demos.js'), 'text-signals.js': read('web/projects/text-signals.js') };
const css = read('web/projects/side-demos.css');
const decode = text => text.replace(/&nbsp;/g, ' ').replace(/&rsquo;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
// Inline tags vanish and block tags become spaces, as in tests/case-studies.test.js.
const INLINE = /<\/?(?:strong|em|span|time|a|abbr|b|i)(?:\s[^>]*)?>/g;
const text = fragment => decode(fragment.replace(INLINE, '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
const cells = table => [...table.match(/<tbody>([\s\S]*?)<\/tbody>/)[1].matchAll(/<tr>([\s\S]*?)<\/tr>/g)]
  .map(row => [...row[1].matchAll(/<t[hd]\b[^>]*>([\s\S]*?)<\/t[hd]>/g)].map(cell => text(cell[1])));
const near = (actual, expected, digits = 6) => assert.ok(Math.abs(actual - expected) < 10 ** -digits, `${actual} ≈ ${expected}`);

test('sentences, words and syllables on known inputs', () => {
  assert.deepEqual(splitSentences('One two. Three four five! Six? '), ['One two.', 'Three four five!', 'Six?']);
  assert.deepEqual(splitSentences('She said “stop.” Then left.'), ['She said “stop.”', 'Then left.']);
  assert.deepEqual(splitSentences('A heading\n\nA line with no stop'), ['A heading', 'A line with no stop']);
  assert.deepEqual(splitSentences('  ... !  '), [], 'punctuation alone is not a sentence');
  assert.equal(splitSentences('It costs 3.50 today. Fine.').length, 2, 'a decimal point does not end a sentence');
  assert.deepEqual(words("Don't stop: well-known café, 2026."), ["Don't", 'stop', 'well-known', 'café', '2026']);
  for (const [word, count] of [['the', 1], ['cat', 1], ['make', 1], ['table', 2], ['reading', 2], ['quiet', 2], ['library', 3], ['jumped', 1], ['wanted', 2], ['everyone', 3]]) {
    assert.equal(syllables(word), count, word);
  }
});

test('Flesch reading ease is 206.835 − 1.015 × words/sentences − 84.6 × syllables/words', () => {
  near(flesch(6, 1, 6), 206.835 - 1.015 * 6 - 84.6);
  near(flesch(100, 5, 150), 206.835 - 1.015 * 20 - 84.6 * 1.5);
  assert.equal(flesch(0, 0, 0), null);
  const cat = analyze('The cat sat on the mat.');
  assert.equal(cat.sentenceCount, 1);
  assert.equal(cat.wordCount, 6);
  assert.equal(cat.syllableCount, 6);
  near(cat.flesch, 116.145);
  assert.equal(cat.band, 'very easy');
  near(cat.variety, 5 / 6);
  assert.equal(cat.longShare, 0);
});

test('word variety, long words and repeats', () => {
  const result = analyze('Signals help. Signals explain patterns. Patterns repeat, and the, the, the.');
  assert.equal(result.sentenceCount, 3);
  assert.equal(result.wordCount, 11);
  near(result.variety, 7 / 11);
  near(result.longShare, 5 / 11, 9); // signals ×2, explain, patterns ×2
  assert.deepEqual(result.repeated, [{ word: 'patterns', count: 2 }, { word: 'signals', count: 2 }], 'common words like "the" are left out');
  const empty = analyze('');
  assert.equal(empty.sentenceCount, 0);
  assert.equal(empty.flesch, null);
  assert.equal(format(empty).flesch, '–');
});

test('VoiceLab: the static values are what the script computes for the sample paragraph', () => {
  const page = html.voicelab;
  const sample = decode(page.match(/<textarea[^>]*id="vl-text"[^>]*>([\s\S]*?)<\/textarea>/)[1]);
  const result = analyze(sample);
  const shown = format(result);
  const value = name => text(page.match(new RegExp(`data-vl="${name}">([\\s\\S]*?)</(?:span|ul)>`))[1]);
  assert.equal(result.sentenceCount, 5);
  assert.equal(text(page.match(/data-vl-lengths>([^<]*)</)[1]), shown.lengths);
  assert.equal(value('avg'), shown.avg);
  assert.equal(value('variety'), shown.variety);
  assert.equal(value('distinct'), shown.distinct);
  assert.equal(value('long'), shown.long);
  assert.equal(value('flesch'), shown.flesch);
  assert.equal(value('band'), shown.band);
  assert.equal(value('repeated'), result.repeated.map(({ word, count }) => `${word} ×${count}`).join(' '));
  assert.match(page, /This experiment does not establish authorship\./);
  assert.match(page, /Flesch reading ease: 206\.835 − 1\.015 × \(words ÷ sentences\) − 84\.6 × \(syllables ÷ words\)\./, 'the formula is named on the page');
});

test('Work Helper: the sample table ranks roles by shared interests', () => {
  const table = html['work-helper'].match(/<table class="sd-table" data-wh-table>([\s\S]*?)<\/table>/)[1];
  const roles = parseRoles(cells(table));
  assert.equal(roles.length, 12);
  assert.ok(roles.every(role => role.interests.length >= 2 && role.interests.length <= 3 && role.step.endsWith('.')));
  const interests = interestsOf(roles);
  assert.deepEqual(interests.slice(0, 2), ['Data', 'Organizing'], 'the two interests picked on load');
  assert.equal(interests.length, 8);
  const ranked = rankRoles(roles, ['Data', 'Organizing']);
  assert.deepEqual(ranked.map(role => role.role), ['Data analyst', 'Content strategist', 'Customer success specialist']);
  assert.deepEqual(ranked[0].matches, ['Data', 'Organizing']);
  assert.deepEqual(rankRoles(roles, []), []);
  assert.equal(rankRoles(roles, ['Teaching', 'Health', 'Helping people'])[0].role, 'Community health educator');
  assert.match(html['work-helper'], /In development/);
  assert.match(html['work-helper'], /local onboarding prototype/);
});

test('Barking Village: the static room grid is the board at 10:45, and the dog record matches', () => {
  const page = html['barking-village'];
  const sessions = parseSessions(cells(page.match(/<table class="sd-table" data-bv-table>([\s\S]*?)<\/table>/)[1]));
  assert.equal(sessions.length, 13);
  assert.deepEqual(parseRange('09:00–10:30'), { start: 540, end: 630 });
  assert.equal(clock(BOARD_TIME), '10:45');
  assert.match(page, new RegExp(`Rooms at <time data-bv-clock>${clock(BOARD_TIME)}</time>`));
  const tiles = [...page.matchAll(/<li class="sd-room is-([a-z]+)" data-room="([^"]+)"><p class="mono sd-room-name">([^<]+)<\/p><p class="sd-room-state">([^<]+)<\/p><p class="sd-room-detail">([^<]+)<\/p>/g)];
  const rooms = tiles.map(tile => tile[2]);
  assert.deepEqual(rooms, ['Bath', 'Grooming', 'Play yard', 'Quiet room', 'Training']);
  const statuses = roomStates(sessions, rooms, BOARD_TIME);
  statuses.forEach((status, i) => {
    const [, state, room, name, label, detail] = tiles[i];
    assert.equal(name, room);
    assert.equal(state, status.state, room);
    assert.equal(label, STATE_LABEL[status.state], room);
    assert.equal(decode(detail), roomDetail(status), room);
  });
  assert.deepEqual(countStates(statuses), { session: 2, cleaning: 2, free: 1 }, 'every state shows at 10:45');
  // No room or dog is in two places at once, and cleaning fits before the room's next session.
  for (const key of ['room', 'dog']) {
    const by = Object.groupBy(sessions, session => session[key]);
    for (const list of Object.values(by)) {
      list.sort((a, b) => a.start - b.start);
      for (let i = 1; i < list.length; i++) {
        assert.ok(list[i].start >= list[i - 1].end + (key === 'room' ? CLEAN_MINUTES : 0), `${key} ${list[i].dog} ${clock(list[i].start)}`);
      }
    }
  }
  assert.ok(sessions.every(session => session.end - session.start >= 60), 'sessions are an hour or more, so their buttons stay 44px wide on phones');
  const card = page.match(/<div class="sd-dog" data-bv-dog[\s\S]*?<\/dl>/)[0];
  const dog = text(card.match(/data-bv-dog-name>([^<]+)</)[1]);
  assert.equal(text(card.match(/data-bv-dog-breed>([^<]+)</)[1]), DOGS[dog].breed);
  assert.equal(text(card.match(/data-bv-dog-note>([^<]+)</)[1]), DOGS[dog].note);
  assert.deepEqual([...card.match(/data-bv-dog-today>([\s\S]*?)<\/ul>/)[1].matchAll(/<li>([^<]+)<\/li>/g)].map(m => m[1]), dogToday(sessions, dog));
  assert.ok(Object.keys(DOGS).every(name => sessions.some(session => session.dog === name)), 'every dog has a record and a session');
  assert.match(page, /No customer or operational data is shown\./);
});

test('every demo is a figure whose caption starts with "Illustration" or "Sample data"', () => {
  for (const slug of SLUGS) {
    const main = html[slug].match(/<main[^>]*>([\s\S]*?)<\/main>/)[1];
    const figures = [...main.matchAll(/<figure class="([^"]*)"[^>]*>([\s\S]*?)<\/figure>/g)].filter(match => !match[1].includes('cs-cover'));
    assert.ok(figures.length >= 1, `${slug} has a demo`);
    for (const [, cls, body] of figures) {
      const caption = text(body.match(/<figcaption[^>]*>([\s\S]*?)<\/figcaption>/)?.[1] ?? '');
      assert.match(caption, /^(?:Illustration|Sample data):/, `${slug} ${cls}: "${caption.slice(0, 40)}"`);
    }
  }
  assert.ok(/Illustration:/.test(html.voicelab) && /Sample data/.test(html.voicelab));
  assert.ok(/Illustration:/.test(html['work-helper']) && /Sample data/.test(html['work-helper']));
});

test('one module script, the strict CSP, labelled controls and polite live regions', () => {
  for (const slug of SLUGS) {
    const page = html[slug];
    const csp = page.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)">/)?.[1];
    assert.ok(csp, `${slug} has a CSP`);
    assert.match(csp, /(?:^|; )script-src 'self'(?:;|$)/, `${slug}: script-src 'self' only`);
    assert.match(csp, /style-src 'self'(?:;|$)/);
    assert.match(csp, /connect-src 'self'/);
    assert.ok(page.indexOf('Content-Security-Policy') < page.indexOf('<script'), `${slug}: CSP before scripts`);
    const scriptTags = [...page.matchAll(/<script\b[^>]*>/g)].map(match => match[0]).filter(tag => !tag.includes('application/ld+json'));
    assert.deepEqual(scriptTags, ['<script type="module" src="./side-demos.js">', '<script type="module" src="../count.js">'], `${slug}: its own module and the page counter`);
    assert.match(page, /<link rel="stylesheet" href="\.\/side-demos\.css">/);
    assert.doesNotMatch(page, /\sstyle="|\son[a-z]+="/, `${slug}: no style attributes or inline handlers`);
    assert.match(page, /aria-live="polite"|data-wh-ui|data-bv-controls/, `${slug}: results are announced`);
    assert.doesNotMatch(page, /aria-live="assertive"/);
  }
  // Every form control in the markup has a label pointing at it.
  for (const slug of SLUGS) {
    for (const [, id] of html[slug].matchAll(/<(?:textarea|input|select)\b[^>]*\bid="([^"]+)"/g)) {
      assert.match(html[slug], new RegExp(`<label\\b[^>]*\\bfor="${id}"`), `${slug}: #${id} has a label`);
    }
  }
  // Live regions anywhere (markup or script) are polite, never assertive.
  for (const source of [...Object.values(html), scripts['side-demos.js']]) {
    for (const [, value] of source.matchAll(/aria-live["']?\s*[:=]\s*["']([a-z]+)["']/g)) assert.equal(value, 'polite');
  }
});

test('Barking Village autoplay: runs only when wanted, on screen and visible; focus on a control pauses it', () => {
  assert.equal(PLAY_LABEL, 'Play the day', 'the toggle keeps one name; aria-pressed carries the state');
  assert.equal(autoplayRuns({ wanted: true, visible: true, hidden: false }), true);
  for (const state of [{ wanted: false, visible: true, hidden: false }, { wanted: true, visible: false, hidden: false }, { wanted: true, visible: true, hidden: true }]) {
    assert.equal(autoplayRuns(state), false, JSON.stringify(state));
  }
  const icon = {};
  const play = { contains: node => node === play || node === icon };
  const slider = {};
  assert.equal(focusPauses(slider, play), true, 'focusing the slider or a session pauses the day');
  assert.equal(focusPauses(play, play), false, 'focusing the play button does not');
  assert.equal(focusPauses(icon, play), false, 'nor does focus inside it');
  assert.equal(focusPauses(null, play), false);
});

test('the demo scripts make no requests, store nothing and build no HTML from strings', () => {
  for (const [name, source] of Object.entries(scripts)) {
    const code = source.replace(/\/\/.*$/gm, '');
    assert.doesNotMatch(code, /\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon|importScripts|Worker)\b/, `${name}: no network APIs`);
    assert.doesNotMatch(code, /\bimport\s*\(/, `${name}: no dynamic import`);
    assert.doesNotMatch(code, /localStorage|sessionStorage|indexedDB|document\.cookie/, `${name}: stores nothing`);
    assert.doesNotMatch(code, /innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\(|new Function/, `${name}: no HTML sinks`);
    assert.doesNotMatch(code, /setAttribute\(\s*['"]style['"]|\.style\.(?!setProperty)[a-z]/i, `${name}: styles only through custom properties`);
  }
  assert.deepEqual([...scripts['side-demos.js'].matchAll(/^import .* from '([^']+)';$/gm)].map(match => match[1]), ['./text-signals.js']);
  assert.doesNotMatch(scripts['text-signals.js'], /^import /m, 'the analysis has no dependencies');
});

test('side-demos.css: readable sizes, reduced motion, print and no remote resources', () => {
  for (const size of css.matchAll(/font(?:-size)?:[^;]*?([\d.]+)px/g)) assert.ok(Number(size[1]) >= 11, size[0]);
  const motion = css.match(/@media \(prefers-reduced-motion: no-preference\) \{([\s\S]*?)\n\}/)[1];
  // Every animation and transition sits inside the no-preference block (keyframes are inert on their own).
  const outside = css.replace(/@media \(prefers-reduced-motion: no-preference\) \{[\s\S]*?\n\}/, '').replace(/@media \(max-width: 560px\) and \(prefers-reduced-motion: no-preference\) \{[\s\S]*?\n\}/, '');
  assert.doesNotMatch(outside, /\banimation(?:-name)?:|\btransition:/, 'motion only when welcome');
  assert.match(motion, /animation/);
  assert.match(css, /@media print \{/);
  assert.match(css, /min-height: 44px/);
  assert.doesNotMatch(css, /(?:@import|url\()/, 'no imports or remote resources');
});

test('docs/case-study-facts-side.json: every entry is on its page, and every sentence on the three pages is sourced', () => {
  const file = JSON.parse(read('docs/case-study-facts-side.json'));
  const main = JSON.parse(read('docs/case-study-facts.json')).facts;
  const norm = value => value.toLowerCase().replace(/[’]/g, "'").replace(/\s+/g, ' ').trim();
  const clean = value => norm(value).replace(/[.:?]$/, '');
  const plain = text;
  const homepage = norm(plain(read('web/index.html').replace(/<script[\s\S]*?<\/script>/g, ' ')));
  assert.deepEqual(Object.keys(file.sources).sort(), ['homepage', 'method']);
  const seen = new Set();
  for (const fact of file.facts) {
    const where = `${fact.page}: "${fact.sentence.slice(0, 60)}"`;
    assert.ok(SLUGS.includes(fact.page), where);
    assert.ok(['homepage', 'method'].includes(fact.source), `${where}: source`);
    assert.ok(['verbatim', 'reworded'].includes(fact.wording), `${where}: wording`);
    assert.equal(fact.status, 'approved', where);
    assert.ok(Array.isArray(fact.quote) && fact.quote.length && fact.quote.every(quote => typeof quote === 'string' && quote.trim()), `${where}: quote`);
    assert.ok(!seen.has(`${fact.page}|${clean(fact.sentence)}`), `${where} is listed once`);
    seen.add(`${fact.page}|${clean(fact.sentence)}`);
    assert.ok(!main.some(other => other.page === fact.page && clean(other.sentence) === clean(fact.sentence)), `${where} is not also in docs/case-study-facts.json`);
    const page = norm(plain(html[fact.page].match(/<main[^>]*>([\s\S]*?)<\/main>/)[1]));
    assert.ok(page.includes(clean(fact.sentence)), `${where} is on its page`);
    if (fact.source === 'homepage') for (const quote of fact.quote) assert.ok(homepage.includes(clean(quote)), `${where}: "${quote}" is on the homepage`);
  }
  // The same sentence split as tests/case-studies.test.js.
  for (const slug of SLUGS) {
    const listed = [...main, ...file.facts].filter(fact => fact.page === slug).map(fact => clean(fact.sentence));
    const body = html[slug].match(/<main[^>]*>([\s\S]*?)<\/main>/)[1]
      .replace(/<h[12][^>]*>[\s\S]*?<\/h[12]>/g, '').replace(/<dt[^>]*>[\s\S]*?<\/dt>/g, '')
      .replace(/<p class="mono cs-flow-label">([^<]*)<\/p>/g, '').replace(/<dd class="mono">\d\d \/ 06<\/dd>/g, '');
    const sentences = body.replace(/<\/(?:p|li|dd|figcaption)>/g, '\n').split('\n').map(plain).filter(Boolean).flatMap(line => line.split(/(?<=[.!?])\s+/));
    for (const sentence of sentences) {
      const value = clean(sentence);
      assert.ok(homepage.includes(value) || listed.some(fact => fact.includes(value)), `${slug}: "${sentence}" has no source`);
    }
  }
});

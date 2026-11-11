// Approach accordion (SPECIFICATION V08): markup and stylesheet contracts,
// read as text so the suite runs without a DOM.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../web/index.html', import.meta.url), 'utf8');
const css = await readFile(new URL('../web/accordion.css', import.meta.url), 'utf8');
const styles = await readFile(new URL('../web/styles.css', import.meta.url), 'utf8');

const section = (/<section id="approach"[\s\S]*?<\/section>/.exec(html) || [''])[0];
const rows = section.match(/<details\b[\s\S]*?<\/details>/g) || [];
const openTag = (/<section id="approach"[^>]*>/.exec(section) || [''])[0];
const strip = text => text.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

test('the approach section is a light scene, so the header turns light over it', () => {
  assert.ok(section, 'section#approach exists');
  assert.match(openTag, /class="approach"/);
  assert.doesNotMatch(openTag, /dark-section/);
  assert.match(openTag, /aria-labelledby="approach-title"/);
  assert.match(section, /<h2 id="approach-title">MAKE IT WORK\. <br><span>MAKE IT MATTER\.<\/span><\/h2>/);
});

test('three native disclosures form one exclusive group with the first row open', () => {
  assert.equal(rows.length, 3);
  rows.forEach(row => assert.match(row, /^<details name="approach"/, 'shared name: one row open at a time'));
  assert.match(rows[0], /^<details name="approach" open>/);
  rows.slice(1).forEach(row => assert.doesNotMatch(row, /^<details[^>]*\bopen\b/));
  rows.forEach(row => assert.match(row, /^<details[^>]*><summary>/, 'summary is the first child'));
});

test('row titles and body copy carry one real example each', () => {
  const titles = rows.map(row => strip((/<summary>(?:<span[^>]*>[\s\S]*?<\/span>)(<span>[\s\S]*?<\/span>)/.exec(row) || [])[1] || ''));
  assert.deepEqual(titles, ['Start with the question.', 'Build something tangible.', 'Stay curious. Keep refining.']);
  const bodies = rows.map(row => strip((/<\/summary><p>([\s\S]*?)<\/p>/.exec(row) || [])[1] || ''));
  assert.deepEqual(bodies, [
    'Watch how the work gets done today before adding a feature. Checking firewall rules across our 24 AWS accounts took a developer about a day of manual testing, one account at a time. Asking why led to a diagnostics app that runs the same checks from one screen in minutes.',
    'A working version makes an idea easier to question. The first firewall checker was a small local app, rough but real. Using it showed which checks mattered, and those became a serverless API that tests accounts in parallel with bounded retries.',
    'The details are part of the work. Each of the 18+ workshops showed where developers got stuck, such as missing secrets, access groups and network rules, and the onboarding guide changed to match. It has been revised more than 40 times.',
  ]);
});

test('build-tour selectors keep matching: number, title as the 2nd span, body as the only direct <p>', () => {
  assert.match(section, /<div class="approach-heading"><h2 id="approach-title">[\s\S]*?<\/h2><p>/, '.approach-heading > p');
  assert.match(section, /<div class="approach-list">\s*<details/, '.approach-list > details');
  rows.forEach(row => {
    assert.match(row, /<summary><span class="mono approach-number">0\d<\/span><span>[^<]+<\/span><span class="details-icon" aria-hidden="true"><\/span><\/summary>/);
    const direct = row.replace(/<summary>[\s\S]*?<\/summary>/, '').replace(/<div class="approach-row-foot">[\s\S]*?<\/div>/, '');
    assert.equal((direct.match(/<p>/g) || []).length, 1, ':scope > p is the body copy');
  });
});

test('each open panel has a compact focus line and a small link to an existing anchor', () => {
  const expected = [['#experience', 'See the experience'], ['#work', 'See the work'], ['#contact', 'Say hello']];
  rows.forEach((row, index) => {
    const foot = (/<div class="approach-row-foot">([\s\S]*?)<\/div>/.exec(row) || [])[1] || '';
    assert.match(foot, /<ul class="approach-focus mono" aria-label="In practice">(<li>[^<]+<\/li>){3}<\/ul>/);
    const [, href, label] = /<a class="approach-link mono" href="([^"]+)">([^<]+?) <span class="icon icon-arrow-[ns]" aria-hidden="true"><\/span><\/a>/.exec(foot) || [];
    assert.deepEqual([href, label], expected[index]);
    assert.match(html, new RegExp(`id="${href.slice(1)}"`), `${href} exists`);
  });
});

test('the focus lines only restate the row copy (no new claims)', () => {
  rows.forEach(row => {
    const body = strip((/<\/summary><p>([\s\S]*?)<\/p>/.exec(row) || [])[1]).toLowerCase();
    const items = [...row.matchAll(/<li>([^<]+)<\/li>/g)].map(match => match[1].toLowerCase());
    items.forEach(item => {
      const words = item.replace(/^(the|a) /, '').split(' ').filter(word => word.length > 3);
      words.forEach(word => assert.ok(body.includes(word.slice(0, 5)), `"${item}" comes from the row copy`));
    });
  });
});

test('accordion styles: animated height with a no-animation path, reduced motion and visible focus', () => {
  assert.match(css, /interpolate-size:\s*allow-keywords/);
  assert.match(css, /@supports selector\(::details-content\)/);
  assert.match(css, /::details-content\s*\{[^}]*block-size:\s*0[^}]*content-visibility[^}]*allow-discrete/);
  assert.match(css, /details\[open\]::details-content\s*\{\s*block-size:\s*auto/);
  assert.match(css, /prefers-reduced-motion:\s*reduce\)\s*\{[^}]*::details-content\s*\{\s*transition:\s*none/);
  assert.match(css, /details:has\(> summary:focus-visible\)\s*\{\s*outline:\s*2px solid/);
  assert.match(css, /\.approach-link:focus-visible\s*\{\s*outline:/);
  assert.match(css, /summary::-webkit-details-marker\s*\{\s*display:\s*none/);
  // The panel and its fade live on ::before so nothing collides with the
  // section reveal or build-tour transitions on `details` itself.
  assert.doesNotMatch(css, /\.approach-list details\s*\{[^}]*transition/);
});

test('the old dark approach rules are gone from styles.css', () => {
  assert.doesNotMatch(styles, /\.approach-list/);
  assert.doesNotMatch(styles, /\.approach \{/);
  assert.doesNotMatch(styles, /\.details-icon/);
});

// app.js loads the build tour (entrance.js) only when it will play.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { entranceWillPlay } from '../web/app.js';
import { shouldPlayEntrance } from '../web/entrance.js';

const read = path => readFile(new URL(`../web/${path}`, import.meta.url), 'utf8');
const staticImports = source => [...source.matchAll(/^\s*import\s[^;]*?from\s+['"](\.\/[^'"]+)['"]/gm)].map(match => match[1].slice(2));

test('entranceWillPlay matches shouldPlayEntrance with everyVisit (seen ignored)', () => {
  for (const reducedMotion of [false, true]) {
    for (const storageAvailable of [false, true]) {
      for (const hash of ['', '#home', '#work', '#contact']) {
        for (const navigationType of [undefined, 'navigate', 'reload', 'back_forward', 'prerender']) {
          const input = { reducedMotion, storageAvailable, hash, navigationType };
          assert.equal(entranceWillPlay(input), shouldPlayEntrance({ ...input, seen: false }), JSON.stringify(input));
        }
      }
    }
  }
});

test('app.js imports entrance.js only dynamically', async () => {
  const app = await read('app.js');
  assert.ok(!staticImports(app).includes('entrance.js'));
  assert.match(app, /'\.\/entrance\.js'/);
  assert.match(app, /import\(url\)/);
  assert.match(app, /everyVisit: true/);
});

// Deep links and reduced motion must not download the 177 KB tour script.
test('the static module graph from app.js does not include entrance.js', async () => {
  const seen = new Set();
  const visit = async file => {
    if (seen.has(file)) return;
    seen.add(file);
    for (const next of staticImports(await read(file))) await visit(next);
  };
  await visit('app.js');
  assert.ok(!seen.has('entrance.js'), `entrance.js is pulled in statically via: ${[...seen].join(' -> ')}`);
});

test('the head script records the tour decision that app.js follows', async () => {
  const html = await read('index.html');
  assert.match(html, /root\.dataset\.tour = play \? 'play' : 'skip'/);
  const app = await read('app.js');
  assert.match(app, /document\.documentElement\.dataset\.tour/);
});

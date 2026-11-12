// app.js loads the build tour (entrance.js) only when it will play: on a first
// visit, or when the visitor asks for a replay.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { entranceWillPlay, bindTourButton, lazyEntrance, TOUR_BUTTON_LABELS } from '../web/app.js';
import { shouldPlayEntrance } from '../web/entrance.js';

const read = path => readFile(new URL(`../web/${path}`, import.meta.url), 'utf8');
const staticImports = source => [...source.matchAll(/^\s*import\s[^;]*?from\s+['"](\.\/[^'"]+)['"]/gm)].map(match => match[1].slice(2));

const combos = function* () {
  for (const seen of [false, true]) {
    for (const reducedMotion of [false, true]) {
      for (const storageAvailable of [false, true]) {
        for (const hash of ['', '#home', '#work', '#contact']) {
          for (const navigationType of [undefined, 'navigate', 'reload', 'back_forward', 'prerender']) {
            yield { seen, reducedMotion, storageAvailable, hash, navigationType };
          }
        }
      }
    }
  }
};

test('entranceWillPlay matches shouldPlayEntrance: first visit only (the seen flag decides)', () => {
  for (const input of combos()) assert.equal(entranceWillPlay(input), shouldPlayEntrance(input), JSON.stringify(input));
  const first = { seen: false, reducedMotion: false, storageAvailable: true, hash: '', navigationType: 'navigate' };
  assert.equal(entranceWillPlay(first), true);
  assert.equal(entranceWillPlay({ ...first, seen: true }), false, 'returning visits get no tour');
  assert.equal(entranceWillPlay({ ...first, seen: true, navigationType: 'reload' }), false, 'nor do reloads');
});

// The inline <head> script runs before any module: run it against stand-ins for
// each combination and compare its decision with entrance.js.
const KEY = 'cesar:portfolio:agentic-intro:v1';
function runHeadScript(source, { seen, reducedMotion, storageAvailable, hash, navigationType }) {
  const store = new Map(seen ? [[KEY, 'seen']] : []);
  const guard = () => { if (!storageAvailable) throw new Error('Storage denied'); };
  const localStorage = {
    getItem: key => { guard(); return store.has(key) ? store.get(key) : null; },
    setItem: (key, value) => { guard(); store.set(key, String(value)); },
    removeItem: key => { guard(); store.delete(key); },
  };
  const classes = new Set();
  const appended = [];
  const root = { dataset: {}, classList: { add: name => classes.add(name) } };
  const document = { documentElement: root, createElement: () => ({}), head: { append: node => appended.push(node) } };
  const performance = { getEntriesByType: () => (navigationType ? [{ type: navigationType }] : []) };
  const timers = [];
  const setTimeout = (callback, ms) => timers.push({ callback, ms });
  new Function('document', 'localStorage', 'matchMedia', 'location', 'performance', 'setTimeout', source)(
    document, localStorage, () => ({ matches: reducedMotion }), { hash }, performance, setTimeout);
  const restoring = 'restoring' in root.dataset;
  timers.forEach(timer => timer.callback());
  return { tour: root.dataset.tour, pending: classes.has('agentic-pending'), preload: appended.map(node => node.href), stored: [...store.keys()], restoring, cleared: !('restoring' in root.dataset), waits: timers.map(timer => timer.ms) };
}

test('the inline head script mirrors shouldPlayEntrance exactly, reading the same seen flag', async () => {
  const html = await read('index.html');
  const scripts = [...html.matchAll(/<script(?![^>]*\bsrc=)(?![^>]*type="application\/ld\+json")[^>]*>([\s\S]*?)<\/script>/g)].map(match => match[1]);
  assert.equal(scripts.length, 1, 'one inline script (its hash is in the CSP)');
  const [source] = scripts;
  for (const input of combos()) {
    const result = runHeadScript(source, input);
    const play = shouldPlayEntrance(input);
    assert.equal(result.tour, play ? 'play' : 'skip', JSON.stringify(input));
    assert.equal(result.pending, play, `${JSON.stringify(input)}: black cover only when it plays`);
    assert.deepEqual(result.preload, play ? ['./entrance.js'] : [], JSON.stringify(input));
    // The probe leaves nothing behind; the flag itself is entrance.js's to write.
    assert.deepEqual(result.stored, input.seen ? [KEY] : [], JSON.stringify(input));
    // A reload or back/forward stays hidden until app.js has laid the page out (1.5 s at most).
    const restores = !play && (input.navigationType === 'reload' || input.navigationType === 'back_forward');
    assert.equal(result.restoring, restores, `${JSON.stringify(input)}: hidden only while a restored scroll position waits for app.js`);
    assert.deepEqual(result.waits, restores ? [1500] : [], JSON.stringify(input));
    assert.equal(result.cleared, true, `${JSON.stringify(input)}: never hidden for good`);
  }
  const styles = await read('styles.css');
  assert.match(styles, /html\[data-restoring\] body \{ visibility: hidden; \}/);
  const appSource = await read('app.js');
  assert.match(appSource, /bootEntrance\(document, window\);\n[^\n]*\n  delete document\.documentElement\.dataset\.restoring;/, 'app.js shows the page once it is laid out');
  // One key everywhere: entrance.js writes it, app.js and the head script read it.
  const entrance = await read('entrance.js');
  const app = await read('app.js');
  assert.equal(entrance.match(/const VISIT_KEY = '([^']+)';/)?.[1], KEY);
  assert.equal(app.match(/const ENTRANCE_SEEN_KEY = '([^']+)';/)?.[1], KEY);
  assert.match(source, new RegExp(`const key = '${KEY}';`));
});

test('the hero tour link replays the tour on a plain click with motion allowed, and is a link otherwise', () => {
  const make = () => {
    const listeners = {};
    const attributes = {};
    return {
      dataset: {},
      listeners,
      attributes,
      addEventListener: (type, fn) => { listeners[type] = fn; },
      setAttribute: (name, value) => { attributes[name] = value; },
    };
  };
  const media = (matches) => {
    const handlers = [];
    return { matches, addEventListener: (type, fn) => handlers.push(fn), fire(next) { this.matches = next; handlers.forEach(fn => fn()); } };
  };
  const click = (extra = {}) => {
    const event = { button: 0, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, ...extra };
    return event;
  };
  // Motion allowed: a plain click replays and stays on the page.
  let replays = 0;
  let touring = false;
  const motion = media(false);
  const button = make();
  bindTourButton(button, { media: motion, replay: () => { replays++; }, touring: () => touring });
  assert.equal(button.dataset.tourMode, 'replay');
  assert.equal(button.attributes['aria-label'], TOUR_BUTTON_LABELS.replay);
  let event = click();
  button.listeners.click(event);
  assert.equal(event.defaultPrevented, true);
  assert.equal(replays, 1);
  // Already touring (the link is hidden then): no second start.
  touring = true;
  event = click();
  button.listeners.click(event);
  assert.equal(event.defaultPrevented, true);
  assert.equal(replays, 1);
  touring = false;
  // New tab / window and other buttons keep the link's own behaviour.
  for (const extra of [{ metaKey: true }, { ctrlKey: true }, { shiftKey: true }, { altKey: true }, { button: 1 }]) {
    event = click(extra);
    button.listeners.click(event);
    assert.equal(event.defaultPrevented, false, JSON.stringify(extra));
  }
  assert.equal(replays, 1);
  // Reduced motion (also switched on later): the static recorded run.
  motion.fire(true);
  assert.equal(button.dataset.tourMode, 'link');
  assert.equal(button.attributes['aria-label'], TOUR_BUTTON_LABELS.link);
  event = click();
  button.listeners.click(event);
  assert.equal(event.defaultPrevented, false);
  assert.equal(replays, 1);
  // The accessible name starts with the visible label (WCAG 2.5.3) and says what happens.
  for (const label of Object.values(TOUR_BUTTON_LABELS)) assert.match(label, /^Watch it get built: /);
  assert.match(TOUR_BUTTON_LABELS.replay, /55-second replay/);
});

test('if the tour script cannot load, the hero tour link falls back to the recorded run', async () => {
  const listeners = {};
  const button = { dataset: {}, addEventListener: (type, fn) => { listeners[type] = fn; }, setAttribute() {} };
  let fellBack = 0;
  bindTourButton(button, { media: { matches: false }, replay: () => Promise.resolve(false), touring: () => false, fallback: () => { fellBack++; } });
  const event = { button: 0, preventDefault() { this.defaultPrevented = true; } };
  listeners.click(event);
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(fellBack, 1);
});

// First visit, hero link activated while entrance.js is still arriving (a screen
// reader's click sends no pointerdown or keydown first): the boot and the replay
// wait on the same import. Only one entrance may start, and its first-visit tour
// is not replayed on top of itself.
test('a hero-link replay during the first-visit load starts one entrance and one tour', async () => {
  let resolveLoad;
  const pending = new Promise(resolve => { resolveLoad = resolve; });
  let loads = 0;
  const load = () => { loads++; return pending; };
  const document = { activeElement: null, querySelector: () => null };
  const window = { matchMedia: () => ({ matches: false, addEventListener() {} }) };
  let inits = 0;
  let replays = 0;
  const real = { touring: false, replay() { replays++; this.touring = true; }, whenTourEnds() {} };
  const module = { initAgenticEntrance() { inits++; real.touring = true; return real; } };
  const lazy = lazyEntrance(document, window, load);
  // app.js's bootEntrance: loadEntrance().then(module => lazy.start(module)).
  const boot = pending.then(m => lazy.start(m));
  const replayed = lazy.handle.replay();
  assert.equal(lazy.handle.replay(), replayed, 'a second click while loading shares the wait');
  resolveLoad(module);
  await Promise.all([boot, replayed]);
  assert.equal(inits, 1, 'initAgenticEntrance runs once');
  assert.equal(replays, 0, 'the first-visit tour is already running: no second tour on top');
  assert.equal(loads, 1);
  assert.equal(lazy.start(module), real, 'start() is idempotent');
  assert.equal(lazy.handle.touring, true);
  // The other order (replay settles first, not yet touring): exactly one replay, still one init.
  let resolveLate;
  const late = new Promise(resolve => { resolveLate = resolve; });
  const idle = { touring: false, replay() { replays++; this.touring = true; }, whenTourEnds() {} };
  let lateInits = 0;
  const lazy2 = lazyEntrance(document, window, () => late);
  const replayed2 = lazy2.handle.replay();
  const boot2 = late.then(m => lazy2.start(m));
  resolveLate({ initAgenticEntrance() { lateInits++; return idle; } });
  await Promise.all([replayed2, boot2]);
  assert.equal(lateInits, 1);
  assert.equal(replays, 1);
});

test('app.js imports entrance.js only dynamically', async () => {
  const app = await read('app.js');
  assert.ok(!staticImports(app).includes('entrance.js'));
  assert.match(app, /'\.\/entrance\.js'/);
  assert.match(app, /import\(url\)/);
  // First visit only: app.js no longer asks entrance.js to play on every load.
  assert.doesNotMatch(app, /everyVisit/);
});

// Repeat visits, deep links and reduced motion must not download the tour script (about 265 KB).
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

// Reading floor and touch targets (styles.css, about-scenes.css, experience.css,
// explorer.css, home-charts.css and the lab pages), checked as text.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const files = ['web/styles.css', 'web/about-scenes.css', 'web/experience.css', 'web/explorer.css', 'web/accordion.css', 'web/project.css', 'web/404.css', 'web/lab/lab.css', 'web/lab/build-trace.css', 'web/lab/evaluating-agents.css', 'web/home-charts.css'];
const sheets = Object.fromEntries(files.map(file => [file, read(file)]));
const styles = sheets['web/styles.css'];

test('three reading tokens: 15-16px body, labels never under 11px, pills and nav never under 12px', () => {
  assert.match(styles, /--text-body: clamp\(15px, [^;]+, 16px\);/);
  assert.match(styles, /--text-label: clamp\(11px, [^;]+, 12px\);/);
  assert.match(styles, /--text-pill: clamp\(12px, [^;]+, 13px\);/);
});

test('no fixed font size under 11px in the owned stylesheets, the wordmark lockup included', () => {
  for (const [file, css] of Object.entries(sheets)) {
    for (const match of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const [, selector, body] = match;
      for (const size of body.matchAll(/font-size: ([\d.]+)px/g)) {
        assert.ok(Number(size[1]) >= 11, `${file}: ${selector.trim()} ${size[0]}`);
      }
    }
  }
});

test('body copy and labels use the tokens', () => {
  const scenes = sheets['web/about-scenes.css'];
  assert.match(scenes, /\.cinematic-copy p \{[^}]*font-size: var\(--text-body\)/);
  for (const sel of ['.cinematic-caption', '.about-transition-foot', '.about-panel-index', '.cinematic-topline']) {
    assert.match(scenes, new RegExp(`\\${sel} \\{[^}]*font-size: var\\(--text-label\\)`), sel);
  }
  assert.match(scenes, /\.scene-pill \{[^}]*font-size: var\(--text-pill\)/);
  assert.match(styles, /\.work-heading > p, \.experience-heading > p, \.capabilities-heading > p \{ font-size: var\(--text-body\)/);
  assert.match(styles, /\.main-nav a \{[^}]*font-size: var\(--text-pill\)/);
  for (const sel of ['.footer-bottom', '.work-end', '.hero-rule']) assert.match(styles, new RegExp(`\\${sel} \\{[^}]*font-size: var\\(--text-label\\)`), sel);
});

test('small text links get a 44px hit area without changing their look', () => {
  assert.match(styles, /:is\(\.main-nav a, \.hero-links a, \.contact-links a, \.work-end a, \.section-top a, \.footer-trace\)::before \{ content: ""; position: absolute; top: calc\(50% - 22px\); bottom: calc\(50% - 22px\); left: min\(0px, calc\(50% - 22px\)\); right: min\(0px, calc\(50% - 22px\)\); \}/);
});

test('the ABOUT ME panel keeps its highlight dim enough for 4.5:1 text', () => {
  const scenes = sheets['web/about-scenes.css'];
  const lum = hex => {
    const [r, g, b] = [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const ratio = (a, b) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);
  const highlights = [...scenes.matchAll(/radial-gradient\(ellipse at 110% 0%, #([0-9a-f]{6})/g)].map(match => match[1]);
  assert.equal(highlights.length, 2, 'the panel and the opening window');
  const index = /\.about-panel-index \{[^}]*color: #([0-9a-f]{6})/.exec(scenes)[1];
  for (const highlight of highlights) {
    assert.ok(ratio('eeede8', highlight) >= 4.5, `title on ${highlight}`);
    assert.ok(ratio(index, highlight) >= 4.5, `index on ${highlight}`);
  }
});

test('the skills title is sized so EDUCATION. keeps its period', () => {
  // EDUCATION. is about 5.5em wide; the left column is about 27% of the viewport (36px gap from 761 to 1100).
  assert.match(styles, /\.skills-layout h2 \{ font-size: clamp\(36px, 4\.8vw, 92px\);/);
});

test('the closing note sets "making." in the real Archivo Italic, not Georgia or a faked slant', () => {
  const html = read('web/index.html');
  assert.doesNotMatch(styles, /\.closing-note em \{[^}]*Georgia/);
  assert.match(styles, /@font-face \{ font-family: "Archivo Note"; font-style: italic;[^}]*url\("\.\/assets\/fonts\/archivo-italic-note\.woff2"\)[^}]*unicode-range: U\+002E, U\+0061, U\+0067, U\+0069, U\+006B, U\+006D-006E; \}/);
  assert.match(styles, /\.closing-note em \{ font-family: "Archivo Note",[^}]*font-style: italic;/);
  // The subset only holds these glyphs, so the note must not change without refetching it.
  assert.match(html, /Still <em>making\.<\/em>/);
  const font = readFileSync(new URL('../web/assets/fonts/archivo-italic-note.woff2', import.meta.url));
  assert.equal(font.subarray(0, 4).toString('latin1'), 'wOF2');
});

// ---- Round 7 ----

const lum = hex => {
  const [r, g, b] = [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);
// Source-over blend of `top` at `alpha` onto `base` (hex strings, no #).
const blend = (base, top, alpha) => [0, 2, 4].map(i => Math.round(parseInt(base.slice(i, i + 2), 16) * (1 - alpha) + parseInt(top.slice(i, i + 2), 16) * alpha).toString(16).padStart(2, '0')).join('');
const pages = ['web/index.html', 'web/404.html', ...['agent-workflow', 'barking-village', 'companion-chatbot', 'thoughts-to-text', 'voicelab', 'work-helper'].map(slug => `web/projects/${slug}.html`), ...['sentiment-eval', 'build-trace', 'evaluating-agents'].map(slug => `web/lab/${slug}.html`)];

test('a <br> line break never joins two words for screen readers: a space sits on one side', () => {
  let breaks = 0;
  for (const page of pages) {
    const html = read(page).replace(/<!--[\s\S]*?-->/g, '');
    for (const match of html.matchAll(/<br\s*\/?>/g)) {
      breaks++;
      const before = html[match.index - 1];
      const after = html[match.index + match[0].length];
      assert.ok(/\s/.test(before) || /\s/.test(after), `${page}: "${html.slice(match.index - 24, match.index + 20)}"`);
    }
  }
  assert.ok(breaks >= 8, `${breaks} line breaks checked`);
  assert.match(read('web/index.html'), /<h2 id="about-title">ABOUT <br>ME<\/h2>/);
});

test('over dark sections the nav pill takes a dark tone, with 4.5:1 text and active state', () => {
  const bar = /\.site-header\.is-dark::before \{ background: rgb\(16 17 20 \/ \.985\);/.test(styles) ? '101114' : null;
  assert.ok(bar, 'the dark header bar');
  const fill = /\.site-header\.is-dark \.main-nav \{ background: rgb\(238 237 232 \/ (\.\d+)\);/.exec(styles);
  const text = /\.site-header\.is-dark \.main-nav a \{ color: #([0-9a-f]{6}); \}/.exec(styles);
  const active = /\.site-header\.is-dark \.main-nav a\[aria-current\] \{ color: var\(--paper\); background: rgb\(238 237 232 \/ (\.\d+)\);/.exec(styles);
  assert.ok(fill && text && active, 'dark pill, link and active rules');
  const pill = blend(bar, 'eeede8', Number(fill[1]));
  const chip = blend(pill, 'eeede8', Number(active[1]));
  assert.ok(contrast(text[1], pill) >= 4.5, `links ${contrast(text[1], pill).toFixed(2)}:1`);
  assert.ok(contrast('eeede8', chip) >= 4.5, `active ${contrast('eeede8', chip).toFixed(2)}:1`);
  assert.ok(contrast(text[1], chip) < contrast('eeede8', chip), 'the active link stands out');
});

test('arrows are drawn icons, not font glyphs: aria-hidden, defined and sized in em', () => {
  const css = { 'web/index.html': styles, 'web/404.html': '', default: sheets['web/project.css'] };
  for (const page of pages) {
    const html = read(page);
    const visible = html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<(?:meta|title)[^>]*>[^<]*/g, '').replace(/<[^>]+>/g, ' ');
    assert.doesNotMatch(visible, /[←↑→↓↔↗↘]/, `${page} has no arrow glyphs`);
    const sheet = css[page] ?? css.default;
    for (const [tag, kind] of html.matchAll(/<span class="(?:cs-arrow )?icon icon-arrow-([a-z]+)"[^>]*>/g)) {
      assert.match(tag, /aria-hidden="true"/, `${page}: ${tag}`);
      assert.match(sheet, new RegExp(`\\.icon-arrow-${kind} \\{ --icon: url\\("data:image/svg\\+xml,`), `${page}: icon-arrow-${kind} is defined`);
    }
  }
  for (const sheet of [styles, sheets['web/project.css']]) {
    assert.match(sheet, /\.icon \{ display: inline-block; flex: none; width: \.92em; height: \.92em;[^}]*background-color: currentColor; -webkit-mask: var\(--icon\)[^}]*mask: var\(--icon\)/);
    assert.match(sheet, /@media \(forced-colors: active\) \{ \.icon \{ background-color: CanvasText;/);
  }
  // The 404 page keeps root-absolute url()s, so its one arrow is inline SVG in currentColor.
  assert.match(read('web/404.html'), /<svg class="icon" viewBox="0 0 16 16"[^>]*aria-hidden="true" focusable="false"><path [^>]*stroke="currentColor"/);
});

// ---- Round 10 ----

test('Open the work: card links are 48px pills, the cards stack on phones and tablets, and card copy uses the body token', () => {
  assert.match(styles, /\.open-card-link \{[^}]*min-height: 48px;/);
  assert.match(styles, /\.open-card-text \{[^}]*font-size: var\(--text-body\)/);
  assert.match(styles, /\.open-heading > p, \.work-heading > p/);
  assert.match(styles, /@media \(max-width: 1100px\) \{[^@]*\.open-cards \{ grid-template-columns: minmax\(0, 1fr\);/);
  // Card labels on the card fill (#f7f6f0): the label colour keeps 4.5:1.
  const label = /--label: #([0-9a-f]{6});/.exec(styles)[1];
  assert.ok(contrast(label, 'f7f6f0') >= 4.5, `label ${contrast(label, 'f7f6f0').toFixed(2)}:1`);
  assert.ok(contrast('55584e', 'f7f6f0') >= 4.5, 'card sentence');
  // Phones: Lab joins the nav in place of About (both About and Skills are optional there).
  const phone = styles.indexOf('@media (max-width: 760px) {');
  assert.ok(phone > 0 && styles.indexOf('.header-contact, .nav-optional { display: none; }', phone) > phone);
});

test('chart labels and the skill usage line keep 4.5:1 on the dark sections', () => {
  const chart = sheets['web/home-charts.css'];
  for (const [selector, hex] of [['.cap-chart', /\.cap-chart \{[^}]*color: #([0-9a-f]{6})/], ['.skill-usage', /\.skill-usage \{[^}]*color: #([0-9a-f]{6})/], ['.skill-tag', /\.skill-tag \{[^}]*color: #([0-9a-f]{6})/]]) {
    const color = hex.exec(chart)?.[1];
    assert.ok(color, selector);
    assert.ok(contrast(color, '101114') >= 4.5, `${selector} ${contrast(color, '101114').toFixed(2)}:1`);
  }
  // Pressed tag: night text on the green fill.
  assert.ok(contrast('101114', 'c7d2a8') >= 4.5);
});

test('Open the work reserves the live previews’ height (measured at 360-2000) so the swap never moves the page', () => {
  assert.match(styles, /\.open-card \{ container-type: inline-size; \}/);
  assert.match(styles, /\.js-enabled \.open-work:not\(\.previews-off\) \.work-preview:not\(\[data-preview-state="fallback"\]\) \{ min-height: var\(--reserve, auto\); \}/);
  // Live heights (Chrome, Nov 12): obs 310-359 wide, 310-345 tablet, 343-376 phone; trace 255-292; loop about .54 x its width + 50-70 px.
  const reserve = kind => [...styles.matchAll(new RegExp(`\\.work-preview\\[data-preview="${kind}"\\] \\{ --reserve: ([^;]+);`, 'g'))].map(match => match[1]);
  assert.deepEqual(reserve('obs'), ['360px', '346px', '378px']);
  assert.deepEqual(reserve('trace'), ['300px', '285px']);
  assert.deepEqual(reserve('loop'), ['calc(54.2cqi + 72px)', 'calc((100cqi - 32px) * .296 + 60px)']);
});

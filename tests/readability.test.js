// Reading floor and touch targets (styles.css, about-scenes.css, experience.css,
// explorer.css), checked as text.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const files = ['web/styles.css', 'web/about-scenes.css', 'web/experience.css', 'web/explorer.css'];
const sheets = Object.fromEntries(files.map(file => [file, read(file)]));
const styles = sheets['web/styles.css'];

test('three reading tokens: 15-16px body, labels never under 11px, pills and nav never under 12px', () => {
  assert.match(styles, /--text-body: clamp\(15px, [^;]+, 16px\);/);
  assert.match(styles, /--text-label: clamp\(11px, [^;]+, 12px\);/);
  assert.match(styles, /--text-pill: clamp\(12px, [^;]+, 13px\);/);
});

test('no fixed font size under 11px in the owned stylesheets (the wordmark lockup and narrow-phone nav excepted)', () => {
  for (const [file, css] of Object.entries(sheets)) {
    for (const match of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const [, selector, body] = match;
      for (const size of body.matchAll(/font-size: ([\d.]+)px/g)) {
        if (Number(size[1]) >= 11) continue;
        assert.ok(/\.wordmark-last/.test(selector), `${file}: ${selector.trim()} ${size[0]}`);
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
  assert.match(styles, /:is\(\.main-nav a, \.hero-links a, \.contact-links a, \.work-end a, \.section-top a\)::before \{ content: ""; position: absolute; top: calc\(50% - 22px\); bottom: calc\(50% - 22px\); left: min\(0px, calc\(50% - 22px\)\); right: min\(0px, calc\(50% - 22px\)\); \}/);
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

test('the skills title is sized so TRAINING. keeps its period', () => {
  assert.match(styles, /\.skills-layout h2 \{ font-size: clamp\(44px, 5\.7vw, 100px\);/);
});

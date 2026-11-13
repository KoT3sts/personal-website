// The header menu below 900px (web/header.js initMenu, styles.css): a
// disclosure button with aria-expanded that opens every section and the
// résumé; Escape closes it and returns focus to the button.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import { initMenu } from '../web/header.js';

const html = await readFile(new URL('../web/index.html', import.meta.url), 'utf8');
const css = await readFile(new URL('../web/styles.css', import.meta.url), 'utf8');

function setup() {
  const { window } = new JSDOM(html, { url: 'https://portfolio.test/' });
  window.matchMedia = () => ({ matches: false, addEventListener() {} });
  const { document } = window;
  const header = document.querySelector('.site-header');
  return { window, document, header, menu: initMenu(document, window, header) };
}

test('without scripts the menu button stays hidden and Contact stays in the pill', () => {
  const { document } = new JSDOM(html).window;
  const button = document.querySelector('.main-nav .nav-menu-button');
  assert.ok(button.hasAttribute('hidden'));
  assert.equal(button.getAttribute('type'), 'button');
  assert.equal(button.getAttribute('aria-expanded'), 'false');
  assert.equal(button.getAttribute('aria-controls'), 'site-menu');
  assert.ok(document.querySelector('#site-menu').hasAttribute('hidden'));
  // The swap only applies once header.js marks the header (has-menu), below 900px.
  assert.match(css, /@media \(max-width: 900px\) \{ \.nav-optional \{ display: none; \} \.has-menu \.nav-menu-button \{ display: inline-flex; \} \.has-menu \.nav-menu-swap \{ display: none; \} \}/);
  assert.ok(document.querySelector('.main-nav a.nav-menu-swap[href="#contact"]'));
});

test('the menu lists every section the nav does, plus the résumé', () => {
  const { document } = new JSDOM(html).window;
  const nav = [...document.querySelectorAll('.main-nav a')].map(link => [link.getAttribute('href'), link.textContent.trim()]);
  const menu = [...document.querySelectorAll('#site-menu .site-menu-list a')].map(link => [link.getAttribute('href'), link.textContent.trim()]);
  assert.deepEqual(menu, nav);
  assert.ok(document.querySelector('#site-menu a[href="./assets/Cesar_Tortolero_Resume.pdf"][download]'));
  assert.equal(document.querySelectorAll('[onclick], [onkeydown]').length, 0, 'no inline handlers (CSP)');
});

test('the button opens and closes the panel; Escape closes it and returns focus', () => {
  const { window, document, header, menu } = setup();
  const button = document.querySelector('.nav-menu-button');
  const panel = document.querySelector('#site-menu');
  assert.ok(menu);
  assert.equal(button.hidden, false, 'shown once wired');
  assert.ok(header.classList.contains('has-menu'));
  button.click();
  assert.equal(button.getAttribute('aria-expanded'), 'true');
  assert.equal(panel.hidden, false);
  panel.querySelector('a').focus();
  document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
  assert.equal(button.getAttribute('aria-expanded'), 'false');
  assert.equal(panel.hidden, true);
  assert.equal(document.activeElement, button, 'focus returns to the button');
  button.click();
  button.click();
  assert.equal(panel.hidden, true, 'a second press closes it');
});

test('following a link or clicking outside closes the menu', () => {
  const { document, menu } = setup();
  const panel = document.querySelector('#site-menu');
  menu.open();
  panel.querySelector('a[href="#skills"]').click();
  assert.equal(panel.hidden, true);
  menu.open();
  document.querySelector('#hero-title').click();
  assert.equal(panel.hidden, true);
});

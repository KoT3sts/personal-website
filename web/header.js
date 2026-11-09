import { sectionAtLine } from './motion.js';

// Site header: tone (light/dark) follows the section behind it, the nav marks
// the section currently being read, a tone-matched bar appears once the page
// leaves the hero top, and the header slides away while reading downward.
const SOLID_AFTER = 24; // px scrolled before the bar fades in
const PINNED_UNTIL = 160; // px from the top where the header never hides
const SCROLL_DELTA = 8; // px of travel in one direction before hide/show flips

export function initHeader(document, window) {
  const header = document.querySelector('.site-header');
  if (!header) return null;
  const root = document.documentElement;
  const raf = window.requestAnimationFrame?.bind(window);
  const navLinks = [...document.querySelectorAll('.main-nav a')];
  const pageSections = [...document.querySelectorAll('main > section[id], footer[id]')];

  // The header's vertical slide, so tone sampling uses its resting position
  // even while it is hidden or mid-transition.
  function slideOffset() {
    const transform = window.getComputedStyle?.(header).transform;
    if (!transform || transform === 'none' || typeof window.DOMMatrixReadOnly !== 'function') return 0;
    try { return new window.DOMMatrixReadOnly(transform).m42 || 0; } catch { return 0; }
  }

  // Header tone follows the section actually behind the header, not the
  // reading band used for navigation, so the light wordmark never sits on a
  // light section, including at the very bottom of the page. Over the hero the
  // header floats, so its centre line decides; once the bar is drawn it takes
  // the tone of the section emerging from under the bar's lower edge.
  function barDepth() {
    const value = parseFloat(window.getComputedStyle?.(header).getPropertyValue('--header-bar-pad'));
    return Number.isFinite(value) ? value : 14;
  }
  function paintHeaderTone() {
    const bounds = header.getBoundingClientRect();
    const top = bounds.top - slideOffset();
    const line = header.classList.contains('is-solid') ? top + bounds.height + barDepth() - 1 : top + bounds.height / 2;
    const index = sectionAtLine(pageSections.map(section => section.getBoundingClientRect()), line);
    header.classList.toggle('is-dark', index >= 0 && pageSections[index].classList.contains('dark-section'));
  }

  // Never hide during the build tour, near the top, before the visitor has
  // scrolled for themselves (deep links and font reflow move the page too), or
  // while a header control has keyboard focus.
  function hasKeyboardFocus() {
    if (!header.contains(document.activeElement)) return false;
    try { return document.activeElement.matches(':focus-visible'); } catch { return true; }
  }
  let engaged = false;
  const engage = () => { engaged = true; };
  ['wheel', 'touchmove', 'keydown', 'pointerdown'].forEach(type => window.addEventListener(type, engage, { passive: true, once: true }));
  const isPinned = y => !engaged || y <= PINNED_UNTIL
    || root.classList.contains('agentic-running')
    || root.classList.contains('agentic-touring')
    || hasKeyboardFocus();

  let anchorY = Math.max(0, window.scrollY || 0);
  let lastY = anchorY;
  // In-page navigation (nav, anchors, deep links, restored scroll) keeps the
  // header in view: anchors land below it, so the visitor stays oriented.
  let navigating = false;
  let navTimer = 0;
  function holdForNavigation() {
    navigating = true;
    header.classList.remove('is-hidden');
    window.clearTimeout(navTimer);
    navTimer = window.setTimeout(() => { navigating = false; }, 1600);
  }
  function paintHeaderState() {
    const y = Math.max(0, window.scrollY || window.pageYOffset || 0);
    const jumped = Math.abs(y - lastY) > (window.innerHeight || 800) * 0.9;
    lastY = y;
    header.classList.toggle('is-solid', y > SOLID_AFTER);
    if (navigating || jumped || isPinned(y)) {
      header.classList.remove('is-hidden');
      anchorY = y;
    } else if (Math.abs(y - anchorY) >= SCROLL_DELTA) {
      header.classList.toggle('is-hidden', y > anchorY);
      anchorY = y;
    }
  }

  let frame = 0;
  function paint() {
    frame = 0;
    paintHeaderState();
    paintHeaderTone();
  }
  const queuePaint = () => {
    if (!raf) paint();
    else if (!frame) frame = raf(paint);
  };
  ['scroll', 'resize', 'load', 'pageshow'].forEach(type => window.addEventListener(type, queuePaint, { passive: true }));
  header.addEventListener('focusin', () => { if (hasKeyboardFocus()) header.classList.remove('is-hidden'); });
  window.addEventListener('hashchange', holdForNavigation);
  document.addEventListener('click', event => {
    const link = event.target?.closest?.('a[href^="#"]');
    if (link && link.hash.length > 1) holdForNavigation();
  });
  window.addEventListener('scrollend', () => {
    if (!navigating) return;
    navigating = false;
    window.clearTimeout(navTimer);
    anchorY = Math.max(0, window.scrollY || 0);
  }, { passive: true });
  // The tour toggles classes on <html>; reveal the header the moment it starts.
  if (typeof window.MutationObserver === 'function') {
    new window.MutationObserver(queuePaint).observe(root, { attributes: true, attributeFilter: ['class'] });
  }

  if (window.IntersectionObserver) {
    const navObserver = new window.IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        navLinks.forEach(link => {
          if (link.hash === `#${entry.target.dataset.navSection || entry.target.id}`) link.setAttribute('aria-current', 'location');
          else link.removeAttribute('aria-current');
        });
      });
    }, { rootMargin: '-12% 0px -70% 0px', threshold: 0 });
    pageSections.forEach(section => navObserver.observe(section));
  }
  paintHeaderState();
  paintHeaderTone();
  return { paintHeaderTone, paintHeaderState };
}

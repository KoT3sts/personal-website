import { sectionAtLine } from './motion.js';

// Site header: tone (light/dark) follows the section behind it, and the nav
// marks the section currently being read.
export function initHeader(document, window) {
  const header = document.querySelector('.site-header');
  if (!header) return null;
  const raf = window.requestAnimationFrame?.bind(window);
  const navLinks = [...document.querySelectorAll('.main-nav a')];
  const pageSections = [...document.querySelectorAll('main > section[id], footer[id]')];
  // Header tone follows the section actually behind the header (its centre
  // line), not the reading band used for navigation, so the light wordmark
  // never sits on a light section, including at the very bottom of the page.
  let toneFrame = 0;
  function paintHeaderTone() {
    toneFrame = 0;
    const bounds = header.getBoundingClientRect();
    const index = sectionAtLine(pageSections.map(section => section.getBoundingClientRect()), bounds.top + bounds.height / 2);
    header.classList.toggle('is-dark', index >= 0 && pageSections[index].classList.contains('dark-section'));
  }
  const queueHeaderTone = () => {
    if (!raf) paintHeaderTone();
    else if (!toneFrame) toneFrame = raf(paintHeaderTone);
  };
  ['scroll', 'resize', 'load', 'pageshow'].forEach(type => window.addEventListener(type, queueHeaderTone, { passive: true }));
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
  paintHeaderTone();
  return { paintHeaderTone };
}

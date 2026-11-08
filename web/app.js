import { createGalleryState } from './gallery-state.js';
import { initAgenticEntrance } from './entrance.js';

export function initPortfolio(document, window) {
  const gallery = document.querySelector('.gallery');
  const cards = [...gallery.querySelectorAll('.project-card')];
  const state = createGalleryState(cards.length);
  const selectors = [...gallery.querySelectorAll('[data-select]')];
  const stage = gallery.querySelector('.gallery-stage');
  const counter = gallery.querySelector('.gallery-count');
  const dialog = document.querySelector('.project-dialog');
  const dialogContent = dialog.querySelector('.dialog-content');
  const canUseDialog = typeof dialog.showModal === 'function';
  const motion = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  let dialogOpener = null;
  let gesture = null;
  let suppressClick = false;
  let suppressTimer;

  function renderGallery() {
    const focusedCard = document.activeElement?.closest('.project-card');
    if (focusedCard && focusedCard !== cards[state.index]) stage.focus();
    cards.forEach((card, index) => {
      let offset = (index - state.index + cards.length) % cards.length;
      if (offset > cards.length / 2) offset -= cards.length;
      card.style.setProperty('--offset', offset);
      card.style.setProperty('--distance', Math.abs(offset));
      card.style.setProperty('--card-z', cards.length - Math.abs(offset));
      card.style.setProperty('--card-opacity', offset === 0 ? 1 : .65);
      card.setAttribute('aria-hidden', String(index !== state.index));
      card.querySelectorAll('a, button').forEach(link => { link.tabIndex = index === state.index ? 0 : -1; });
    });
    selectors.forEach((button, index) => button.setAttribute('aria-pressed', String(index === state.index)));
    const title = cards[state.index].querySelector('h3').textContent;
    counter.textContent = `${String(state.index + 1).padStart(2, '0')} / ${String(cards.length).padStart(2, '0')} — ${title}`;
  }

  function step(delta) {
    state.step(delta);
    renderGallery();
  }

  gallery.querySelector('.gallery-prev').addEventListener('click', () => step(-1));
  gallery.querySelector('.gallery-next').addEventListener('click', () => step(1));
  selectors.forEach(button => button.addEventListener('click', () => {
    state.select(Number(button.dataset.select));
    renderGallery();
  }));
  stage.addEventListener('keydown', event => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    step(event.key === 'ArrowLeft' ? -1 : 1);
    // A focused card link must not remain inside a newly inactive panel.
    if (event.target !== stage) stage.focus();
  });

  stage.addEventListener('pointerdown', event => {
    if (event.button !== 0 || event.isPrimary === false) return;
    gesture = { x: event.clientX, y: event.clientY, id: event.pointerId, dragging: false };
    suppressClick = false;
    window.clearTimeout(suppressTimer);
  });
  stage.addEventListener('pointermove', event => {
    if (!gesture || gesture.id !== event.pointerId) return;
    const dx = event.clientX - gesture.x;
    const dy = event.clientY - gesture.y;
    if (!gesture.dragging && Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 9) { gesture = null; return; }
    if (Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy)) {
      gesture.dragging = true;
      stage.classList.add('is-dragging');
      stage.setPointerCapture?.(event.pointerId);
    }
  });
  function finishGesture(event, cancelled = false) {
    if (!gesture || gesture.id !== event.pointerId) return;
    const dx = event.clientX - gesture.x;
    const dragged = gesture.dragging;
    gesture = null;
    stage.classList.remove('is-dragging');
    if (stage.hasPointerCapture?.(event.pointerId)) stage.releasePointerCapture(event.pointerId);
    if (!cancelled && dragged && Math.abs(dx) > 45) {
      suppressClick = true;
      step(dx < 0 ? 1 : -1);
      suppressTimer = window.setTimeout(() => { suppressClick = false; }, 350);
    }
  }
  stage.addEventListener('pointerup', event => finishGesture(event));
  stage.addEventListener('pointercancel', event => finishGesture(event, true));
  stage.addEventListener('dragstart', event => event.preventDefault());
  stage.addEventListener('click', event => {
    if (suppressClick) { event.preventDefault(); event.stopImmediatePropagation(); suppressClick = false; }
  }, true);

  if (canUseDialog) {
    document.addEventListener('click', event => {
      const link = event.target.closest('[data-open]');
      if (!link || event.defaultPrevented || event.button > 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const source = document.getElementById(link.dataset.open);
      if (!source) return;
      event.preventDefault();
      dialogOpener = link;
      const image = link.closest('.project-card').querySelector('img').cloneNode(true);
      image.loading = 'eager';
      const story = source.cloneNode(true);
      story.removeAttribute('id');
      const title = story.querySelector('h3');
      title.id = 'dialog-project-title';
      const content = document.createDocumentFragment();
      content.append(image, ...story.childNodes);
      dialogContent.replaceChildren(content);
      dialog.setAttribute('aria-labelledby', 'dialog-project-title');
      dialog.showModal();
      dialog.scrollTop = 0;
      document.body.classList.add('dialog-open');
    });
    dialog.querySelector('.dialog-close').addEventListener('click', () => dialog.close());
    dialog.addEventListener('click', event => {
      if (event.target !== dialog) return;
      const bounds = dialog.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close();
    });
    dialog.addEventListener('close', () => {
      document.body.classList.remove('dialog-open');
      dialogOpener?.focus();
    });
  } else {
    // Keep inline project details reachable in browsers without native dialogs.
    document.querySelector('.project-stories').style.display = 'grid';
  }

  const header = document.querySelector('.site-header');
  const navLinks = [...document.querySelectorAll('.main-nav a')];
  if (window.IntersectionObserver) {
    const navObserver = new window.IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        header.classList.toggle('is-dark', entry.target.classList.contains('dark-section'));
        navLinks.forEach(link => {
          if (link.hash === `#${entry.target.id}`) link.setAttribute('aria-current', 'location');
          else link.removeAttribute('aria-current');
        });
      });
    }, { rootMargin: '-12% 0px -70% 0px', threshold: 0 });
    document.querySelectorAll('main > section[id], footer[id]').forEach(section => navObserver.observe(section));
  }
  const art = document.querySelector('.hero-art');
  document.querySelector('.hero').addEventListener('pointermove', event => {
    if (motion?.matches || event.pointerType === 'touch') return;
    const rotation = (event.clientX / Math.max(window.innerWidth, 1) - .5) * 6;
    art.style.setProperty('--art-rotate', `${rotation.toFixed(2)}deg`);
  });
  document.querySelectorAll('[data-year]').forEach(element => { element.textContent = new Date().getFullYear(); });
  renderGallery();
  document.body.classList.add('js-enabled');
  gallery.querySelectorAll('[hidden]').forEach(element => { element.hidden = false; });
  return { state };
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  initPortfolio(document, window);
  initAgenticEntrance(document, window);
}

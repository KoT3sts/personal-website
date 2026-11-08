import { createGalleryState, wrapOffset, cardPose, dragOffset, releaseSteps } from './gallery-state.js';
import { initAgenticEntrance } from './entrance.js';
import { initMotion } from './motion.js';

const SETTLE = { one: '.82s', many: '1s' };

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
  const raf = window.requestAnimationFrame?.bind(window);
  const cancelRaf = window.cancelAnimationFrame?.bind(window);
  let dialogOpener = null;
  let gesture = null;
  let suppressClick = false;
  let suppressTimer;
  let dragFrame = 0;
  let shownIndex = state.index;

  // Only transforms and opacity change here; no layout is read per frame.
  function layoutCards(drag = 0) {
    cards.forEach((card, index) => {
      const position = wrapOffset(index, state.index, cards.length) + drag;
      const pose = cardPose(position, cards.length);
      card.style.setProperty('--offset', position);
      card.style.setProperty('--distance', pose.distance);
      card.style.setProperty('--card-z', pose.z);
      card.style.setProperty('--card-opacity', pose.opacity);
      // Keep the incumbent three-card arc: second neighbours fade out, and cards
      // that wrap around the back are hidden so they never sweep across the stage.
      card.toggleAttribute('data-far', pose.far);
    });
  }

  function announceCounter(direction) {
    if (typeof counter.animate !== 'function') return;
    const keyframes = motion?.matches
      ? [{ opacity: 0.35 }, { opacity: 1 }]
      : [{ opacity: 0, transform: `translate3d(${direction * 12}px, 0, 0)` }, { opacity: 1, transform: 'none' }];
    counter.animate(keyframes, { duration: motion?.matches ? 160 : 520, easing: 'cubic-bezier(.16, 1, .3, 1)' });
  }

  function renderGallery(direction = 0) {
    const focusedCard = document.activeElement?.closest('.project-card');
    if (focusedCard && focusedCard !== cards[state.index]) stage.focus();
    layoutCards(0);
    cards.forEach((card, index) => {
      card.setAttribute('aria-hidden', String(index !== state.index));
      card.querySelectorAll('a, button').forEach(link => { link.tabIndex = index === state.index ? 0 : -1; });
    });
    selectors.forEach((button, index) => button.setAttribute('aria-pressed', String(index === state.index)));
    const title = cards[state.index].querySelector('h3').textContent;
    counter.textContent = `${String(state.index + 1).padStart(2, '0')} / ${String(cards.length).padStart(2, '0')} — ${title}`;
    if (state.index !== shownIndex) announceCounter(direction || 1);
    shownIndex = state.index;
  }

  function moveTo(update, direction, distance = 1) {
    stage.style.setProperty('--settle', distance > 1 ? SETTLE.many : SETTLE.one);
    update();
    renderGallery(direction);
  }

  function step(delta) {
    moveTo(() => state.step(delta), Math.sign(delta), Math.abs(delta));
  }

  gallery.querySelector('.gallery-prev').addEventListener('click', () => step(-1));
  gallery.querySelector('.gallery-next').addEventListener('click', () => step(1));
  selectors.forEach(button => button.addEventListener('click', () => {
    const target = Number(button.dataset.select);
    const offset = wrapOffset(target, state.index, cards.length);
    moveTo(() => state.select(target), Math.sign(offset), Math.abs(offset));
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
    gesture = { x: event.clientX, y: event.clientY, id: event.pointerId, dragging: false, shift: 0, samples: [] };
    suppressClick = false;
    window.clearTimeout(suppressTimer);
  });
  function cardShift() {
    const value = parseFloat(window.getComputedStyle?.(gallery).getPropertyValue('--card-shift'));
    return value > 0 ? value : 430;
  }
  function sample(event) {
    const time = Number.isFinite(event.timeStamp) ? event.timeStamp : Date.now();
    gesture.samples.push({ x: event.clientX, time });
    while (gesture.samples.length > 2 && time - gesture.samples[0].time > 100) gesture.samples.shift();
  }
  function velocity() {
    const [first, last] = [gesture.samples[0], gesture.samples[gesture.samples.length - 1]];
    const elapsed = last && first ? last.time - first.time : 0;
    return elapsed >= 16 ? (last.x - first.x) / elapsed : 0;
  }
  function paintDrag() {
    dragFrame = 0;
    if (gesture?.dragging) layoutCards(dragOffset(gesture.dx, gesture.shift));
  }
  stage.addEventListener('pointermove', event => {
    if (!gesture || gesture.id !== event.pointerId) return;
    const dx = event.clientX - gesture.x;
    const dy = event.clientY - gesture.y;
    if (!gesture.dragging && Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 9) { gesture = null; return; }
    if (!gesture.dragging && Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy)) {
      gesture.dragging = true;
      gesture.shift = cardShift();
      stage.classList.add('is-dragging');
      stage.setPointerCapture?.(event.pointerId);
    }
    if (!gesture.dragging) return;
    gesture.dx = dx;
    sample(event);
    // Cards follow the pointer, coalesced to one write per frame.
    if (motion?.matches) return;
    if (!raf) paintDrag();
    else if (!dragFrame) dragFrame = raf(paintDrag);
  });
  function finishGesture(event, cancelled = false) {
    if (!gesture || gesture.id !== event.pointerId) return;
    const dx = event.clientX - gesture.x;
    const dragged = gesture.dragging;
    if (dragged) sample(event);
    const speed = dragged ? velocity() : 0;
    const shift = gesture.shift;
    gesture = null;
    if (dragFrame) { cancelRaf?.(dragFrame); dragFrame = 0; }
    stage.classList.remove('is-dragging');
    if (stage.hasPointerCapture?.(event.pointerId)) stage.releasePointerCapture(event.pointerId);
    const steps = !cancelled && dragged ? releaseSteps({ dx, velocity: speed, shift }) : 0;
    if (steps) {
      suppressClick = true;
      step(steps);
      suppressTimer = window.setTimeout(() => { suppressClick = false; }, 350);
    } else if (dragged) {
      // Not far enough: settle back onto the current card.
      stage.style.setProperty('--settle', SETTLE.one);
      layoutCards(0);
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
          if (link.hash === `#${entry.target.dataset.navSection || entry.target.id}`) link.setAttribute('aria-current', 'location');
          else link.removeAttribute('aria-current');
        });
      });
    }, { rootMargin: '-12% 0px -70% 0px', threshold: 0 });
    document.querySelectorAll('main > section[id], footer[id]').forEach(section => navObserver.observe(section));
  }
  const art = document.querySelector('.hero-art');
  let tiltFrame = 0;
  let tilt = 0;
  const paintTilt = () => { tiltFrame = 0; art.style.setProperty('--art-rotate', `${tilt.toFixed(2)}deg`); };
  document.querySelector('.hero').addEventListener('pointermove', event => {
    if (motion?.matches || event.pointerType === 'touch') return;
    // The entrance owns the hero while it assembles it.
    if (document.documentElement.classList.contains('agentic-running')) return;
    tilt = (event.clientX / Math.max(window.innerWidth, 1) - .5) * 6;
    if (!raf) paintTilt();
    else if (!tiltFrame) tiltFrame = raf(paintTilt);
  });
  document.querySelectorAll('[data-year]').forEach(element => { element.textContent = new Date().getFullYear(); });
  renderGallery();
  document.body.classList.add('js-enabled');
  gallery.querySelectorAll('[hidden]').forEach(element => { element.hidden = false; });
  return { state };
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  initPortfolio(document, window);
  const entrance = initAgenticEntrance(document, window, { everyVisit: true });
  try { initMotion(document, window, { entrance }); }
  catch { document.querySelectorAll('[data-reveal]').forEach(element => element.removeAttribute('data-reveal')); }
}

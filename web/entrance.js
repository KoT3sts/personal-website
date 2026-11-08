const VISIT_KEY = 'cesar:portfolio:agentic-intro:v1';
const ROLES = [
  ['Layout', '#7ba9f0'], ['Content', '#dca5cf'], ['Projects', '#92cbb3'],
  ['Motion', '#c2a5ed'], ['QA', '#e1bf79'],
];

export function shouldPlayEntrance({ seen, reducedMotion, storageAvailable, hash, navigationType }) {
  return !seen && !reducedMotion && storageAvailable && (!hash || hash === '#home') && navigationType !== 'back_forward';
}

export function initAgenticEntrance(document, window, config = {}) {
  const hero = document.querySelector('#home');
  if (!hero) return { phase: 'ready', sectionsEligible: false, skip() {}, replay() {} };
  const duration = Number.isFinite(config.heroDuration) && config.heroDuration > 0 ? config.heroDuration : 4500;
  const sectionDuration = Number.isFinite(config.sectionDuration) && config.sectionDuration > 0 ? config.sectionDuration : 900;
  let storage;
  let seen = false;
  try {
    storage = window.localStorage;
    seen = storage.getItem(VISIT_KEY) === 'seen';
    storage.setItem(`${VISIT_KEY}:probe`, '1');
    storage.removeItem(`${VISIT_KEY}:probe`);
  } catch { storage = null; }
  const media = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  const navigationType = window.performance?.getEntriesByType?.('navigation')?.[0]?.type;
  let phase = 'ready';
  let sectionsEligible = false;
  let stage = null;
  let crew = [];
  let currentSection = null;
  let observer;
  let destroyed = false;
  const timers = new Set();
  const marked = new Set();
  const visitedSections = new Set();

  const replayButton = document.createElement('button');
  replayButton.type = 'button';
  replayButton.className = 'agentic-replay';
  replayButton.dataset.agenticReplay = '';
  replayButton.textContent = 'Replay intro ↗';
  replayButton.hidden = true;
  replayButton.disabled = Boolean(media?.matches);
  (document.querySelector('.footer-bottom') || document.querySelector('footer') || document.body).append(replayButton);

  function later(callback, delay) {
    const id = window.setTimeout(() => {
      timers.delete(id);
      try { callback(); } catch { stop(false); }
    }, delay);
    timers.add(id);
  }

  function clearVisuals() {
    timers.forEach(id => window.clearTimeout(id));
    timers.clear();
    marked.forEach(element => {
      element.removeAttribute('data-build-state');
      element.classList.remove('agentic-target', 'agentic-text');
      element.style.removeProperty('--agentic-step-duration');
    });
    marked.clear();
    stage?.remove();
    stage = null;
    crew = [];
    currentSection = null;
    document.documentElement.classList.remove('agentic-running');
  }

  function persist() {
    try { storage?.setItem(VISIT_KEY, 'seen'); }
    catch { sectionsEligible = false; observer?.disconnect(); }
  }

  function stop(save = true) {
    const focusWasInStage = stage?.contains(document.activeElement);
    sectionsEligible = false;
    observer?.disconnect();
    clearVisuals();
    phase = 'ready';
    replayButton.hidden = false;
    if (save) persist();
    if (focusWasInStage) {
      const heading = hero.querySelector('h1');
      heading?.setAttribute('tabindex', '-1');
      heading?.focus({ preventScroll: true });
    }
  }

  function moveAgent(agent, element, corner = 0) {
    if (!stage || !element.isConnected) return;
    const bounds = element.getBoundingClientRect();
    const width = Math.max(0, bounds.width);
    const height = Math.max(0, bounds.height);
    const x = bounds.left + (corner % 2 ? width : 0);
    const y = bounds.top + (corner > 1 ? height : 0);
    const visible = width > 0 && height > 0 && bounds.bottom > 0 && bounds.top < window.innerHeight;
    agent.frame.hidden = !visible;
    agent.frame.style.cssText = `left:${bounds.left}px;top:${bounds.top}px;width:${width}px;height:${height}px;--agent-color:${agent.color}`;
    agent.cursor.style.transform = `translate(${Math.max(8, Math.min(x, window.innerWidth - 115))}px,${Math.max(8, Math.min(y, window.innerHeight - 45))}px)`;
    agent.target = element;
    agent.corner = corner;
  }

  function createStage(isSection) {
    stage = document.createElement('div');
    stage.className = `agentic-stage${isSection ? ' is-section' : ''}`;
    const decoration = document.createElement('div');
    decoration.className = 'agentic-decoration';
    decoration.setAttribute('aria-hidden', 'true');
    decoration.innerHTML = '<div class="agentic-veil"></div><div class="agentic-status"><span class="agentic-status-light"></span>Visual build <span class="agentic-status-text">· Crew arriving</span></div>';
    stage.append(decoration);
    const skipButton = document.createElement('button');
    skipButton.type = 'button';
    skipButton.className = 'agentic-skip';
    skipButton.dataset.agenticSkip = '';
    skipButton.textContent = 'Skip intro ↗';
    skipButton.addEventListener('click', () => stop());
    stage.append(skipButton);
    const crewCount = window.innerWidth < 640 ? 3 : 5;
    crew = Array.from({ length: crewCount }, (_, index) => {
      const [role, color] = ROLES[index];
      const cursor = document.createElement('div');
      cursor.className = 'agentic-cursor';
      cursor.style.setProperty('--agent-color', color);
      cursor.style.transform = `translate(${window.innerWidth / 2 + index * 14 - 30}px,${window.innerHeight * .43 + index * 9}px)`;
      cursor.innerHTML = '<svg viewBox="0 0 24 28" width="18" height="21"><path d="M2 1 21 16 12 17 8 25Z" fill="currentColor" stroke="#252a23" stroke-width="1.3"/></svg><span class="agentic-role"></span>';
      cursor.querySelector('.agentic-role').textContent = role;
      const frame = document.createElement('div');
      frame.className = 'agentic-frame';
      frame.hidden = true;
      frame.innerHTML = '<i></i><i></i><i></i><i></i>';
      decoration.append(cursor, frame);
      return { cursor, frame, color, target: null, corner: 0, serial: 0 };
    });
    document.body.append(stage);
    document.documentElement.classList.add('agentic-running');
  }

  function animateTargets(elements, total, isSection, onComplete) {
    clearVisuals();
    createStage(isSection);
    const targets = [...new Set(elements.filter(Boolean))];
    targets.forEach(element => {
      marked.add(element);
      element.classList.add('agentic-target');
      if (/^(H[1-6]|P)$/.test(element.tagName)) element.classList.add('agentic-text');
      element.style.setProperty('--agentic-step-duration', `${Math.max(80, total * .19)}ms`);
      // Sections have already entered the viewport. Trace them without
      // hiding text the visitor may have started reading.
      element.dataset.buildState = isSection ? 'tracing' : 'pending';
    });
    later(() => stage?.classList.add('is-assembling'), Math.min(220, total * .06));
    targets.forEach((element, index) => {
      const agent = crew[index % crew.length];
      const delay = total * (.11 + index / Math.max(targets.length, 1) * .58);
      later(() => {
        const serial = ++agent.serial;
        const [role, color] = ROLES[index % ROLES.length];
        agent.color = color;
        agent.cursor.style.setProperty('--agent-color', color);
        agent.cursor.querySelector('.agentic-role').textContent = role;
        stage.querySelector('.agentic-status-text').textContent = `· ${role}`;
        element.dataset.buildState = isSection ? 'tracing' : 'placing';
        moveAgent(agent, element);
        later(() => { if (agent.serial === serial) moveAgent(agent, element, 1); }, total * .065);
        later(() => { if (agent.serial === serial) moveAgent(agent, element, 3); }, total * .13);
        later(() => {
          element.dataset.buildState = 'done';
          if (agent.serial === serial) agent.frame.hidden = true;
        }, total * .2);
      }, delay);
    });
    later(() => stage?.classList.add('is-settling'), total * .93);
    later(() => { clearVisuals(); onComplete(); }, total);
  }

  function heroTargets() {
    return ['.wordmark', '.main-nav', '.hero-kicker', '#hero-title', '.hero-art', '.hero-intro', '.hero-note', '.scroll-cue'].map(selector => document.querySelector(selector));
  }

  function watchSections() {
    if (!sectionsEligible || !window.IntersectionObserver) return;
    observer = new window.IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!sectionsEligible) return;
        if (!entry.isIntersecting) {
          if (entry.target === currentSection) { clearVisuals(); phase = 'ready'; }
          return;
        }
        if (visitedSections.has(entry.target)) return;
        visitedSections.add(entry.target);
        const elements = [...entry.target.querySelectorAll('.section-top, h2:not(.cinematic-copy h2), .cinematic-art, .cinematic-copy, .scene-actions, .project-image-link, .approach-heading > p, details, .contact-button')].slice(0, 7);
        if (!elements.length) return;
        phase = 'section';
        animateTargets(elements, sectionDuration, true, () => { phase = 'ready'; });
        currentSection = entry.target;
      });
    }, { threshold: .18 });
    document.querySelectorAll('main > section[id]:not(#home), footer[id]').forEach(section => observer.observe(section));
  }

  function startHero(replay = false) {
    if (destroyed || media?.matches) { stop(false); return; }
    observer?.disconnect();
    sectionsEligible = !replay;
    phase = 'hero';
    replayButton.hidden = true;
    if (replay) {
      document.documentElement.classList.add('agentic-running');
      hero.scrollIntoView?.({ behavior: 'auto', block: 'start' });
    }
    animateTargets(heroTargets(), duration, false, () => {
      phase = 'ready';
      persist();
      replayButton.hidden = false;
      watchSections();
    });
  }

  const onKey = event => { if ((event.key === 'Escape' || event.key === 'Tab') && (phase !== 'ready' || sectionsEligible)) stop(); };
  const onNavigate = event => {
    if (event.target.closest('[data-agentic-skip], [data-agentic-replay]')) return;
    if ((phase !== 'ready' || sectionsEligible) && event.target.closest('a, button, summary, input, select, textarea')) stop();
  };
  const onGeometry = () => {
    if (phase === 'hero' && window.scrollY > 80) { stop(); return; }
    crew.forEach(agent => { if (agent.target) moveAgent(agent, agent.target, agent.corner); });
  };
  const onHidden = () => { if (document.hidden && phase !== 'ready') stop(); };
  const onMotion = () => { replayButton.disabled = Boolean(media?.matches); if (media?.matches) stop(); };
  const onPageHide = event => {
    stop(false);
    if (event.persisted) return;
    destroyed = true;
    document.removeEventListener('keydown', onKey, true);
    document.removeEventListener('click', onNavigate, true);
    document.removeEventListener('visibilitychange', onHidden);
    window.removeEventListener('scroll', onGeometry);
    window.removeEventListener('resize', onGeometry);
    window.removeEventListener('pagehide', onPageHide);
    media?.removeEventListener?.('change', onMotion);
  };
  document.addEventListener('keydown', onKey, true);
  document.addEventListener('click', onNavigate, true);
  document.addEventListener('visibilitychange', onHidden);
  window.addEventListener('scroll', onGeometry, { passive: true });
  window.addEventListener('resize', onGeometry);
  window.addEventListener('pagehide', onPageHide);
  media?.addEventListener?.('change', onMotion);
  replayButton.addEventListener('click', () => startHero(true));
  const eligible = shouldPlayEntrance({ seen, reducedMotion: Boolean(media?.matches), storageAvailable: Boolean(storage), hash: window.location.hash, navigationType });
  try { if (eligible) startHero(); else replayButton.hidden = false; }
  catch { stop(false); }
  return { get phase() { return phase; }, get sectionsEligible() { return sectionsEligible; }, skip: () => stop(), replay: () => startHero(true) };
}

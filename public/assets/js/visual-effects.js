(() => {
  'use strict';
  if (window.__gestorVisualEffects || !document.body.matches('.page-app, .site-effects')) return;
  window.__gestorVisualEffects = true;
  const body = document.body;
  const landing = body.classList.contains('site-effects');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)');
  const preferenceKey = 'gestor:pause-effects';
  let paused = false;
  try { paused = localStorage.getItem(preferenceKey) === '1'; } catch { /* Storage is optional. */ }
  const backdrop = document.createElement('div');
  backdrop.className = 'fx-backdrop';
  backdrop.setAttribute('aria-hidden', 'true');
  backdrop.innerHTML = '<span></span><span></span>';
  body.prepend(backdrop);
  let observer;
  const updatePreference = () => {
    const stopped = paused || reduce.matches;
    document.documentElement.classList.toggle('fx-paused', stopped);
    if (stopped) {
      document.querySelectorAll('.fx-pending').forEach(el => el.classList.remove('fx-pending'));
      observer?.disconnect();
    }
  };
  updatePreference();
  reduce.addEventListener('change', updatePreference);
  window.addEventListener('storage', event => {
    if (event.key !== preferenceKey) return;
    paused = event.newValue === '1';
    updatePreference();
  });

  const cards = '.hero-offer, .plan, .steps > article, .ui-summary > div, .disp-card, .plano-card, .srv-card, .msg-card, .int-pag-card';
  const reveal = landing
    ? '.hero-copy, .hero-offer, .experience > div, .section-heading, .steps > article, .plan, .faq-section > div, .contact-card'
    : '.app-content > .container > .ui-summary > div, .ui-toolbar, .disp-card, .plano-card, .srv-card, .msg-card, .int-pag-card, .wa-device, .auto-rule';
  const seen = new WeakSet();
  if ('IntersectionObserver' in window) {
    observer = new IntersectionObserver(entries => {
      entries.forEach(({ target, isIntersecting }) => {
        if (!isIntersecting) return;
        target.classList.remove('fx-pending');
        target.classList.add('fx-enter');
        observer.unobserve(target);
      });
    }, { threshold: .05, rootMargin: '0px 0px 24px 0px' });
  }
  const prepare = () => {
    document.querySelectorAll(cards).forEach(el => el.classList.add('fx-spotlight'));
    if (!observer || paused || reduce.matches) return;
    document.querySelectorAll(reveal).forEach((el, index) => {
      if (seen.has(el)) return;
      seen.add(el);
      el.style.setProperty('--fx-delay', `${Math.min(index % 4, 3) * 65}ms`);
      el.classList.add('fx-pending');
      observer.observe(el);
    });
  };
  prepare();
  // PJAX replaces the main content; batch updates without watching attributes.
  const content = document.querySelector('.app-content');
  if (content) {
    let queued = false;
    new MutationObserver(records => {
      records.forEach(record => record.removedNodes.forEach(node => {
        if (node.nodeType !== 1) return;
        observer?.unobserve(node);
        node.querySelectorAll('.fx-pending').forEach(el => observer?.unobserve(el));
      }));
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        prepare();
      });
    }).observe(content, { childList: true, subtree: true });
  }
  document.addEventListener('animationend', event => {
    if (event.animationName === 'fx-enter') event.target.classList.remove('fx-enter');
  });
  document.addEventListener('focusin', event => {
    const card = event.target.closest('.fx-pending');
    if (card) { card.classList.remove('fx-pending'); observer?.unobserve(card); }
  });

  let pointerFrame = 0, activeCard;
  document.addEventListener('pointermove', event => {
    if (!finePointer.matches || reduce.matches || paused || event.pointerType === 'touch') return;
    const card = event.target.closest('.fx-spotlight');
    if (card !== activeCard) {
      cancelAnimationFrame(pointerFrame);
      activeCard?.style.removeProperty('--fx-x');
      activeCard?.style.removeProperty('--fx-y');
      activeCard = card;
    }
    if (!card) return;
    cancelAnimationFrame(pointerFrame);
    pointerFrame = requestAnimationFrame(() => {
      const rect = card.getBoundingClientRect();
      card.style.setProperty('--fx-x', `${event.clientX - rect.left}px`);
      card.style.setProperty('--fx-y', `${event.clientY - rect.top}px`);
    });
  }, { passive: true });

  if (landing) {
    const progress = document.createElement('div');
    progress.className = 'fx-scroll-line';
    progress.setAttribute('aria-hidden', 'true');
    body.append(progress);
    let frame = 0;
    const paint = () => {
      frame = 0;
      const length = document.documentElement.scrollHeight - innerHeight;
      progress.style.transform = `scaleX(${length > 0 ? Math.min(1, Math.max(0, scrollY / length)) : 0})`;
    };
    const update = () => { if (!frame) frame = requestAnimationFrame(paint); };
    addEventListener('scroll', update, { passive: true });
    addEventListener('resize', update, { passive: true });
    paint();
  }
})();

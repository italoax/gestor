(() => {
  const dialog = document.getElementById('client-dialog');
  const trigger = document.querySelector('[data-open-client-portal]');
  if (!dialog || !trigger || typeof dialog.showModal !== 'function') return;
  const frame = dialog.querySelector('iframe');
  let previousOverflow = '';
  let observer;
  let backdropPress = false;
  let closeTimer;
  const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.classList.contains('fx-paused');
  const closePortal = () => {
    if (!dialog.open || dialog.classList.contains('client-dialog-closing')) return;
    if (reduceMotion()) { dialog.close(); return; }
    dialog.classList.add('client-dialog-closing');
    closeTimer = setTimeout(() => dialog.close(), 190);
  };
  trigger.addEventListener('click', event => {
    event.preventDefault();
    if (dialog.open) return;
    observer?.disconnect();
    clearTimeout(closeTimer);
    dialog.classList.remove('client-dialog-closing');
    dialog.classList.add('client-dialog-login', 'client-dialog-loading');
    dialog.style.height = '460px';
    dialog.setAttribute('aria-busy', 'true');
    previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    frame.src = '/area-cliente';
    dialog.showModal();
  });
  dialog.querySelector('[data-close-client-portal]').addEventListener('click', closePortal);
  dialog.addEventListener('cancel', event => { event.preventDefault(); closePortal(); });
  const outside = event => {
    if (event.target !== dialog) return false;
    const rect = dialog.getBoundingClientRect();
    return event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom;
  };
  dialog.addEventListener('pointerdown', event => { backdropPress = outside(event); });
  dialog.addEventListener('click', event => {
    if (backdropPress && outside(event)) closePortal();
    backdropPress = false;
  });
  dialog.addEventListener('close', () => {
    observer?.disconnect();
    clearTimeout(closeTimer);
    dialog.classList.remove('client-dialog-closing');
    backdropPress = false;
    document.body.style.overflow = previousOverflow;
    frame.removeAttribute('src');
    trigger.focus();
  });
  frame.addEventListener('load', () => {
    if (!dialog.open || !frame.getAttribute('src')) return;
    try {
      const doc = frame.contentDocument;
      if (!doc || doc.URL === 'about:blank') return;
      observer?.disconnect();
      const login = Boolean(doc.querySelector('.portal-login'));
      dialog.classList.toggle('client-dialog-login', login);
      if (!login) dialog.style.height = '';
      if (login) {
        doc.body.classList.add('portal-embedded-login');
        const resize = () => {
          if (!dialog.open || frame.contentDocument !== doc) return;
          const height = Math.ceil(doc.querySelector('.portal-main').getBoundingClientRect().height + 2);
          if (height > 2) dialog.style.height = height + 'px';
        };
        observer = new ResizeObserver(resize);
        observer.observe(doc.querySelector('.portal-main'));
        resize();
      }
      frame.contentDocument.addEventListener('keydown', event => {
        if (event.key === 'Escape') { event.preventDefault(); closePortal(); }
      });
    } catch { /* A página externa controla seu próprio teclado. */ }
    dialog.classList.remove('client-dialog-loading');
    dialog.removeAttribute('aria-busy');
  });
})();

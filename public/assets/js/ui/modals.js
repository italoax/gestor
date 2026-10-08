window.gestorPageModules = window.gestorPageModules || {};
window.gestorPageModules.initModals = function ({ on }) {
  const focusableSelector =
    'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';
  let modalStack = Array.from(document.querySelectorAll('.modal-overlay.open'));
  const getOpenModals = () =>
    Array.from(document.querySelectorAll('.modal-overlay.open'));
  const getTopOpenModal = () => {
    modalStack = modalStack.filter(
      (modal) => modal.isConnected && modal.classList.contains('open'),
    );
    getOpenModals().forEach((modal) => {
      if (!modalStack.includes(modal)) modalStack.push(modal);
    });
    return modalStack[modalStack.length - 1] || null;
  };
  const syncModalViewport = () => {
    const viewport = window.visualViewport;
    const root = document.documentElement;
    if (getOpenModals().length && viewport && viewport.scale === 1) {
      root.style.setProperty('--modal-viewport-height', viewport.height + 'px');
      root.style.setProperty('--modal-viewport-top', viewport.offsetTop + 'px');
    } else {
      root.style.removeProperty('--modal-viewport-height');
      root.style.removeProperty('--modal-viewport-top');
    }
  };
  if (window.visualViewport) {
    on(window.visualViewport, 'resize', syncModalViewport);
    on(window.visualViewport, 'scroll', syncModalViewport);
  }
  const syncModalUiState = () => {
    const hasOpenModal = getOpenModals().length > 0;
    document.body.classList.toggle('modal-open', hasOpenModal);
    document.documentElement.classList.toggle('modal-open', hasOpenModal);
    const topModal = getTopOpenModal();
    document.querySelectorAll('.modal-overlay').forEach((overlay) => {
      const isOpen = overlay.classList.contains('open');
      const isTop = overlay === topModal;
      overlay.setAttribute('aria-hidden', isTop ? 'false' : 'true');
      overlay.style.zIndex = isOpen
        ? String(2000 + modalStack.indexOf(overlay))
        : '';
      if (isTop) {
        overlay.removeAttribute('inert');
      } else {
        overlay.setAttribute('inert', '');
      }
    });
    syncModalViewport();
  };

  document.querySelectorAll('.modal-overlay').forEach((overlay, index) => {
    const dialog = overlay.querySelector('.modal');
    if (!dialog) return;
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('tabindex', '-1');
    const heading = dialog.querySelector('.modal-header h3');
    if (heading) {
      if (!heading.id)
        heading.id = (overlay.id || 'dialog-' + index) + '-heading';
      dialog.setAttribute('aria-labelledby', heading.id);
    }
  });

  const setModalState = (modal, isOpen, triggerSelector = null) => {
    if (!modal) return;
    if (isOpen) {
      const wasOpen = modal.classList.contains('open');
      modalStack = modalStack.filter((item) => item !== modal);
      modalStack.push(modal);
      if (!triggerSelector && document.activeElement instanceof HTMLElement) {
        modal._lastFocusedEl = document.activeElement;
      }
      // Fecha o teclado da pesquisa antes de transferir o foco ao modal.
      if (
        document.activeElement instanceof HTMLElement &&
        document.activeElement.matches('[data-search-input]')
      ) {
        document.activeElement.blur();
      }
      modal.classList.add('open');
      modal.setAttribute('aria-hidden', 'false');
      modal.removeAttribute('inert');
      if (triggerSelector) modal.dataset.lastTrigger = triggerSelector;
      syncModalUiState();
      const body = modal.querySelector('.modal-body');
      if (body && !wasOpen) body.scrollTop = 0;
      const focusable =
        Array.from(modal.querySelectorAll(focusableSelector)).find(
          (el) => el.offsetParent !== null,
        ) || modal.querySelector('.modal');
      if (focusable) focusable.focus({ preventScroll: true });
    } else {
      modal.classList.remove('open');
      modal.setAttribute('aria-hidden', 'true');
      modal.setAttribute('inert', '');
      syncModalUiState();
      if (modal.contains(document.activeElement)) {
        document.activeElement.blur();
      }
      const remainingModal = getTopOpenModal();
      if (remainingModal) {
        const previous = modal._lastFocusedEl;
        const target =
          previous && remainingModal.contains(previous)
            ? previous
            : remainingModal.querySelector(focusableSelector);
        if (target) target.focus({ preventScroll: true });
      } else if (modal.dataset.lastTrigger) {
        const el = document.querySelector(modal.dataset.lastTrigger);
        if (el) el.focus({ preventScroll: true });
      } else if (
        modal._lastFocusedEl &&
        typeof modal._lastFocusedEl.focus === 'function'
      ) {
        modal._lastFocusedEl.focus({ preventScroll: true });
      }
    }
  };

  window.gestorSetModalState = setModalState;

  return {
    setModalState,
    getTopOpenModal,
    focusableSelector,
    syncModalUiState,
  };
};

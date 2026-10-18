export type NoticeOptions = {
  title?: string;
  error?: boolean;
  pending?: boolean;
  info?: boolean;
  inline?: boolean;
  onClose?: () => void;
  autoClose?: boolean;
};

const svg = (paths: string, size = 20) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
const closeIcon = svg('<path d="m6 6 12 12M18 6 6 18"/>', 18);
let floatingNotice: HTMLElement | undefined;
let noticeTimer: ReturnType<typeof setTimeout> | undefined;

export function createPanelNotice(text: string, options: NoticeOptions = {}) {
  const notice = document.createElement('div');
  notice.className = `panel-notice${options.inline ? ' is-inline' : ''}`;
  notice.dataset.state = options.pending
    ? 'pending'
    : options.error
      ? 'error'
      : options.info
        ? 'info'
        : 'success';
  const dismissible = Boolean(options.onClose && !options.pending);
  notice.dataset.dismissible = String(dismissible);
  const icon = document.createElement('span');
  icon.className = 'panel-notice-icon';
  icon.setAttribute('aria-hidden', 'true');
  icon.innerHTML = options.pending
    ? '<span class="btn-spinner"></span>'
    : svg(
        options.error
          ? '<path d="m12 3 10 18H2L12 3Z"/><path d="M12 9v5m0 3h.01"/>'
          : options.info
            ? '<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10h.01"/>'
            : '<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
      );
  const copy = document.createElement('div');
  copy.className = 'panel-notice-copy';
  copy.setAttribute('role', options.error ? 'alert' : 'status');
  copy.setAttribute('aria-atomic', 'true');
  const title = document.createElement('strong');
  title.textContent =
    options.title ||
    (options.pending
      ? 'Salvando…'
      : options.error
        ? 'Confira este aviso'
        : options.info
          ? 'Informação'
          : 'Tudo certo!');
  const paragraph = document.createElement('p');
  paragraph.textContent = text;
  copy.append(title, paragraph);
  notice.append(icon, copy);
  if (dismissible) {
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'panel-notice-close';
    close.setAttribute('aria-label', 'Fechar aviso');
    close.innerHTML = closeIcon;
    close.addEventListener('click', options.onClose!);
    notice.append(close);
  }
  return notice;
}

export function dismissPanelNotice() {
  clearTimeout(noticeTimer);
  noticeTimer = undefined;
  floatingNotice?.remove();
  floatingNotice = undefined;
  document
    .querySelectorAll('.panel-notice[data-floating="true"]')
    .forEach((notice) => notice.remove());
}

export function showPanelNotice(
  text: string,
  error = false,
  options: NoticeOptions = {},
) {
  dismissPanelNotice();
  floatingNotice = createPanelNotice(text, {
    ...options,
    error,
    onClose: dismissPanelNotice,
  });
  floatingNotice.dataset.floating = 'true';
  const dialog = Array.from(document.querySelectorAll('dialog[open]')).at(-1);
  (dialog || document.body).append(floatingNotice);
  const current = floatingNotice;
  if (!error && !options.pending && options.autoClose !== false)
    noticeTimer = setTimeout(() => current.remove(), 5000);
}

export function confirmPanelAction(
  message: string,
  source?: HTMLElement,
  trigger?: HTMLElement,
): Promise<boolean> {
  if (document.querySelector('dialog.panel-confirm[open]'))
    return Promise.resolve(false);
  const cancelSchedule = /cancelar.*(agendamento|envio)/i.test(message);
  const destructive =
    cancelSchedule || /apagar|exclu|remover|limpar/i.test(message);
  const dialog = document.createElement('dialog');
  dialog.className = 'panel-confirm';
  dialog.dataset.destructive = String(destructive);
  dialog.setAttribute('aria-labelledby', 'panel-confirm-title');
  dialog.setAttribute('aria-describedby', 'panel-confirm-message');
  dialog.innerHTML = `<div class="panel-confirm-content"><span class="panel-notice-icon" aria-hidden="true">${svg(destructive ? '<path d="M3 6h18M9 6V4h6v2M5 6l1 14h12l1-14M10 10v6m4-6v6"/>' : '<circle cx="12" cy="12" r="9"/><path d="M12 8v5m0 3h.01"/>', 24)}</span><div><h2 id="panel-confirm-title"></h2><p id="panel-confirm-message"></p></div></div><div class="panel-confirm-actions"><button type="button" class="panel-confirm-cancel">Cancelar</button><button type="button" class="panel-confirm-approve"></button></div>`;
  dialog.querySelector('h2')!.textContent = cancelSchedule
    ? 'Cancelar agendamento?'
    : destructive
      ? 'Confirmar exclusão'
      : 'Confirmar ação';
  dialog.querySelector('p')!.textContent = message;
  const cancel = dialog.querySelector<HTMLButtonElement>(
    '.panel-confirm-cancel',
  )!;
  const approve = dialog.querySelector<HTMLButtonElement>(
    '.panel-confirm-approve',
  )!;
  cancel.textContent = cancelSchedule ? 'Voltar' : 'Cancelar';
  approve.textContent = cancelSchedule
    ? 'Sim, cancelar'
    : destructive
      ? 'Excluir'
      : 'Confirmar';
  const previous = trigger || document.activeElement;
  return new Promise((resolve) => {
    let finished = false;
    const observer = new MutationObserver(() => {
      if (source && !source.isConnected) finish(false);
    });
    function finish(accepted: boolean) {
      if (finished) return;
      finished = true;
      observer.disconnect();
      window.removeEventListener('pagehide', leave);
      document.removeEventListener('gestor:before-swap', leave);
      dialog.close();
      dialog.remove();
      document.body.classList.remove('feedback-confirm-open');
      if (previous instanceof HTMLElement && previous.isConnected)
        previous.focus({ preventScroll: true });
      resolve(accepted);
    }
    const leave = () => finish(false);
    cancel.addEventListener('click', () => finish(false));
    approve.addEventListener('click', () => finish(true));
    dialog.addEventListener('cancel', (event) => {
      event.preventDefault();
      finish(false);
    });
    dialog.addEventListener('close', () => finish(false));
    window.addEventListener('pagehide', leave);
    document.addEventListener('gestor:before-swap', leave);
    document.body.append(dialog);
    document.body.classList.add('feedback-confirm-open');
    if (source)
      observer.observe(document.body, { childList: true, subtree: true });
    dialog.showModal();
    cancel.focus();
  });
}

const pendingForms = new WeakSet<HTMLFormElement>();
const approvedForms = new WeakSet<HTMLFormElement>();

/** Stops the original event and replays it once, only after explicit confirmation. */
export function confirmFormSubmission(event: any, message: string): boolean {
  const form = event.target as HTMLFormElement;
  if (!(form instanceof HTMLFormElement) || event.defaultPrevented)
    return false;
  if (approvedForms.delete(form)) return true;
  event.preventDefault();
  if (pendingForms.has(form)) return false;
  pendingForms.add(form);
  const submitter = (event.nativeEvent || event).submitter as
    HTMLButtonElement | HTMLInputElement | null;
  const originalUrl = location.href;
  void confirmPanelAction(message, form, submitter || undefined)
    .then((accepted) => {
      if (accepted && form.isConnected && location.href === originalUrl) {
        approvedForms.add(form);
        try {
          form.requestSubmit(submitter?.form === form ? submitter : undefined);
        } finally {
          approvedForms.delete(form);
        }
      }
    })
    .finally(() => pendingForms.delete(form));
  return false;
}

const pendingElements = new WeakSet<HTMLElement>();
const approvedElements = new WeakSet<HTMLElement>();
export function confirmElementAction(
  event: Event,
  element: HTMLElement,
  message: string,
) {
  if (element instanceof HTMLFormElement)
    return confirmFormSubmission(event, message);
  if (approvedElements.delete(element)) return true;
  event.preventDefault();
  event.stopImmediatePropagation();
  if (pendingElements.has(element)) return false;
  pendingElements.add(element);
  const originalUrl = location.href;
  void confirmPanelAction(message, element, element)
    .then((accepted) => {
      if (accepted && element.isConnected && originalUrl === location.href) {
        approvedElements.add(element);
        try {
          element.click();
        } finally {
          approvedElements.delete(element);
        }
      }
    })
    .finally(() => pendingElements.delete(element));
  return false;
}

if (typeof window !== 'undefined') {
  window.gestorShowNotice = showPanelNotice;
  window.gestorConfirmAction = confirmPanelAction;
}

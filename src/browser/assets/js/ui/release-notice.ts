// O identificador muda apenas após autenticar, nunca em reloads ou novas versões.
const shownLogins = new Set<string>();
const storageKey = 'gestor-release-notice-login';

export async function initReleaseNotice(
  shell: HTMLElement,
  signal: AbortSignal,
) {
  if (!shell || signal.aborted) return;
  const loginId = shell.dataset.releaseLogin;
  if (!loginId) return;
  const alreadyShown = () =>
    shownLogins.has(loginId) || localStorage.getItem(storageKey) === loginId;
  try {
    if (alreadyShown()) return;
    const response = await fetch('/updates.json', {
      cache: 'no-store',
      signal,
    });
    if (!response.ok) return;
    const release = await response.json();
    if (
      signal.aborted ||
      !shell.isConnected ||
      typeof release.version !== 'string' ||
      alreadyShown() ||
      !Array.isArray(release.changes)
    )
      return;
    const changes = release.changes.filter(
      (item: unknown): item is string =>
        typeof item === 'string' && Boolean(item.trim()),
    );
    if (!changes.length) return;

    const dialog = document.createElement('dialog');
    dialog.className = 'modal react-dialog release-notice';
    dialog.setAttribute('aria-labelledby', 'release-notice-title');
    // As mensagens do Git são inseridas como texto, nunca como HTML.
    dialog.innerHTML =
      '<div class="modal-header"><h3 id="release-notice-title">Atualização do painel</h3><button class="modal-close" type="button" aria-label="Fechar">×</button></div><div class="modal-body"><section data-release-current aria-label="Atualização"></section></div><div class="modal-footer"><button class="btn btn-primary" type="button">OK</button></div>';
    const appendText = (
      parent: Element,
      tag: string,
      text: string,
      className = '',
    ) => {
      const element = document.createElement(tag);
      element.className = className;
      element.textContent = text;
      parent.append(element);
      return element;
    };
    const appendDetails = (parent: Element, entry: any) => {
      if (typeof entry.description === 'string' && entry.description.trim()) {
        const description = document.createElement('div');
        description.className = 'release-notice-description';
        for (const block of entry.description.trim().split(/\r?\n\s*\r?\n/)) {
          const section = document.createElement('section');
          let list: HTMLUListElement | null = null;
          const lines = block.split(/\r?\n/);
          for (const [index, line] of lines.entries()) {
            const item = line.match(/^\s*[-*•]\s+(.+)$/);
            if (item) {
              if (!list) {
                list = document.createElement('ul');
                section.append(list);
              }
              appendText(list, 'li', item[1]);
            } else {
              list = null;
              const heading =
                index === 0 && /^\s*[-*•]\s+/.test(lines[1] || '');
              appendText(section, heading ? 'h5' : 'p', line);
            }
          }
          description.append(section);
        }
        parent.append(description);
      }
    };
    const current = dialog.querySelector('[data-release-current]');
    appendText(
      current,
      'h4',
      typeof release.title === 'string' ? release.title : changes[0],
    );
    appendDetails(current, release);
    // Compatibilidade com publicações que ainda fornecem apenas a lista de mudanças.
    if (!release.description) {
      const list = document.createElement('ul');
      for (const change of changes.slice(1)) appendText(list, 'li', change);
      if (list.children.length) current.append(list);
    }
    let trigger: HTMLElement | null = null;
    let timer: number | undefined;
    const cleanup = () => {
      window.clearTimeout(timer);
      if (dialog.open) dialog.close();
      dialog.remove();
    };
    const close = () => {
      cleanup();
      if (trigger?.isConnected) trigger.focus();
    };
    dialog
      .querySelectorAll('button')
      .forEach((button) => button.addEventListener('click', close));
    dialog.addEventListener('cancel', (event) => {
      event.preventDefault();
      close();
    });
    signal.addEventListener('abort', cleanup, { once: true });
    const show = () => {
      if (signal.aborted || !shell.isConnected) return cleanup();
      // Outra aba ou inicialização pode ter exibido o aviso enquanto aguardávamos.
      try {
        if (alreadyShown()) return cleanup();
      } catch {
        return cleanup();
      }
      // Aguarda avisos de formulário/login antes de apresentar as novidades.
      if (document.querySelector('.modal-overlay.open, dialog[open]')) {
        timer = window.setTimeout(show, 300);
        return;
      }
      trigger = document.activeElement as HTMLElement;
      document.body.append(dialog);
      dialog.showModal();
      shownLogins.add(loginId);
      try {
        localStorage.setItem(storageKey, loginId);
      } catch {
        // Se o armazenamento ficar indisponível, mantém a marca em memória.
      }
    };
    timer = window.setTimeout(show, 500);
  } catch {
    // Uma falha ao consultar novidades não interrompe o uso do painel.
  }
}

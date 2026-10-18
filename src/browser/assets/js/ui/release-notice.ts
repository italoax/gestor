import { showPanelNotice } from './panel-feedback.js';
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
  const alreadyShown = () => {
    if (shownLogins.has(loginId)) return true;
    try {
      return localStorage.getItem(storageKey) === loginId;
    } catch {
      return false;
    }
  };
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

    let timer: number | undefined;
    const show = () => {
      if (signal.aborted || !shell.isConnected || alreadyShown()) return;
      if (
        document.querySelector(
          '.modal-overlay.open, dialog[open], .panel-notice:not(.is-inline)',
        )
      ) {
        timer = window.setTimeout(show, 300);
        return;
      }
      showPanelNotice(
        typeof release.description === 'string' && release.description.trim()
          ? release.description
          : changes.join('\n'),
        false,
        {
          title: typeof release.title === 'string' ? release.title : changes[0],
          info: true,
          autoClose: false,
        },
      );
      shownLogins.add(loginId);
      try {
        localStorage.setItem(storageKey, loginId);
      } catch {}
    };
    signal.addEventListener('abort', () => window.clearTimeout(timer), {
      once: true,
    });
    timer = window.setTimeout(show, 500);
  } catch {
    // Uma falha ao consultar novidades não interrompe o uso do painel.
  }
}

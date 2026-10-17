// Somente interação real gera POST. A consulta de expiração é somente leitura.
const activitySessions = new Map<
  string,
  { lastSentAt: number; interactionAt: number; sentInteractionAt: number }
>();

export function initSessionActivity(shell: HTMLElement, signal: AbortSignal) {
  let expiresAt = Number(shell?.dataset.sessionExpiresAt);
  if (!Number.isFinite(expiresAt) || expiresAt <= 0 || signal.aborted) return;
  const minInterval = 30_000;
  const login = shell.dataset.releaseLogin || 'panel';
  const storageKey = 'gestor-session-activity:' + login;
  const activity = activitySessions.get(login) || {
    lastSentAt: 0,
    interactionAt: 0,
    sentInteractionAt: 0,
  };
  activitySessions.set(login, activity);
  const lastSentAt = () => {
    try {
      const saved = Number(localStorage.getItem(storageKey));
      if (Number.isFinite(saved) && saved > 0 && saved <= Date.now())
        activity.lastSentAt = Math.max(activity.lastSentAt, saved);
    } catch {
      // Mantém o intervalo entre telas mesmo sem armazenamento disponível.
    }
    return activity.lastSentAt;
  };
  const canFetch = () =>
    !document.hidden && (window.gestorPolling?.canFetch() ?? true);
  let sending = false;
  let checking = false;
  let expiryTimer: number | undefined;
  let activityTimer: number | undefined;

  const armExpiry = (delay = Math.max(250, expiresAt - Date.now())) => {
    window.clearTimeout(expiryTimer);
    if (!signal.aborted) expiryTimer = window.setTimeout(checkExpiry, delay);
  };
  const readResponse = async (response: Response) => {
    window.gestorPolling?.recordResponse(response);
    if (signal.aborted) return;
    if (response.status === 401 || response.status === 403) {
      window.location.replace('/login');
      return;
    }
    if (!response.ok) throw new Error('Session unavailable');
    const data = await response.json();
    if (!signal.aborted && data.ok && Number.isFinite(data.expiresAt)) {
      expiresAt = Number.isFinite(data.remainingMs)
        ? Date.now() + Math.max(0, data.remainingMs)
        : data.expiresAt;
      armExpiry();
    }
  };
  async function checkExpiry() {
    if (signal.aborted || checking) return;
    if (!canFetch()) return armExpiry(minInterval);
    checking = true;
    try {
      // Outra aba pode estar em uso; confirme com o servidor antes de sair.
      await readResponse(
        await fetch('/api/session/activity', {
          credentials: 'same-origin',
          cache: 'no-store',
          redirect: 'error',
          headers: { Accept: 'application/json' },
          signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]),
        }),
      );
    } catch {
      // Falha de rede não é confirmação de que o login expirou.
      if (!signal.aborted) armExpiry(15000);
    } finally {
      checking = false;
    }
  }
  function queueActivity(minDelay = 0) {
    if (signal.aborted || activityTimer !== undefined) return;
    const delay = Math.max(minDelay, minInterval - (Date.now() - lastSentAt()));
    activityTimer = window.setTimeout(sendActivity, delay);
  }
  async function sendActivity() {
    activityTimer = undefined;
    if (
      signal.aborted ||
      sending ||
      activity.interactionAt <= activity.sentInteractionAt
    )
      return;
    if (!canFetch()) return queueActivity(minInterval);
    // Outra tela ou aba pode ter enviado enquanto este timer aguardava.
    if (Date.now() - lastSentAt() < minInterval) return queueActivity();
    sending = true;
    activity.lastSentAt = Date.now();
    const interactionAt = activity.interactionAt;
    activity.sentInteractionAt = interactionAt;
    try {
      // Somente o horário é compartilhado; não armazena dados da sessão.
      localStorage.setItem(storageKey, String(activity.lastSentAt));
    } catch {}
    try {
      await readResponse(
        await fetch('/api/session/activity', {
          method: 'POST',
          credentials: 'same-origin',
          cache: 'no-store',
          redirect: 'error',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            'x-csrf-token':
              document
                .querySelector('meta[name="csrf-token"]')
                ?.getAttribute('content') || '',
          },
          // Desconta a espera do envio: a pausa não conta como atividade.
          body: JSON.stringify({ idleForMs: Date.now() - interactionAt }),
          signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]),
        }),
      );
    } catch {
      // O próximo gesto pode tentar novamente, respeitando o intervalo.
    } finally {
      sending = false;
      if (activity.interactionAt > interactionAt) queueActivity();
    }
  }
  const onInteraction = (event: Event) => {
    if (!event.isTrusted || document.hidden || signal.aborted) return;
    activity.interactionAt = Date.now();
    queueActivity();
  };
  for (const type of [
    'pointerdown',
    'pointermove',
    'keydown',
    'input',
    'scroll',
  ])
    document.addEventListener(type, onInteraction, {
      signal,
      passive: true,
      capture: true,
    });
  const onResume = () => {
    if (!document.hidden && Date.now() >= expiresAt) void checkExpiry();
  };
  window.addEventListener('focus', onResume, { signal });
  window.addEventListener('pageshow', onResume, { signal });
  document.addEventListener('visibilitychange', onResume, { signal });
  signal.addEventListener(
    'abort',
    () => {
      window.clearTimeout(expiryTimer);
      window.clearTimeout(activityTimer);
    },
    { once: true },
  );
  armExpiry();
  // Uma navegação não apaga o último gesto nem reinicia a frequência de envio.
  if (activity.interactionAt > activity.sentInteractionAt) queueActivity();
}

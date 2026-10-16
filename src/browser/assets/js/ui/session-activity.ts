// Somente interação real gera POST. A consulta de expiração é somente leitura.
export function initSessionActivity(shell: HTMLElement, signal: AbortSignal) {
  let expiresAt = Number(shell?.dataset.sessionExpiresAt);
  if (!Number.isFinite(expiresAt) || expiresAt <= 0 || signal.aborted) return;
  const minInterval = 30_000;
  let lastInteractionAt = 0;
  let lastSentAt = 0;
  let sending = false;
  let checking = false;
  let expiryTimer: number | undefined;
  let activityTimer: number | undefined;

  const armExpiry = (delay = Math.max(250, expiresAt - Date.now())) => {
    window.clearTimeout(expiryTimer);
    if (!signal.aborted) expiryTimer = window.setTimeout(checkExpiry, delay);
  };
  const readResponse = async (response: Response) => {
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
  function queueActivity() {
    if (signal.aborted || activityTimer !== undefined) return;
    const delay = Math.max(0, minInterval - (Date.now() - lastSentAt));
    activityTimer = window.setTimeout(sendActivity, delay);
  }
  async function sendActivity() {
    activityTimer = undefined;
    if (signal.aborted || sending || !lastInteractionAt) return;
    sending = true;
    lastSentAt = Date.now();
    const interactionAt = lastInteractionAt;
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
      if (lastInteractionAt > interactionAt) queueActivity();
    }
  }
  const onInteraction = (event: Event) => {
    if (!event.isTrusted || document.hidden || signal.aborted) return;
    lastInteractionAt = Date.now();
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
}

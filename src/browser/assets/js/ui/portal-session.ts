function returnToHome() {
  try {
    if (
      window.top !== window &&
      window.top.location.origin === location.origin
    ) {
      window.top.location.replace('/');
      return;
    }
  } catch {
    /* Portais incorporados em outro domínio navegam apenas seu frame. */
  }
  location.replace('/');
}

export function watchPortalSession(onRevoked = returnToHome) {
  let ended = false;
  let stream: EventSource | undefined;
  let request: AbortController | undefined;
  const revoked = () => {
    if (ended) return;
    stop();
    onRevoked();
  };
  const check = async () => {
    if (ended || request) return;
    const controller = new AbortController();
    request = controller;
    try {
      const response = await fetch('/area-cliente/sessao?check=1', {
        headers: { Accept: 'application/json', 'x-gestor-background': '1' },
        cache: 'no-store',
        signal: AbortSignal.any([
          controller.signal,
          AbortSignal.timeout(10000),
        ]),
      });
      if (response.status === 401 && (await response.json()).active === false)
        revoked();
    } catch {
      /* Uma falha de rede não confirma revogação. */
    } finally {
      if (request === controller) request = undefined;
    }
  };
  const connect = () => {
    if (ended || stream) return;
    stream = new EventSource('/area-cliente/sessao');
    stream.addEventListener('revoked', revoked);
    stream.onerror = () => {
      void check();
    };
  };
  const visible = () => {
    if (!document.hidden) {
      connect();
      void check();
    }
  };
  const hide = () => {
    stream?.close();
    stream = undefined;
    request?.abort();
    request = undefined;
  };
  const restore = () => {
    connect();
    void check();
  };
  function stop() {
    ended = true;
    hide();
    window.removeEventListener('pagehide', hide);
    window.removeEventListener('pageshow', restore);
    window.removeEventListener('online', restore);
    document.removeEventListener('visibilitychange', visible);
  }
  window.addEventListener('pagehide', hide);
  window.addEventListener('pageshow', restore);
  window.addEventListener('online', restore);
  document.addEventListener('visibilitychange', visible);
  connect();
  return stop;
}

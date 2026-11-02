// Executado pelo layout autenticado antes de renderizar o cabeçalho. Apenas
// restaura uma indicação visual recente; a API continua confirmando o estado.
export function panelStatusBootstrap(userId: string | number): string {
  const key = JSON.stringify(`gestor:wa-state:${userId}`).replace(
    /</g,
    '\\u003c',
  );
  return `(() => {
    const root = document.documentElement;
    root.removeAttribute('data-wa-cached');
    try {
      const cached = JSON.parse(sessionStorage.getItem(${key}) || 'null');
      const age = Date.now() - cached?.at;
      if (typeof cached?.connected === 'boolean' && Number.isFinite(cached.at) && age >= 0 && age < 120000)
        root.setAttribute('data-wa-cached', cached.connected ? 'connected' : 'disconnected');
    } catch {}
  })();`;
}

const fallback = 'Não foi possível entrar. Tente novamente.';

export async function submitPortalLogin(payload, signal) {
  let response;
  try {
    response = await fetch('/area-cliente/login', {
      method: 'POST',
      headers: { Accept: 'application/json' },
      body: payload,
      redirect: 'manual',
      signal,
    });
  } catch {
    if (signal.aborted) throw signal.reason;
    throw new Error(
      'Não foi possível conectar. Confira sua conexão e tente novamente.',
    );
  }
  // The browser applies the session cookie before following this redirect.
  if (response.type === 'opaqueredirect') return;
  if (response.status === 429)
    throw new Error('Muitas tentativas. Aguarde 15 minutos.');
  if (response.status === 403)
    throw new Error(
      'Sua sessão expirou. Recarregue a página e tente novamente.',
    );
  let result;
  try {
    if (!response.headers.get('content-type')?.includes('application/json'))
      throw new Error();
    result = await response.json();
  } catch {
    if (signal.aborted) throw signal.reason;
    throw new Error(fallback);
  }
  throw new Error(
    response.status === 401 && typeof result?.erro === 'string' && result.erro
      ? result.erro
      : fallback,
  );
}

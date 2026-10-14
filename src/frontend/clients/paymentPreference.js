const url = '/clientes/preferencias/mensagem-pagamento';

// Uma conta compartilha a preferência entre dispositivos. Leituras antigas não
// podem substituir a última escolha; uma nova leitura espera a gravação corrente.
export function createPaymentPreferenceClient({
  messages,
  csrfToken,
  onState = () => {},
  fetchImpl = fetch,
}) {
  let state = { value: '', pending: false, ready: false, error: '' };
  let revision = 0;
  let disposed = false;
  let reading;
  let writing = Promise.resolve();
  const publish = (patch) => {
    state = { ...state, ...patch };
    if (!disposed) onState(state);
  };
  async function request(method, value, signal) {
    const options = {
      method,
      cache: 'no-store',
      signal,
      headers: { 'X-Requested-With': 'XMLHttpRequest' },
    };
    if (method === 'POST') {
      options.headers['Content-Type'] = 'application/json';
      options.headers['x-csrf-token'] = csrfToken;
      options.body = JSON.stringify({ mensagemId: value });
    }
    const response = await fetchImpl(url, options);
    if (!response.ok)
      throw new Error(
        'Não foi possível sincronizar a mensagem. Tente novamente.',
      );
    const data = await response.json();
    if (!Object.hasOwn(data, 'mensagemId'))
      throw new Error(
        'Não foi possível sincronizar a mensagem. Tente novamente.',
      );
    const result = data.mensagemId == null ? '' : String(data.mensagemId);
    if (result && !messages.some((message) => String(message.id) === result))
      throw new Error('A lista de mensagens mudou. Recarregue a página.');
    return result;
  }
  async function synchronize(method = 'GET', value = state.value) {
    if (disposed) return false;
    const current = ++revision;
    reading?.abort();
    publish({
      pending: true,
      ready: false,
      error: '',
      ...(method === 'POST' ? { value } : {}),
    });
    let operation;
    if (method === 'POST') {
      operation = writing
        .catch(() => {})
        .then(() => request(method, value, AbortSignal.timeout(15000)));
      writing = operation;
    } else {
      reading = new AbortController();
      const signal = AbortSignal.any([
        reading.signal,
        AbortSignal.timeout(15000),
      ]);
      operation = writing
        .catch(() => {})
        .then(() => request(method, value, signal));
    }
    try {
      const result = await operation;
      if (disposed || current !== revision) return false;
      publish({ value: result, ready: true, pending: false });
      return true;
    } catch (error) {
      if (!disposed && current === revision)
        publish({
          pending: false,
          ready: false,
          error: /^(Não foi possível|A lista de mensagens)/.test(
            error.message || '',
          )
            ? error.message
            : 'Não foi possível sincronizar a mensagem. Tente novamente.',
        });
      return false;
    }
  }
  return {
    load: () => synchronize(),
    save: (value) => synchronize('POST', value),
    getState: () => state,
    dispose: () => {
      disposed = true;
      revision++;
      reading?.abort();
    },
  };
}

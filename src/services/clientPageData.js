// Dados compartilhados pela página Next e pela página EJS durante a migração.
export function createClientPageData(locals, { now = new Date() } = {}) {
  return JSON.parse(
    JSON.stringify({
      clientes: locals.clientes || [],
      planos: (locals.planos || []).map(
        ({ id, nome, ativo, creditoGastos, periodo, tipo }) => ({
          id,
          nome,
          ativo,
          creditoGastos,
          periodo,
          tipo,
        }),
      ),
      servidores: (locals.servidores || []).map(({ id, nome, valorCred }) => ({
        id,
        nome,
        valorCred,
      })),
      mensagens: (locals.mensagens || []).map(({ id, titulo, mensagem }) => ({
        id,
        titulo,
        mensagem,
      })),
      dispositivos: (locals.dispositivos || []).map((item) =>
        typeof item === 'string' ? item : item.nome,
      ),
      aplicativos: (locals.aplicativos || []).map((item) =>
        typeof item === 'string' ? item : item.nome,
      ),
      renovacoesPendentes: locals.renovacoesPendentes || [],
      noticeSuccess: locals.noticeSuccess || [],
      noticeError: locals.noticeError || [],
      csrfToken: locals.csrfToken || '',
      verArquivados: Boolean(locals.verArquivados),
      now: now.toISOString(),
    }),
  );
}

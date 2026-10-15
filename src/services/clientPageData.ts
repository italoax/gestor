// Dados compartilhados pela página Next e pela página EJS durante a migração.
const privateFields = new Set([
  'senha',
  'senha_enc',
  'senhaEnc',
  'portal_hash',
  'password_hash',
  'passwordHash',
  'credenciais',
  'access_token',
  'secret_key',
  'mp_access_token',
]);
function publicClientData(value) {
  if (Array.isArray(value)) return value.map(publicClientData);
  if (!value || typeof value !== 'object' || value instanceof Date)
    return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !privateFields.has(key))
      .map(([key, item]) => {
        if (key === 'plano_adicional' && typeof item === 'string') {
          try {
            return [key, JSON.stringify(publicClientData(JSON.parse(item)))];
          } catch {
            return [key, null];
          }
        }
        return [key, publicClientData(item)];
      }),
  );
}
export function createClientPageData(
  locals,
  { now = new Date() }: Record<string, any> = {},
) {
  return JSON.parse(
    JSON.stringify({
      clientes: (locals.clientes || []).map(publicClientData),
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

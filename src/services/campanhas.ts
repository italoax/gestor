import { normalizeDateInput } from './format.ts';
import { automationHistoryCutoff } from './automationHistory.ts';

export function lerCampanha(value) {
  if (value == null) return null;
  const config = typeof value === 'string' ? JSON.parse(value) : value;
  if (
    config?.versao !== 1 ||
    !['unico', 'semanal'].includes(config.modo) ||
    typeof config.mensagem !== 'string' ||
    !config.mensagem.trim() ||
    config.mensagem.length > 10000 ||
    (config.chave != null && !/^[a-f0-9-]{36}$/i.test(config.chave)) ||
    !Array.isArray(config.clientesIds) ||
    !config.clientesIds.length ||
    config.clientesIds.length > 1000 ||
    !config.clientesIds.every((id) => Number.isSafeInteger(id) && id > 0) ||
    (config.modo === 'unico' && !normalizeDateInput(config.data))
  )
    throw new Error('Configuração do envio automático inválida.');
  return {
    versao: 1,
    modo: config.modo,
    mensagem: config.mensagem,
    data: config.modo === 'unico' ? normalizeDateInput(config.data) : null,
    clientesIds: [...new Set<number>(config.clientesIds)],
    ...(config.chave ? { chave: config.chave } : {}),
  };
}

export function campanhaPodeExecutar(campanha, hoje, hora, horario) {
  if (campanhaExpirada(campanha, hoje)) return false;
  return (
    campanha.modo !== 'unico' ||
    hoje > campanha.data ||
    (hoje === campanha.data && hora >= horario)
  );
}

export function campanhaExpirada(campanha, hoje: string) {
  return (
    campanha?.modo === 'unico' && campanha.data < automationHistoryCutoff(hoje)
  );
}

export function dataReservaCampanha(value, hoje) {
  const campanha = lerCampanha(value);
  return campanha?.modo === 'unico' ? campanha.data : hoje;
}

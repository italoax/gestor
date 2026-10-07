// Logger estruturado minimalista (sem dependencia externa).
// Formato: [2026-07-04 17:30:00 -03] [INFO ] [tag] mensagem {meta}
// Nivel controlado por LOG_LEVEL (debug|info|warn|error), default "info".
// Motivacao: antes havia ~30 console.log/error crus espalhados, sem timestamp
// nem nivel — impossivel filtrar/diagnosticar em producao na Hostinger.
const ORDEM = { debug: 10, info: 20, warn: 30, error: 40 };
const nivelMinimo = (() => {
  const raw = String(process.env.LOG_LEVEL ?? 'info').toLowerCase();
  return ['debug', 'info', 'warn', 'error'].includes(raw) ? raw : 'info';
})();
// Timestamp em horario de Sao Paulo (mesmo fuso do resto do app) pra bater com
// vencimentos/cobrancas nos logs.
function agora() {
  const partes = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(new Date());
  // sv-SE ja devolve "2026-07-04 17:30:00"
  return `${partes} -03`;
}
function formatarMeta(meta) {
  if (meta === undefined || meta === null) return '';
  if (meta instanceof Error) return ` ${meta.stack ?? meta.message}`;
  if (typeof meta === 'string') return ` ${meta}`;
  try {
    return ` ${JSON.stringify(meta)}`;
  } catch {
    return ` ${String(meta)}`;
  }
}
function emitir(nivel, tag, msg, meta) {
  if (ORDEM[nivel] < ORDEM[nivelMinimo]) return;
  const linha = `[${agora()}] [${nivel.toUpperCase().padEnd(5)}] [${tag}] ${msg}${formatarMeta(meta)}`;
  if (nivel === 'error') console.error(linha);
  else if (nivel === 'warn') console.warn(linha);
  else console.log(linha);
}
// Cria um logger com uma tag fixa (ex.: "cron", "backup", "assinatura").
export function createLogger(tag) {
  return {
    debug: (msg, meta) => emitir('debug', tag, msg, meta),
    info: (msg, meta) => emitir('info', tag, msg, meta),
    warn: (msg, meta) => emitir('warn', tag, msg, meta),
    error: (msg, meta) => emitir('error', tag, msg, meta),
  };
}
// Logger geral pra uso avulso.
export const log = createLogger('app');

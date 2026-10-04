// Logger estruturado minimalista (sem dependencia externa).
// Formato: [2026-07-04 17:30:00 -03] [INFO ] [tag] mensagem {meta}
// Nivel controlado por LOG_LEVEL (debug|info|warn|error), default "info".
// Motivacao: antes havia ~30 console.log/error crus espalhados, sem timestamp
// nem nivel — impossivel filtrar/diagnosticar em producao na Hostinger.

type Nivel = "debug" | "info" | "warn" | "error";

const ORDEM: Record<Nivel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

const nivelMinimo: Nivel = (() => {
  const raw = String(process.env.LOG_LEVEL ?? "info").toLowerCase();
  return (["debug", "info", "warn", "error"] as Nivel[]).includes(raw as Nivel) ? (raw as Nivel) : "info";
})();

// Timestamp em horario de Sao Paulo (mesmo fuso do resto do app) pra bater com
// vencimentos/cobrancas nos logs.
function agora(): string {
  const partes = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "America/Sao_Paulo",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false,
  }).format(new Date());
  // sv-SE ja devolve "2026-07-04 17:30:00"
  return `${partes} -03`;
}

function formatarMeta(meta?: unknown): string {
  if (meta === undefined || meta === null) return "";
  if (meta instanceof Error) return ` ${meta.stack ?? meta.message}`;
  if (typeof meta === "string") return ` ${meta}`;
  try { return ` ${JSON.stringify(meta)}`; } catch { return ` ${String(meta)}`; }
}

function emitir(nivel: Nivel, tag: string, msg: string, meta?: unknown) {
  if (ORDEM[nivel] < ORDEM[nivelMinimo]) return;
  const linha = `[${agora()}] [${nivel.toUpperCase().padEnd(5)}] [${tag}] ${msg}${formatarMeta(meta)}`;
  if (nivel === "error") console.error(linha);
  else if (nivel === "warn") console.warn(linha);
  else console.log(linha);
}

export interface Logger {
  debug(msg: string, meta?: unknown): void;
  info(msg: string, meta?: unknown): void;
  warn(msg: string, meta?: unknown): void;
  error(msg: string, meta?: unknown): void;
}

// Cria um logger com uma tag fixa (ex.: "cron", "backup", "assinatura").
export function createLogger(tag: string): Logger {
  return {
    debug: (msg, meta) => emitir("debug", tag, msg, meta),
    info: (msg, meta) => emitir("info", tag, msg, meta),
    warn: (msg, meta) => emitir("warn", tag, msg, meta),
    error: (msg, meta) => emitir("error", tag, msg, meta),
  };
}

// Logger geral pra uso avulso.
export const log = createLogger("app");

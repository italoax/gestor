import { setTimeout as sleep } from "node:timers/promises";
import { queryRows, queryOne, execute, withTransaction } from "../db/mysql.js";
import { env } from "../config/env.js";
import { appHhmm, appNowSql, appTodayIso, appWeekday } from "./dates.js";
import { enviarMensagemModeloComRetry, verificarConexaoSessao } from "./whatsapp.js";
import { ensureCobrancasEnviosSchema } from '../db/cobrancasEnviosSchema.js';
import { consultaDestinatariosCobranca, agruparAvisosCobranca, contextoAvisoCobranca, regraPorVencimento, mensagemCobrancaPorAcesso } from './cobrancaDestinatarios.js';
import type { PoolConnection, ResultSetHeader } from 'mysql2/promise';
import { getPixConfig } from "./pixConfig.js";
import { createLogger } from "./logger.js";
import type { RowDataPacket } from "mysql2";

const logger = createLogger("cron-cobrancas");

interface CobrancaAutoRow extends RowDataPacket {
  id: number; userId: number; tipo: string; periodo: number; mensagem: string | null; mediaTipo: string | null; mediaPath: string | null;
  horaEnvio: string | null; diasSemana: string | null; jaRodouHoje: number;
  minDelay: number | null; maxDelay: number | null; filtroServidor: string | null; filtroPlano: string | null;
  filtroArquivados: string | null;
  rodapeAntiban: number; envioLotes: number; loteTamanho: number | null; lotePausa: number | null;
}
interface ClienteRow extends RowDataPacket { id: number; nome: string; telefone: string; vencimento: Date | string; valor: number; plano: string; servidor: string; user: string | null; senha: string | null; pagamentoToken: string | null; acessoChave?: string; temMultiplosAcessos?: number; }
interface EnvioIdRow extends RowDataPacket { id: number; }

let timer: NodeJS.Timeout | null = null;
// Lock global compartilhado pelo cron interno (setInterval) e pelo endpoint
// público /__cron/cobrancas. Se um tick anterior ainda estiver rodando (envios
// espaçados por delay), o próximo tick retorna {skipped} em vez de empilhar
// execuções simultâneas que duplicariam mensagens.
let cronRodando = false;
const shutdownSignal = new AbortController();

export async function stopCobrancasCron() {
  shutdownSignal.abort();
  if (timer) clearInterval(timer);
  timer = null;
  while (cronRodando) await sleep(50);
}

async function esperarEnvio(ms: number) {
  try { await sleep(ms, undefined, { signal: shutdownSignal.signal }); }
  catch (error) { if (!shutdownSignal.signal.aborted) throw error; }
}


export function cronEstaRodando() { return cronRodando; }

// Intervalo aleatório entre cada envio para reduzir o risco de bloqueio do WhatsApp.
// Usa o min/max da própria regra (em segundos) se definidos; senão cai no padrão de WA_SEND_MIN/MAX_DELAY.
function delayEntreEnvios(minOverride?: number | null, maxOverride?: number | null) {
  const minSec = minOverride != null && Number.isFinite(minOverride)
    ? Math.max(0, minOverride)
    : (Number.isFinite(env.whatsapp.sendMinDelaySec) ? Math.max(0, env.whatsapp.sendMinDelaySec) : 3);
  const maxSec = maxOverride != null && Number.isFinite(maxOverride)
    ? Math.max(minSec, maxOverride)
    : (Number.isFinite(env.whatsapp.sendMaxDelaySec) ? Math.max(minSec, env.whatsapp.sendMaxDelaySec) : Math.max(minSec, 7));
  const minMs = minSec * 1_000;
  const maxMs = maxSec * 1_000;
  return minMs + Math.floor(Math.random() * (maxMs - minMs + 1));
}

export function startCobrancasCron() {
  if (env.localMode || shutdownSignal.signal.aborted || timer) return;
  timer = setInterval(() => {
    void executarCobrancasAutomaticas().catch((error) => logger.error("erro no cron de cobranças", error));
  }, 60_000);
}

export async function executarCobrancasAutomaticas(): Promise<{ skipped?: boolean }> {
  if (env.localMode || shutdownSignal.signal.aborted) return { skipped: true };
  // Lock unificado: cron interno e endpoint /__cron/cobrancas chamam essa função;
  // sem o check aqui, os dois podiam rodar ao mesmo tempo e duplicar envios.
  if (cronRodando) return { skipped: true };
  cronRodando = true;
  try {
    return await executarCobrancasAutomaticasInterno();
  } finally {
    cronRodando = false;
  }
}

async function executarCobrancasAutomaticasInterno(): Promise<{ skipped?: boolean }> {
  await ensureCobrancasEnviosTable();
  const now = new Date();
  const hhmm = appHhmm(now);
  const weekday = appWeekday(now);
  const today = appTodayIso(now);
  const cobrancas = await queryRows<CobrancaAutoRow>(
    `SELECT c.id, c.user_id AS userId, c.tipo, c.periodo, c.hora_envio AS horaEnvio, c.dias_semana AS diasSemana,
            (DATE(c.ultima_execucao) = :today) AS jaRodouHoje, c.min_delay AS minDelay, c.max_delay AS maxDelay,
            c.filtro_servidor AS filtroServidor, c.filtro_plano AS filtroPlano,
            c.filtro_arquivados AS filtroArquivados,
            c.rodape_antiban AS rodapeAntiban, c.envio_lotes AS envioLotes, c.lote_tamanho AS loteTamanho, c.lote_pausa AS lotePausa,
            m.mensagem, m.media_tipo AS mediaTipo, m.media_path AS mediaPath
       FROM cobrancas c LEFT JOIN mensagens m ON m.id = c.mensagem_id AND m.user_id = c.user_id
      WHERE c.automatica = 1 AND c.status = 'Ativo'`,
    { today },
  );
  for (const cobranca of cobrancas) {
    if (shutdownSignal.signal.aborted) return { skipped: true };
    // Robusto a minuto perdido / reinício: dispara no primeiro tick a partir da hora configurada.
    if (cobranca.horaEnvio && hhmm < String(cobranca.horaEnvio).slice(0, 5)) continue;
    if (!deveExecutarNoDia(cobranca.diasSemana, weekday)) continue;
    if (cobranca.jaRodouHoje) continue;
    const { from, params } = consultaDestinatariosCobranca(cobranca.userId, cobranca, appTodayIso(now));
    const clientes = agruparAvisosCobranca(await queryRows<ClienteRow>(`SELECT * ${from} ORDER BY id, acessoChave = 'principal' DESC`, params), cobranca);
    // Sessão do WhatsApp = dispositivo principal do usuário (não o servidor do cliente).
    const sessaoWa = (await queryRows<RowDataPacket & { sessao: string }>(
      "SELECT sessao FROM whatsapp_devices WHERE user_id = :userId ORDER BY principal DESC, id ASC LIMIT 1",
      { userId: cobranca.userId },
    ))[0]?.sessao ?? "";
    // Se o usuário não tem nenhum dispositivo cadastrado, pula a regra inteira —
    // antes caía no session "default" e mandava pelo dispositivo de outra conta.
    if (!sessaoWa) {
      logger.warn(`regra ${cobranca.id} sem dispositivo WhatsApp do usuário ${cobranca.userId}; pulando`);
      continue;
    }
    // Config PIX do dono da regra — alimenta a tag {pix} nas mensagens automaticas.
    // Buscada 1x por cobranca (o service cacheia 60s de qualquer forma).
    const pixCfg = await getPixConfig(cobranca.userId);
    let enviadosNestaCobranca = 0;
    let falhasSeguidas = 0;
    let circuitBreaker = false;
    for (const grupo of clientes) {
      if (shutdownSignal.signal.aborted) return { skipped: true };

      // Espaça os envios (menos antes do primeiro) para não disparar em rajada.
      if (enviadosNestaCobranca > 0) await esperarEnvio(delayEntreEnvios(cobranca.minDelay, cobranca.maxDelay));
      // Envio em lotes: a cada N mensagens, pausa o tempo configurado antes de continuar.
      if (cobranca.envioLotes && enviadosNestaCobranca > 0) {
        const tamanho = Math.max(1, Number(cobranca.loteTamanho) || 20);
        if (enviadosNestaCobranca % tamanho === 0) {
          const pausaSec = Math.max(0, Number(cobranca.lotePausa) || 60);
          if (pausaSec > 0) await esperarEnvio(pausaSec * 1_000);
        }
      }
      if (shutdownSignal.signal.aborted) return { skipped: true };
      const reservados = await reservarGrupoCobranca(cobranca, grupo.acessosCobranca, now);
      if (!reservados.length) continue;
      const acessos = reservados.map(r => r.cliente);
      const cliente = { ...contextoAvisoCobranca(acessos), acessosCobranca: acessos };
      enviadosNestaCobranca += 1;

      // Cada mensagem já fica diferente pelos placeholders ({nome}, {vencimento}, {valor}…),
      // então não precisamos de rodapé anti-ban — o conteúdo nunca é idêntico entre clientes.
      const mensagemBase = cobranca.mensagem || "Olá {nome}, seu plano {plano} vence em {vencimento}. Valor: {valor}.";

      const result = await enviarMensagemModeloComRetry(sessaoWa, cliente, {
        mensagem: regraPorVencimento(cobranca) ? mensagemCobrancaPorAcesso(mensagemBase, cliente) : mensagemBase,
        mediaTipo: cobranca.mediaTipo,
        mediaPath: cobranca.mediaPath,
      }, undefined, undefined, pixCfg);
      await finalizarGrupoCobranca(reservados.map(r => r.id), result.ok, result.error);

      // Circuit-breaker: 5 erros seguidos = WhatsApp provavelmente caiu/banido.
      // Pausa a regra (status 'Pausada' não bate no WHERE do cron) pra não
      // continuar martelando e piorar a situação.
      if (result.ok) {
        falhasSeguidas = 0;
      } else {
        falhasSeguidas += 1;
        if (falhasSeguidas >= 5) { circuitBreaker = true; break; }
      }
    }
    if (circuitBreaker) {
      await execute(
        "UPDATE cobrancas SET status = 'Pausada' WHERE id = :id",
        { id: cobranca.id },
      );
      console.warn(`Regra ${cobranca.id} pausada por 5 falhas seguidas de envio.`);
    }
    if (shutdownSignal.signal.aborted) return { skipped: true };
    await execute("UPDATE cobrancas SET ultima_execucao = :ultimaExecucao WHERE id = :id", { id: cobranca.id, ultimaExecucao: appNowSql(now) });
  }
  return {};
}

// Disparo manual de uma regra (botão "▶" no card da automação). Ignora hora_envio,
// dias da semana e ultima_execucao do dia, mas continua passando pela reserva em
// cobrancas_envios — então clientes que já receberam hoje por essa regra não
// recebem duas vezes (segura contra cliques duplos no botão).
export async function dispararRegraManual(userId: number, regraId: number): Promise<{
  ok: boolean; enviados?: number; elegiveis?: number; error?: string;
}> {
  await ensureCobrancasEnviosTable();
  const cobranca = await queryOne<CobrancaAutoRow>(
    `SELECT c.id, c.user_id AS userId, c.tipo, c.periodo, c.hora_envio AS horaEnvio, c.dias_semana AS diasSemana,
            0 AS jaRodouHoje, c.min_delay AS minDelay, c.max_delay AS maxDelay,
            c.filtro_servidor AS filtroServidor, c.filtro_plano AS filtroPlano,
            c.filtro_arquivados AS filtroArquivados,
            c.rodape_antiban AS rodapeAntiban, c.envio_lotes AS envioLotes, c.lote_tamanho AS loteTamanho, c.lote_pausa AS lotePausa,
            m.mensagem, m.media_tipo AS mediaTipo, m.media_path AS mediaPath
       FROM cobrancas c LEFT JOIN mensagens m ON m.id = c.mensagem_id AND m.user_id = c.user_id
      WHERE c.id = :regraId AND c.user_id = :userId
      LIMIT 1`,
    { regraId, userId },
  );
  if (!cobranca) return { ok: false, error: "Regra não encontrada." };

  const now = new Date();
  const { from, params } = consultaDestinatariosCobranca(userId, cobranca, appTodayIso(now));
  const clientes = agruparAvisosCobranca(await queryRows<ClienteRow>(`SELECT * ${from} ORDER BY id, acessoChave = 'principal' DESC`, params), cobranca);
  const sessaoWa = (await queryRows<RowDataPacket & { sessao: string }>(
    "SELECT sessao FROM whatsapp_devices WHERE user_id = :userId ORDER BY principal DESC, id ASC LIMIT 1",
    { userId },
  ))[0]?.sessao ?? "";
  if (!sessaoWa) return { ok: false, error: "Cadastre um dispositivo em WhatsApp antes de disparar a regra." };
  const pixCfg = await getPixConfig(userId);

  // Pré-check: se o WhatsApp está desconectado, falha cedo sem reservar nada.
  // Evita marcar clientes como "erro" desnecessariamente quando o usuário só
  // precisa reconectar antes.
  const conexao = await verificarConexaoSessao(sessaoWa);
  if (!conexao.connected) {
    return { ok: false, error: conexao.error || "WhatsApp desconectado. Reconecte antes de disparar." };
  }

  let tentativasNestaCobranca = 0;
  let enviadosNestaCobranca = 0;
  let falhasSeguidas = 0;
  let circuitBreaker = false;
  for (const grupo of clientes) {
    const reservados = await reservarGrupoCobranca(cobranca, grupo.acessosCobranca, now);
    if (!reservados.length) continue;
    const acessos = reservados.map(r => r.cliente);
    const cliente = { ...contextoAvisoCobranca(acessos), acessosCobranca: acessos };

    if (tentativasNestaCobranca > 0) await sleep(delayEntreEnvios(cobranca.minDelay, cobranca.maxDelay));
    if (cobranca.envioLotes && tentativasNestaCobranca > 0) {
      const tamanho = Math.max(1, Number(cobranca.loteTamanho) || 20);
      if (tentativasNestaCobranca % tamanho === 0) {
        const pausaSec = Math.max(0, Number(cobranca.lotePausa) || 60);
        if (pausaSec > 0) await sleep(pausaSec * 1_000);
      }
    }
    tentativasNestaCobranca += 1;

    const mensagemBase = cobranca.mensagem || "Olá {nome}, seu plano {plano} vence em {vencimento}. Valor: {valor}.";
    const result = await enviarMensagemModeloComRetry(sessaoWa, cliente, {
      mensagem: regraPorVencimento(cobranca) ? mensagemCobrancaPorAcesso(mensagemBase, cliente) : mensagemBase,
      mediaTipo: cobranca.mediaTipo,
      mediaPath: cobranca.mediaPath,
    }, undefined, undefined, pixCfg);
    await finalizarGrupoCobranca(reservados.map(r => r.id), result.ok, result.error);

    if (result.ok) {
      enviadosNestaCobranca += 1;
      falhasSeguidas = 0;
    } else {
      falhasSeguidas += 1;
      if (falhasSeguidas >= 5) { circuitBreaker = true; break; }
    }
  }
  if (circuitBreaker) {
    await execute("UPDATE cobrancas SET status = 'Pausada' WHERE id = :id", { id: cobranca.id });
  }
  await execute("UPDATE cobrancas SET ultima_execucao = :ultimaExecucao WHERE id = :id", { id: cobranca.id, ultimaExecucao: appNowSql(now) });
  return {
    ok: !circuitBreaker,
    enviados: enviadosNestaCobranca,
    elegiveis: clientes.length,
    error: circuitBreaker ? "Regra pausada: 5 falhas seguidas de envio. Reative depois de checar a conexão do WhatsApp." : undefined,
  };
}

async function reservarGrupoCobranca(cobranca: CobrancaAutoRow, clientes: ClienteRow[], now: Date) {
  const reservar = async (conn?: PoolConnection) => {
    const reservas: { id: number; cliente: ClienteRow }[] = [];
    for (const cliente of clientes) {
      const chave = regraPorVencimento(cobranca) ? cliente.acessoChave || 'principal' : 'principal';
      const id = await reservarEnvioCobranca(cobranca.id, cliente.id, now, chave, conn);
      if (id) reservas.push({ id, cliente });
    }
    return reservas;
  };
  if (clientes.length === 1) return reservar();
  // Reserva todos os acessos juntos antes do envio, inclusive em disparos simultâneos.
  return withTransaction(async conn => {
    const [rows] = await conn.query<RowDataPacket[]>('SELECT id FROM clientes WHERE id = :id AND user_id = :userId FOR UPDATE', { id: clientes[0].id, userId: cobranca.userId });
    if (!rows.length) return [];
    return reservar(conn);
  });
}

export async function ensureCobrancasEnviosTable() {
  await ensureCobrancasEnviosSchema();
}

export async function reservarEnvioCobranca(cobrancaId: number, clienteId: number, now = new Date(), acessoChave = 'principal', conn?: PoolConnection) {
  await ensureCobrancasEnviosTable();
  const dataEnvio = appTodayIso(now);
  const executar = conn ? async (sql: string, params: Record<string, string | number>) => (await conn.execute<ResultSetHeader>(sql, params))[0] : execute;
  const buscar = conn ? async (sql: string, params: Record<string, string | number>) => (await conn.query<EnvioIdRow[]>(sql, params))[0][0] : queryOne<EnvioIdRow>;
  const insert = await executar(
    `INSERT IGNORE INTO cobrancas_envios (cobranca_id, cliente_id, acesso_chave, data_envio, status)
     VALUES (:cobrancaId, :clienteId, :acessoChave, :dataEnvio, 'pendente')`,
    { cobrancaId, clienteId, acessoChave, dataEnvio },
  );
  if (insert.affectedRows > 0) return insert.insertId;

  // Já houve tentativa hoje: só re-tenta se a anterior falhou (status 'erro').
  // Nunca reenvia para quem já recebeu ('enviado').
  const retry = await executar(
    `UPDATE cobrancas_envios SET status = 'pendente', erro = NULL
      WHERE cobranca_id = :cobrancaId AND cliente_id = :clienteId AND acesso_chave = :acessoChave
        AND data_envio = :dataEnvio AND status = 'erro'`,
    { cobrancaId, clienteId, acessoChave, dataEnvio },
  );
  if (retry.affectedRows === 0) return 0;

  const row = await buscar(
    `SELECT id FROM cobrancas_envios
      WHERE cobranca_id = :cobrancaId AND cliente_id = :clienteId AND acesso_chave = :acessoChave AND data_envio = :dataEnvio LIMIT 1`,
    { cobrancaId, clienteId, acessoChave, dataEnvio },
  );
  return row?.id ?? 0;
}

async function finalizarGrupoCobranca(ids: number[], enviado: boolean, erro?: string) {
  if (ids.length === 1) return finalizarEnvioCobranca(ids[0], enviado, erro);
  const params: Record<string, string | number | null> = {
    status: enviado ? 'enviado' : 'erro',
    erro: enviado ? null : String(erro || 'Falha ao enviar mensagem').slice(0, 2000),
  };
  const placeholders = ids.map((id, i) => { params['id' + i] = id; return ':id' + i; });
  await execute('UPDATE cobrancas_envios SET status = :status, erro = :erro WHERE id IN (' + placeholders.join(',') + ')', params);
}

export async function finalizarEnvioCobranca(reservaId: number, enviado: boolean, erro?: string) {
  await execute(
    `UPDATE cobrancas_envios
        SET status = :status, erro = :erro
      WHERE id = :reservaId`,
    {
      reservaId,
      status: enviado ? "enviado" : "erro",
      erro: enviado ? null : String(erro || "Falha ao enviar mensagem").slice(0, 2000),
    },
  );
}

function valoresDiasSemana(dias: string | null) {
  return String(dias ?? "")
    .split(",")
    .filter((item) => item.trim() !== '')
    .map((item) => Number(item.trim()))
    .filter((item) => Number.isInteger(item));
}

function deveExecutarNoDia(dias: string | null, weekdayZeroBase: number) {
  const valores = valoresDiasSemana(dias);
  if (!valores.length) return true;

  // Formulário novo salva 0..6 (Dom..Sáb). Dados antigos/importados podem vir 1..7 (Seg..Dom).
  const pareceOneBase = valores.every((dia) => dia >= 1 && dia <= 7);
  const weekdayOneBase = weekdayZeroBase === 0 ? 7 : weekdayZeroBase;
  return pareceOneBase ? valores.includes(weekdayOneBase) : valores.includes(weekdayZeroBase);
}

function periodoAlvoPorTipo(tipo: string, periodo: number) {
  const tipoNormalizado = String(tipo ?? "").toLowerCase().trim();
  const dias = Math.abs(Number(periodo) || 0);

  if (tipoNormalizado === "vence hoje") return 0;
  if (tipoNormalizado === "vencidos") return -dias;
  if (tipoNormalizado === "vencimento") return dias;

  return Number(periodo) || 0;
}

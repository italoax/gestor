import { setTimeout as sleep } from "node:timers/promises";
import { queryRows, queryOne, execute } from "../db/mysql.js";
import { env } from "../config/env.js";
import { appHhmm, appNowSql, appTodayIso, appWeekday } from "./dates.js";
import { enviarMensagemModelo } from "./whatsapp.js";
import type { RowDataPacket } from "mysql2";

interface CobrancaAutoRow extends RowDataPacket {
  id: number; userId: number; tipo: string; periodo: number; mensagem: string | null; mediaTipo: string | null; mediaPath: string | null;
  horaEnvio: string | null; diasSemana: string | null; jaRodouHoje: number;
  minDelay: number | null; maxDelay: number | null; filtroServidor: string | null; filtroPlano: string | null;
  rodapeAntiban: number; envioLotes: number; loteTamanho: number | null; lotePausa: number | null;
}
interface ClienteRow extends RowDataPacket { id: number; nome: string; telefone: string; vencimento: Date | string; valor: number; plano: string; servidor: string; }
interface EnvioIdRow extends RowDataPacket { id: number; }

let timer: NodeJS.Timeout | null = null;
let running = false;
let enviosTableReady: Promise<void> | null = null;

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

// Monta a consulta de clientes-alvo conforme o tipo do gatilho + filtros opcionais da regra.
function montarConsultaClientes(cobranca: CobrancaAutoRow, today: string) {
  const tipo = String(cobranca.tipo ?? "").toLowerCase().trim();
  const params: Record<string, unknown> = { userId: cobranca.userId, today };
  let where = "user_id = :userId AND status = 'Ativo'";
  if (tipo === "todos") {
    // Toda a base ativa (sem filtro de data).
  } else if (tipo === "apos cadastro") {
    where += " AND DATEDIFF(:today, DATE(created_at)) = :periodoCadastro";
    params.periodoCadastro = Math.abs(Number(cobranca.periodo) || 0);
  } else {
    where += " AND DATEDIFF(vencimento, :today) = :periodoAlvo";
    params.periodoAlvo = periodoAlvoPorTipo(cobranca.tipo, cobranca.periodo);
  }
  if (cobranca.filtroServidor) { where += " AND servidor = :filtroServidor"; params.filtroServidor = cobranca.filtroServidor; }
  if (cobranca.filtroPlano) { where += " AND plano = :filtroPlano"; params.filtroPlano = cobranca.filtroPlano; }
  return { sql: `SELECT id, nome, telefone, vencimento, valor, plano, servidor FROM clientes WHERE ${where}`, params };
}

export function startCobrancasCron() {
  if (timer) return;
  timer = setInterval(() => {
    // Evita execuções sobrepostas: um ciclo pode demorar (delays entre envios).
    if (running) return;
    running = true;
    void executarCobrancasAutomaticas().catch((error) => console.error("Erro no cron de cobranças:", error)).finally(() => { running = false; });
  }, 60_000);
}

export async function executarCobrancasAutomaticas() {
  await ensureCobrancasEnviosTable();
  const now = new Date();
  const hhmm = appHhmm(now);
  const weekday = appWeekday(now);
  const today = appTodayIso(now);
  const cobrancas = await queryRows<CobrancaAutoRow>(
    `SELECT c.id, c.user_id AS userId, c.tipo, c.periodo, c.hora_envio AS horaEnvio, c.dias_semana AS diasSemana,
            (DATE(c.ultima_execucao) = :today) AS jaRodouHoje, c.min_delay AS minDelay, c.max_delay AS maxDelay,
            c.filtro_servidor AS filtroServidor, c.filtro_plano AS filtroPlano,
            c.rodape_antiban AS rodapeAntiban, c.envio_lotes AS envioLotes, c.lote_tamanho AS loteTamanho, c.lote_pausa AS lotePausa,
            m.mensagem, m.media_tipo AS mediaTipo, m.media_path AS mediaPath
       FROM cobrancas c LEFT JOIN mensagens m ON m.id = c.mensagem_id AND m.user_id = c.user_id
      WHERE c.automatica = 1 AND c.status = 'Ativo'`,
    { today },
  );
  for (const cobranca of cobrancas) {
    // Robusto a minuto perdido / reinício: dispara no primeiro tick a partir da hora configurada.
    if (cobranca.horaEnvio && hhmm < String(cobranca.horaEnvio).slice(0, 5)) continue;
    if (!deveExecutarNoDia(cobranca.diasSemana, weekday)) continue;
    if (cobranca.jaRodouHoje) continue;
    const { sql, params } = montarConsultaClientes(cobranca, appTodayIso(now));
    const clientes = await queryRows<ClienteRow>(sql, params);
    // Sessão do WhatsApp = dispositivo principal do usuário (não o servidor do cliente).
    const sessaoWa = (await queryRows<RowDataPacket & { sessao: string }>(
      "SELECT sessao FROM whatsapp_devices WHERE user_id = :userId ORDER BY principal DESC, id ASC LIMIT 1",
      { userId: cobranca.userId },
    ))[0]?.sessao ?? "";
    let enviadosNestaCobranca = 0;
    for (const cliente of clientes) {
      const reservaId = await reservarEnvioCobranca(cobranca.id, cliente.id, now);
      if (!reservaId) continue;

      // Espaça os envios (menos antes do primeiro) para não disparar em rajada.
      if (enviadosNestaCobranca > 0) await sleep(delayEntreEnvios(cobranca.minDelay, cobranca.maxDelay));
      // Envio em lotes: a cada N mensagens, pausa o tempo configurado antes de continuar.
      if (cobranca.envioLotes && enviadosNestaCobranca > 0) {
        const tamanho = Math.max(1, Number(cobranca.loteTamanho) || 20);
        if (enviadosNestaCobranca % tamanho === 0) {
          const pausaSec = Math.max(0, Number(cobranca.lotePausa) || 60);
          if (pausaSec > 0) await sleep(pausaSec * 1_000);
        }
      }
      enviadosNestaCobranca += 1;

      // Rodapé anti-ban: código único por mensagem para evitar detecção de spam (mensagens idênticas).
      let mensagemBase = cobranca.mensagem || "Olá {nome}, seu plano {plano} vence em {vencimento}. Valor: {valor}.";
      if (cobranca.rodapeAntiban) {
        const cod = Math.random().toString(16).slice(2, 8).toUpperCase();
        mensagemBase += `\n\n_Prot.: ${cod}_`;
      }

      const result = await enviarMensagemModelo(sessaoWa, cliente, {
        mensagem: mensagemBase,
        mediaTipo: cobranca.mediaTipo,
        mediaPath: cobranca.mediaPath,
      });
      await finalizarEnvioCobranca(reservaId, result.ok, result.error);
    }
    await execute("UPDATE cobrancas SET ultima_execucao = :ultimaExecucao WHERE id = :id", { id: cobranca.id, ultimaExecucao: appNowSql(now) });
  }
}

export async function ensureCobrancasEnviosTable() {
  if (!enviosTableReady) {
    enviosTableReady = execute(`CREATE TABLE IF NOT EXISTS cobrancas_envios (
      id INT AUTO_INCREMENT PRIMARY KEY,
      cobranca_id INT NOT NULL,
      cliente_id INT NOT NULL,
      data_envio DATE NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'pendente',
      erro TEXT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_cobranca_cliente_data (cobranca_id, cliente_id, data_envio),
      KEY idx_cobrancas_envios_cliente (cliente_id),
      KEY idx_cobrancas_envios_status (status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`).then(() => undefined);
  }
  return enviosTableReady;
}

export async function reservarEnvioCobranca(cobrancaId: number, clienteId: number, now = new Date()) {
  await ensureCobrancasEnviosTable();
  const dataEnvio = appTodayIso(now);
  const insert = await execute(
    `INSERT IGNORE INTO cobrancas_envios (cobranca_id, cliente_id, data_envio, status)
     VALUES (:cobrancaId, :clienteId, :dataEnvio, 'pendente')`,
    { cobrancaId, clienteId, dataEnvio },
  );
  if (insert.affectedRows > 0) return insert.insertId;

  // Já houve tentativa hoje: só re-tenta se a anterior falhou (status 'erro').
  // Nunca reenvia para quem já recebeu ('enviado').
  const retry = await execute(
    `UPDATE cobrancas_envios SET status = 'pendente', erro = NULL
      WHERE cobranca_id = :cobrancaId AND cliente_id = :clienteId
        AND data_envio = :dataEnvio AND status = 'erro'`,
    { cobrancaId, clienteId, dataEnvio },
  );
  if (retry.affectedRows === 0) return 0;

  const row = await queryOne<EnvioIdRow>(
    `SELECT id FROM cobrancas_envios
      WHERE cobranca_id = :cobrancaId AND cliente_id = :clienteId AND data_envio = :dataEnvio LIMIT 1`,
    { cobrancaId, clienteId, dataEnvio },
  );
  return row?.id ?? 0;
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

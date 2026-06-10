import { setTimeout as sleep } from "node:timers/promises";
import { queryRows, queryOne, execute } from "../db/mysql.js";
import { env } from "../config/env.js";
import { appHhmm, appMinuteKey, appNowSql, appTodayIso, appWeekday } from "./dates.js";
import { enviarMensagemModelo } from "./whatsapp.js";
import type { RowDataPacket } from "mysql2";

interface CobrancaAutoRow extends RowDataPacket { id: number; userId: number; tipo: string; periodo: number; mensagem: string | null; mediaTipo: string | null; mediaPath: string | null; horaEnvio: string | null; diasSemana: string | null; ultimaExecucao: Date | string | null; }
interface ClienteRow extends RowDataPacket { id: number; nome: string; telefone: string; vencimento: Date | string; valor: number; plano: string; servidor: string; }
interface EnvioIdRow extends RowDataPacket { id: number; }

let timer: NodeJS.Timeout | null = null;
let enviosTableReady: Promise<void> | null = null;

// Intervalo aleatório entre cada envio para reduzir o risco de bloqueio do WhatsApp.
// Configurável por WA_SEND_MIN_DELAY / WA_SEND_MAX_DELAY (em segundos).
function delayEntreEnvios() {
  const minSec = Number.isFinite(env.whatsapp.sendMinDelaySec) ? Math.max(0, env.whatsapp.sendMinDelaySec) : 3;
  const maxSec = Number.isFinite(env.whatsapp.sendMaxDelaySec) ? Math.max(minSec, env.whatsapp.sendMaxDelaySec) : Math.max(minSec, 7);
  const minMs = minSec * 1_000;
  const maxMs = maxSec * 1_000;
  return minMs + Math.floor(Math.random() * (maxMs - minMs + 1));
}

export function startCobrancasCron() {
  if (timer) return;
  timer = setInterval(() => { void executarCobrancasAutomaticas(); }, 60_000);
}

export async function executarCobrancasAutomaticas() {
  await ensureCobrancasEnviosTable();
  const now = new Date();
  const hhmm = appHhmm(now);
  const weekday = appWeekday(now);
  const currentMinuteKey = appMinuteKey(now);
  const cobrancas = await queryRows<CobrancaAutoRow>(
    `SELECT c.id, c.user_id AS userId, c.tipo, c.periodo, c.hora_envio AS horaEnvio, c.dias_semana AS diasSemana,
            c.ultima_execucao AS ultimaExecucao, m.mensagem, m.media_tipo AS mediaTipo, m.media_path AS mediaPath
       FROM cobrancas c LEFT JOIN mensagens m ON m.id = c.mensagem_id AND m.user_id = c.user_id
      WHERE c.automatica = 1 AND c.status = 'Ativo'`,
  );
  for (const cobranca of cobrancas) {
    if (cobranca.horaEnvio && String(cobranca.horaEnvio).slice(0, 5) !== hhmm) continue;
    if (!deveExecutarNoDia(cobranca.diasSemana, weekday)) continue;
    if (minuteKey(cobranca.ultimaExecucao) === currentMinuteKey) continue;
    const periodoAlvo = periodoAlvoPorTipo(cobranca.tipo, cobranca.periodo);
    const clientes = await queryRows<ClienteRow>(`SELECT id, nome, telefone, vencimento, valor, plano, servidor FROM clientes WHERE user_id = :userId AND DATEDIFF(vencimento, :today) = :periodoAlvo AND status = 'Ativo'`, { userId: cobranca.userId, periodoAlvo, today: appTodayIso(now) });
    let enviadosNestaCobranca = 0;
    for (const cliente of clientes) {
      const reservaId = await reservarEnvioCobranca(cobranca.id, cliente.id, now);
      if (!reservaId) continue;

      // Espaça os envios (menos antes do primeiro) para não disparar em rajada.
      if (enviadosNestaCobranca > 0) await sleep(delayEntreEnvios());
      enviadosNestaCobranca += 1;

      const result = await enviarMensagemModelo(cliente.servidor || "", cliente, {
        mensagem: cobranca.mensagem || "Olá {nome}, seu plano {plano} vence em {vencimento}. Valor: {valor}.",
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

function minuteKey(value: Date | string | null) {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${hh}:${min}`;
}

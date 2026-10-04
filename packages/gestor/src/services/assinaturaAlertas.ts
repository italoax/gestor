import { queryRows, execute } from "../db/mysql.js";
import { env } from "../config/env.js";
import { notificar } from "./notificacoes.js";
import { appTodayIso } from "./dates.js";
import { createLogger } from "./logger.js";
import type { RowDataPacket } from "mysql2";

// Alertas de vencimento da assinatura DO GESTOR. Avisa o usuario antes de a
// conta ser bloqueada, pra ele renovar a tempo (retencao). Dispara push +
// notificacao no sininho em marcos de dias antes/no dia do vencimento.
//
// Idempotencia: cada (user, vencimento, dias) so alerta uma vez, via INSERT na
// tabela assinatura_alertas (UNIQUE). O cron pode rodar a cada minuto sem spam.

const logger = createLogger("assinatura-alertas");

// Dias antes do vencimento em que avisamos. 0 = no proprio dia (vence hoje).
const MARCOS_DIAS = [3, 1, 0];

interface UserVencimentoRow extends RowDataPacket {
  id: number;
  name: string;
  vencimento: string; // YYYY-MM-DD
  diasFaltando: number;
}

function mensagemPorDias(dias: number): { titulo: string; mensagem: string } {
  if (dias <= 0) {
    return {
      titulo: "Sua assinatura vence hoje",
      mensagem: "Renove agora pra não perder o acesso ao gestor. Toque para pagar via PIX.",
    };
  }
  if (dias === 1) {
    return {
      titulo: "Sua assinatura vence amanhã",
      mensagem: "Falta 1 dia. Renove pra manter o acesso sem interrupção.",
    };
  }
  return {
    titulo: `Sua assinatura vence em ${dias} dias`,
    mensagem: `Faltam ${dias} dias pro vencimento. Renove com antecedência e evite bloqueio.`,
  };
}

/**
 * Verifica todos os usuarios com vencimento nos marcos configurados e dispara
 * o alerta uma unica vez por marco. Admin (is_admin=1) nunca expira, entao fica
 * de fora. Retorna quantos alertas foram efetivamente enviados neste tick.
 */
export async function enviarAlertasVencimento(): Promise<{ enviados: number }> {
  if (env.localMode) return { enviados: 0 };
  const today = appTodayIso();
  // Busca usuarios cujo vencimento cai exatamente em hoje+marco, pra cada marco.
  // DATEDIFF(vencimento, hoje) = dias que faltam. Filtra so os marcos que ligam.
  const rows = await queryRows<UserVencimentoRow>(
    `SELECT id, name,
            DATE_FORMAT(assinatura_vencimento, '%Y-%m-%d') AS vencimento,
            DATEDIFF(assinatura_vencimento, :today) AS diasFaltando
       FROM users
      WHERE is_admin = 0
        AND assinatura_vencimento IS NOT NULL
        AND DATEDIFF(assinatura_vencimento, :today) IN (${MARCOS_DIAS.join(",")})`,
    { today },
  );

  let enviados = 0;
  for (const u of rows) {
    const dias = Number(u.diasFaltando);
    // Marca como enviado ANTES de notificar. INSERT IGNORE: se ja existe a
    // linha (user+vencimento+dias), affectedRows=0 e a gente pula — evita
    // reenvio quando o cron roda de novo no mesmo dia.
    const res = await execute(
      `INSERT IGNORE INTO assinatura_alertas (user_id, vencimento, dias)
       VALUES (:userId, :vencimento, :dias)`,
      { userId: u.id, vencimento: u.vencimento, dias },
    );
    // mysql2 OkPacket.affectedRows: 1 = inseriu (primeira vez), 0 = ja existia.
    const inseriu = (res as { affectedRows?: number }).affectedRows === 1;
    if (!inseriu) continue;

    const { titulo, mensagem } = mensagemPorDias(dias);
    try {
      await notificar(u.id, {
        titulo,
        mensagem,
        tipo: "sistema",
        url: "/meu-plano",
        icone: "💳",
        // pushTag por marco: se ja tem um push desse marco na tela, substitui.
        pushTag: `assinatura-venc-${dias}`,
      });
      enviados++;
    } catch (error) {
      // Se a notificacao falhar, remove o marcador pra tentar de novo no
      // proximo tick (senao perdia o alerta silenciosamente).
      await execute(
        `DELETE FROM assinatura_alertas WHERE user_id = :userId AND vencimento = :vencimento AND dias = :dias`,
        { userId: u.id, vencimento: u.vencimento, dias },
      );
      logger.error(`falha ao alertar user=${u.id} dias=${dias}`, error);
    }
  }

  if (enviados > 0) logger.info(`alertas de vencimento enviados: ${enviados}`);
  return { enviados };
}

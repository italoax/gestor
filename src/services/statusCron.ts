import { setTimeout as sleep } from "node:timers/promises";
import { execute, queryRows } from "../db/mysql.js";
import { env } from "../config/env.js";
import { postarStatus } from "./whatsapp.js";
import { notificar } from "./notificacoes.js";
import type { RowDataPacket } from "mysql2";

interface AgendadoRow extends RowDataPacket {
  id: number;
  userId: number;
  tipo: string;
  texto: string | null;
  corFundo: string | null;
  fonte: number | null;
  mediaData: string | null;
  mediaUrl: string | null;
  legenda: string | null;
  sessao: string | null;
}

let timer: NodeJS.Timeout | null = null;
let rodando = false;
let stopping = false;

export async function stopStatusCron() {
  stopping = true;
  if (timer) clearInterval(timer);
  timer = null;
  while (rodando) await sleep(50);
}

export function startStatusCron() {
  if (env.localMode || stopping || timer) return;
  // A cada 30s: barato e dá precisão suficiente. Não precisa ser ao segundo —
  // status agendado para 14:30 publica entre 14:30 e 14:30:30.
  timer = setInterval(() => {
    void executarAgendados().catch((error) => console.error("Erro no cron de status:", error));
  }, 30_000);
}

export async function executarAgendados(): Promise<{ skipped?: boolean; postados?: number }> {
  if (env.localMode || stopping) return { skipped: true };
  if (rodando) return { skipped: true };
  rodando = true;
  try {
    // Pega todos os agendados vencidos (agendado_para <= NOW). Faz JOIN pra trazer
    // a sessão WhatsApp principal do dono junto, evitando 2 queries por linha.
    const due = await queryRows<AgendadoRow>(
      `SELECT s.id, s.user_id AS userId, s.tipo, s.texto, s.cor_fundo AS corFundo, s.fonte,
              s.media_data AS mediaData, s.media_url AS mediaUrl, s.legenda,
              (SELECT sessao FROM whatsapp_devices
                WHERE user_id = s.user_id
                ORDER BY principal DESC, id ASC LIMIT 1) AS sessao
         FROM whatsapp_status s
        WHERE s.status = 'agendado' AND s.agendado_para <= NOW()
        ORDER BY s.agendado_para ASC
        LIMIT 20`,
    );
    let postados = 0;
    for (const row of due) {
      if (stopping) break;
      // Marca como "publicando" antes de tentar — proteção extra contra dupla
      // publicação se um tick atrasou e outro pegou a mesma linha.
      const reservado = await execute(
        "UPDATE whatsapp_status SET status = 'publicando' WHERE id = :id AND status = 'agendado'",
        { id: row.id },
      );
      if (reservado.affectedRows === 0) continue;

      if (!row.sessao) {
        await execute(
          `UPDATE whatsapp_status
              SET status = 'erro', erro = 'Sem dispositivo WhatsApp cadastrado.', media_data = NULL
            WHERE id = :id`,
          { id: row.id },
        );
        continue;
      }

      try {
        const resultado = await postarStatus(row.sessao, {
          type: row.tipo as "text" | "image" | "video",
          text: row.texto,
          backgroundColor: row.corFundo,
          font: row.fonte,
          mediaUrl: row.mediaData, // data URL salvo no agendamento
          caption: row.legenda,
        });
        const destinatarios = resultado.ok && typeof resultado.response === "object" && resultado.response
          ? Number((resultado.response as { recipientCount?: number }).recipientCount ?? 0) || null
          : null;
        const skippedRecipientCount = resultado.ok && typeof resultado.response === "object" && resultado.response
          ? Number((resultado.response as { skippedRecipientCount?: number }).skippedRecipientCount ?? 0) || 0
          : 0;
        const aviso = skippedRecipientCount > 0
          ? `${skippedRecipientCount} contato(s) sem identificação ficaram fora desta publicação.` : null;
        await execute(
          `UPDATE whatsapp_status
              SET status = :status, erro = :erro, destinatarios = :destinatarios,
                  postado_em = :postadoEm, media_data = NULL
            WHERE id = :id`,
          {
            id: row.id,
            status: resultado.ok ? "postado" : "erro",
            erro: resultado.ok ? aviso : (resultado.error || "Falha desconhecida").slice(0, 2000),
            destinatarios,
            postadoEm: resultado.ok ? new Date().toISOString().slice(0, 19).replace("T", " ") : null,
          },
        );
        if (resultado.ok) {
          postados += 1;
          await notificar(row.userId, {
            titulo: "Status publicado",
            mensagem: `Seu status agendado foi publicado${destinatarios ? ` para ${destinatarios} contatos` : ""}.`,
            tipo: "status",
            icone: "📢",
            url: "/status",
            pushTag: `status-${row.id}`,
          }).catch(() => undefined);
        } else {
          await notificar(row.userId, {
            titulo: "Falha ao publicar status",
            mensagem: resultado.error || "Verifique a conexão do WhatsApp.",
            tipo: "status",
            icone: "⚠️",
            url: "/status",
            pushTag: `status-${row.id}`,
          }).catch(() => undefined);
        }
      } catch (error) {
        await execute(
          `UPDATE whatsapp_status
              SET status = 'erro', erro = :erro, media_data = NULL
            WHERE id = :id`,
          { id: row.id, erro: (error instanceof Error ? error.message : String(error)).slice(0, 2000) },
        );
        await notificar(row.userId, {
          titulo: "Erro ao publicar status",
          mensagem: error instanceof Error ? error.message : String(error),
          tipo: "status",
          icone: "⚠️",
          url: "/status",
          pushTag: `status-${row.id}`,
        }).catch(() => undefined);
      }
    }
    return { postados };
  } finally {
    rodando = false;
  }
}

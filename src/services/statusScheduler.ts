import { automationsEnabled } from '../security/automationPolicy.ts';
import { safeError } from '../security/safeError.ts';
import { setTimeout as sleep } from 'node:timers/promises';
import { execute, queryRows } from '../db/mysql.ts';
import { env } from '../config/env.ts';
import { postarStatus } from './whatsapp.ts';
import { notificar } from './notificacoes.ts';
import { removerStatusExpirados } from './statusRetention.ts';
import { removerStatusNoHorario } from './statusRemoval.ts';
let timer = null;
let rodando = false;
let stopping = false;
const sessionCooldowns = new Map<string, number>();
const STATUS_INTERVAL_MS = 5000;
export async function stopStatusScheduler() {
  stopping = true;
  if (timer) clearInterval(timer);
  timer = null;
  while (rodando) await sleep(50);
}
export function startStatusScheduler() {
  if (!automationsEnabled(env) || stopping || timer) return;
  // A cada 30s: barato e dá precisão suficiente. Não precisa ser ao segundo —
  // status agendado para 14:30 publica entre 14:30 e 14:30:30.
  const tick = () => {
    void executarAgendados().catch((error) =>
      console.error('Erro no agendador de status:', safeError(error)),
    );
  };
  timer = setInterval(tick, 30000);
  // Retoma também os agendamentos vencidos enquanto o serviço estava parado.
  tick();
}
export async function executarAgendados() {
  if (!automationsEnabled(env) || stopping) return { skipped: true };
  if (rodando) return { skipped: true };
  rodando = true;
  const remocoesTentadas = new Set<number>();
  try {
    await removerStatusExpirados();
    await removerStatusNoHorario(remocoesTentadas);
    for (const [session, until] of sessionCooldowns) {
      if (until <= Date.now()) sessionCooldowns.delete(session);
    }
    // As datas são gravadas em UTC; a comparação independe do fuso do MySQL.
    // Pega todos os agendados vencidos. Faz JOIN pra trazer
    // a sessão WhatsApp principal do dono junto, evitando 2 queries por linha.
    const due =
      await queryRows(`SELECT s.id, s.user_id AS userId, s.tipo, s.texto, s.cor_fundo AS corFundo, s.fonte,
              s.media_data AS mediaData, s.media_url AS mediaUrl, s.legenda,
              (SELECT sessao FROM whatsapp_devices
                WHERE user_id = s.user_id
                ORDER BY principal DESC, id ASC LIMIT 1) AS sessao
         FROM whatsapp_status s
        WHERE s.status = 'agendado' AND s.agendado_para <= UTC_TIMESTAMP()
        ORDER BY s.agendado_para ASC, s.id ASC
        LIMIT 20`);
    let postados = 0;
    for (let row of due) {
      if (stopping) break;
      const waitMs = (sessionCooldowns.get(row.sessao) ?? 0) - Date.now();
      if (waitMs > 0) await sleep(waitMs);
      if (stopping) break;
      // Marca como "publicando" antes de tentar — proteção extra contra dupla
      // publicação se um tick atrasou e outro pegou a mesma linha.
      const reservado = await execute(
        "UPDATE whatsapp_status SET status = 'publicando' WHERE id = :id AND status = 'agendado' AND agendado_para <= UTC_TIMESTAMP()",
        { id: row.id },
      );
      if (reservado.affectedRows === 0) continue;
      // A edição pode ocorrer depois de ler a fila. Releia após reservar para
      // enviar o conteúdo atualizado; o UPDATE acima respeita reagendamentos.
      const current = await queryRows(
        `SELECT tipo, texto, cor_fundo AS corFundo, fonte, media_data AS mediaData,
                media_url AS mediaUrl, legenda, remover_em AS removerEm FROM whatsapp_status
          WHERE id = :id AND status = 'publicando'`,
        { id: row.id },
      );
      if (!current.length) continue;
      row = { ...row, ...current[0] };
      if (
        row.removerEm &&
        new Date(String(row.removerEm).replace(' ', 'T') + 'Z').getTime() <=
          Date.now()
      ) {
        await execute(
          "UPDATE whatsapp_status SET status = 'erro', erro = 'O período de exibição terminou antes da publicação.' WHERE id = :id AND status = 'publicando'",
          { id: row.id },
        );
        continue;
      }
      if (!row.sessao) {
        await execute(
          `UPDATE whatsapp_status
              SET status = 'erro', erro = 'Sem dispositivo WhatsApp cadastrado.',
                  media_data = CASE WHEN tipo = 'image' THEN media_data ELSE NULL END
            WHERE id = :id`,
          { id: row.id },
        );
        continue;
      }
      try {
        const resultado = await postarStatus(row.sessao, {
          type: row.tipo,
          text: row.texto,
          backgroundColor: row.corFundo,
          font: row.fonte,
          mediaUrl: row.mediaData, // data URL salvo no agendamento
          caption: row.legenda,
        });
        const destinatarios =
          resultado.ok &&
          typeof resultado.response === 'object' &&
          resultado.response
            ? Number(resultado.response.recipientCount ?? 0) || null
            : null;
        const skippedRecipientCount =
          resultado.ok &&
          typeof resultado.response === 'object' &&
          resultado.response
            ? Number(resultado.response.skippedRecipientCount ?? 0) || 0
            : 0;
        const aviso =
          skippedRecipientCount > 0
            ? `${skippedRecipientCount} contato(s) sem identificação ficaram fora desta publicação.`
            : null;
        await execute(
          `UPDATE whatsapp_status
              SET status = :status, erro = :erro, destinatarios = :destinatarios,
                  postado_em = :postadoEm,
                  whatsapp_message_id = :messageId, whatsapp_sessao = :sessao,
                  whatsapp_contexto = :contexto,
                  media_data = CASE WHEN tipo = 'image' THEN media_data ELSE NULL END
            WHERE id = :id`,
          {
            id: row.id,
            status: resultado.ok ? 'postado' : 'erro',
            erro: resultado.ok
              ? aviso
              : (resultado.error || 'Falha desconhecida').slice(0, 2000),
            destinatarios,
            messageId: resultado.ok ? resultado.messageId || null : null,
            sessao: resultado.ok ? row.sessao : null,
            contexto:
              resultado.ok &&
              typeof resultado.response === 'object' &&
              resultado.response?.deleteContext
                ? JSON.stringify(resultado.response.deleteContext)
                : null,
            postadoEm: resultado.ok
              ? new Date().toISOString().slice(0, 19).replace('T', ' ')
              : null,
          },
        );
        if (resultado.ok) {
          postados += 1;
          await notificar(row.userId, {
            titulo: 'Status publicado',
            mensagem: `Seu status agendado foi publicado${destinatarios ? ` para ${destinatarios} contatos` : ''}.`,
            tipo: 'status',
            icone: '📢',
            url: '/status',
            pushTag: `status-${row.id}`,
          }).catch(() => undefined);
        } else {
          await notificar(row.userId, {
            titulo: 'Falha ao publicar status',
            mensagem: resultado.error || 'Verifique a conexão do WhatsApp.',
            tipo: 'status',
            icone: '⚠️',
            url: '/status',
            pushTag: `status-${row.id}`,
          }).catch(() => undefined);
        }
      } catch (error) {
        await execute(
          `UPDATE whatsapp_status
              SET status = 'erro', erro = :erro,
                  media_data = CASE WHEN tipo = 'image' THEN media_data ELSE NULL END
            WHERE id = :id`,
          {
            id: row.id,
            erro: (error instanceof Error
              ? error.message
              : String(error)
            ).slice(0, 2000),
          },
        );
        await notificar(row.userId, {
          titulo: 'Erro ao publicar status',
          mensagem: error instanceof Error ? error.message : String(error),
          tipo: 'status',
          icone: '⚠️',
          url: '/status',
          pushTag: `status-${row.id}`,
        }).catch(() => undefined);
      } finally {
        // Evita uma rajada de stories da mesma conta quando vencem juntos.
        sessionCooldowns.set(row.sessao, Date.now() + STATUS_INTERVAL_MS);
      }
      await removerStatusNoHorario(remocoesTentadas);
    }
    await removerStatusNoHorario(remocoesTentadas);
    return { postados };
  } finally {
    rodando = false;
  }
}

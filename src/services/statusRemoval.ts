import { execute, queryRows } from '../db/mysql.ts';
import { apagarStatus } from './whatsapp.ts';

export function createStatusRemoval({ execute, queryRows, apagarStatus }) {
  return async function removerStatusWhatsapp(id: number, userId: number) {
    if (!Number.isSafeInteger(id) || id <= 0)
      return { ok: false, error: 'Status inválido.' };
    const rows = await queryRows(
      `SELECT status, whatsapp_message_id AS messageId, whatsapp_sessao AS sessao,
              whatsapp_contexto AS contexto
         FROM whatsapp_status WHERE id = :id AND user_id = :userId`,
      { id, userId },
    );
    const row = rows[0];
    if (!row) return { ok: false, error: 'Status não encontrado.' };
    if (row.status === 'publicando')
      return {
        ok: false,
        error: 'Aguarde a publicação terminar antes de apagar o status.',
      };
    if (row.status === 'postado') {
      // Registros antigos não têm a identificação devolvida pelo WhatsApp.
      if (!row.messageId || !row.sessao || !row.contexto)
        return {
          ok: false,
          error:
            'Este status antigo não tem identificação para exclusão. Apague-o pelo WhatsApp.',
        };
      let result;
      try {
        result = await apagarStatus(
          row.sessao,
          row.messageId,
          JSON.parse(row.contexto),
        );
      } catch {
        return {
          ok: false,
          error: 'Não foi possível apagar no WhatsApp. Tente novamente.',
        };
      }
      if (!result.ok)
        return {
          ok: false,
          error: result.error || 'Não foi possível apagar no WhatsApp.',
        };
    }
    // Respeita uma publicação que tenha começado depois da leitura acima.
    const removed = await execute(
      'DELETE FROM whatsapp_status WHERE id = :id AND user_id = :userId AND status = :status',
      { id, userId, status: row.status },
    );
    return removed.affectedRows
      ? { ok: true }
      : {
          ok: false,
          error: 'O status começou a publicar. Aguarde e tente novamente.',
        };
  };
}

export const removerStatusWhatsapp = createStatusRemoval({
  execute,
  queryRows,
  apagarStatus,
});

export async function removerStatusNoHorario(tentados = new Set<number>()) {
  const due = await queryRows(
    `SELECT id, user_id AS userId FROM whatsapp_status
      WHERE status = 'postado' AND remover_em <= UTC_TIMESTAMP()
      ORDER BY remover_em ASC, id ASC LIMIT 20`,
  );
  for (const row of due) {
    if (tentados.has(row.id)) continue;
    tentados.add(row.id);
    const result = await removerStatusWhatsapp(row.id, row.userId);
    if (!result.ok) {
      // Mantém o registro e tenta novamente no próximo ciclo.
      await execute(
        "UPDATE whatsapp_status SET erro = :erro WHERE id = :id AND user_id = :userId AND status = 'postado'",
        {
          id: row.id,
          userId: row.userId,
          erro: `Falha ao remover no horário: ${result.error}`.slice(0, 2000),
        },
      );
    }
  }
}

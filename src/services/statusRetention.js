import { execute } from '../db/mysql.js';
// A validade começa na publicação confirmada, não no cadastro/agendamento.
export async function removerStatusExpirados(userId) {
  await execute(
    `DELETE FROM whatsapp_status
      WHERE status = 'postado'
        AND postado_em IS NOT NULL
        AND postado_em <= UTC_TIMESTAMP() - INTERVAL 24 HOUR
        ${userId === undefined ? '' : 'AND user_id = :userId'}`,
    userId === undefined ? {} : { userId },
  );
}

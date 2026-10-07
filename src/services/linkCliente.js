import crypto from 'node:crypto';
import { execute, queryOne } from '../db/mysql.js';
import { env } from '../config/env.js';
export async function tokenDoCliente(id) {
  await execute(
    "UPDATE clientes SET pagamento_token = :token WHERE id = :id AND arquivado = 0 AND (pagamento_token IS NULL OR pagamento_token = '')",
    { id, token: crypto.randomBytes(16).toString('hex') },
  );
  const row = await queryOne(
    'SELECT pagamento_token AS token FROM clientes WHERE id = :id AND arquivado = 0 LIMIT 1',
    { id },
  );
  return row?.token || null;
}
export async function urlPagamentoDoCliente(id) {
  const token = await tokenDoCliente(id);
  if (!token) return null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await execute(
        "UPDATE clientes SET pagamento_curto = :alias WHERE id = :id AND arquivado = 0 AND (pagamento_curto IS NULL OR pagamento_curto = '')",
        { id, alias: crypto.randomBytes(12).toString('base64url') },
      );
      break;
    } catch (error) {
      if (error.code !== 'ER_DUP_ENTRY' || attempt === 2) throw error;
    }
  }
  const row = await queryOne(
    'SELECT pagamento_curto AS alias FROM clientes WHERE id = :id AND arquivado = 0',
    { id },
  );
  return row?.alias ? `${env.appUrl.replace(/\/$/, '')}/r/${row.alias}` : null;
}

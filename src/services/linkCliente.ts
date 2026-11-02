import crypto from 'node:crypto';
import { execute, queryOne } from '../db/mysql.ts';
import { env } from '../config/env.ts';
export async function tokenDoCliente(id, connection?) {
  const run = connection
    ? (sql, params) => connection.execute(sql, params)
    : execute;
  const one = connection
    ? async (sql, params) => (await connection.query(sql, params))[0][0]
    : queryOne;
  await run(
    "UPDATE clientes SET pagamento_token = :token WHERE id = :id AND arquivado = 0 AND (pagamento_token IS NULL OR pagamento_token = '')",
    { id, token: crypto.randomBytes(16).toString('hex') },
  );
  const row = await one(
    'SELECT pagamento_token AS token FROM clientes WHERE id = :id AND arquivado = 0 LIMIT 1',
    { id },
  );
  return row?.token || null;
}
export async function urlPagamentoDoCliente(id, connection?) {
  // Renovações mantêm o lock do cliente até a confirmação do WhatsApp.
  // Usar a mesma conexão evita esperar por um lock da própria transação.
  const run = connection
    ? (sql, params) => connection.execute(sql, params)
    : execute;
  const one = connection
    ? async (sql, params) => (await connection.query(sql, params))[0][0]
    : queryOne;
  const token = await tokenDoCliente(id, connection);
  if (!token) return null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await run(
        "UPDATE clientes SET pagamento_curto = :alias WHERE id = :id AND arquivado = 0 AND (pagamento_curto IS NULL OR pagamento_curto = '')",
        { id, alias: crypto.randomBytes(12).toString('base64url') },
      );
      break;
    } catch (error) {
      if (error.code !== 'ER_DUP_ENTRY' || attempt === 2) throw error;
    }
  }
  const row = await one(
    'SELECT pagamento_curto AS alias FROM clientes WHERE id = :id AND arquivado = 0',
    { id },
  );
  return row?.alias ? `${env.appUrl.replace(/\/$/, '')}/r/${row.alias}` : null;
}

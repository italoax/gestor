import { queryRows } from './mysql.ts';
let ready = null;
export function ensureCobrancasEnviosSchema() {
  if (!ready)
    ready = verifyCobrancasSchema().catch((error) => {
      ready = null;
      throw error;
    });
  return ready;
}
async function verifyCobrancasSchema() {
  const columns = await queryRows(
    "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='cobrancas_envios' AND COLUMN_NAME='acesso_chave'",
  );
  if (!columns.length)
    throw new Error(
      'A estrutura de cobranças está incompleta: coluna acesso_chave ausente.',
    );
}

import { execute, queryRows } from './mysql.js';
import type { RowDataPacket } from 'mysql2';

let ready: Promise<void> | null = null;

export function ensureCobrancasEnviosSchema() {
  if (!ready) ready = migrar().catch(error => { ready = null; throw error; });
  return ready;
}

async function migrar() {
  await execute(`CREATE TABLE IF NOT EXISTS cobrancas_envios (
    id INT AUTO_INCREMENT PRIMARY KEY, cobranca_id INT NOT NULL, cliente_id INT NOT NULL,
    acesso_chave VARCHAR(64) NOT NULL DEFAULT 'principal', data_envio DATE NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pendente', erro TEXT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_cobranca_acesso_data (cobranca_id, cliente_id, acesso_chave, data_envio),
    KEY idx_cobrancas_envios_cliente (cliente_id), KEY idx_cobrancas_envios_status (status)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  const columns = await queryRows<RowDataPacket>("SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cobrancas_envios' AND COLUMN_NAME = 'acesso_chave'");
  if (!columns.length) await execute("ALTER TABLE cobrancas_envios ADD COLUMN acesso_chave VARCHAR(64) NOT NULL DEFAULT 'principal'");
  const indexes = await queryRows<RowDataPacket>("SELECT DISTINCT INDEX_NAME FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cobrancas_envios'");
  const nomes = new Set(indexes.map(row => String(row.INDEX_NAME)));
  if (!nomes.has('uq_cobranca_acesso_data')) {
    // Troca em um ALTER para não deixar uma janela sem proteção contra duplicatas.
    await execute(`ALTER TABLE cobrancas_envios ${nomes.has('uq_cobranca_cliente_data') ? 'DROP INDEX uq_cobranca_cliente_data,' : ''}
      ADD UNIQUE KEY uq_cobranca_acesso_data (cobranca_id, cliente_id, acesso_chave, data_envio)`);
  } else if (nomes.has('uq_cobranca_cliente_data')) await execute('ALTER TABLE cobrancas_envios DROP INDEX uq_cobranca_cliente_data');
}

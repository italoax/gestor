import type { RowDataPacket } from 'mysql2/promise';
import path from 'node:path';
import { db } from '../db/mysql.ts';
import { env } from '../config/env.ts';
import { appTodayIso } from './dates.ts';
import { createLogger } from './logger.ts';
import { dataVault } from '../security/storedSecrets.ts';
import { runtimeStorage } from './runtimeStorage.ts';
import { createDailyBackup } from './dailyBackup.ts';
// Backup do banco em SQL puro, sem depender de mysqldump (que nao existe no
// Node da Hostinger shared). Gera CREATE TABLE (via SHOW CREATE TABLE) + INSERTs
// de cada tabela. Serve para o download manual e para o agendador diário
// do backend Node que preserva os arquivos em disco.
const logger = createLogger('backup');
// Na hospedagem, os dados ficam fora das versões substituídas pelo deploy.
const BACKUP_DIR = runtimeStorage().backups;
function escaparValor(v) {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : 'NULL';
  if (typeof v === 'boolean') return v ? '1' : '0';
  if (v instanceof Date)
    return `'${v.toISOString().slice(0, 19).replace('T', ' ')}'`;
  if (Buffer.isBuffer(v)) return `0x${v.toString('hex')}`;
  // String: escapa aspas, barras e caracteres de controle que quebram o SQL.
  const s = String(v)
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\0/g, '\\0');
  return `'${s}'`;
}
async function listarTabelas(connection = db) {
  const [rows] = await connection.query<RowDataPacket[]>('SHOW TABLES');
  return rows
    .map((r) => String(Object.values(r)[0]))
    .filter((name) => !['sessions', 'auth_login_attempts'].includes(name));
}
/**
 * Gera o dump SQL completo do banco como string. Para bancos grandes isso
 * carrega tudo em memoria — ok pro porte atual (poucos MB); se crescer muito,
 * trocar por streaming pra arquivo.
 */
export async function gerarDumpSql(source = db) {
  // Uma pool pode entregar conexões diferentes em cada SELECT. Reserve uma
  // conexão e um snapshot InnoDB para não misturar estados entre tabelas.
  const pooled = typeof (source as any).getConnection === 'function';
  const connection = pooled ? await (source as any).getConnection() : source;
  try {
    await connection.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
    await connection.query(
      'START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY',
    );
    const dump = await dumpSnapshot(connection);
    await connection.commit();
    return dump;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    if (pooled) connection.release();
  }
}
async function dumpSnapshot(connection) {
  const tabelas = await listarTabelas(connection);
  const partes = [];
  partes.push(`-- Backup do gestor — ${new Date().toISOString()}`);
  partes.push(`-- Banco: ${env.db.name}`);
  partes.push('SET FOREIGN_KEY_CHECKS=0;', 'SET NAMES utf8mb4;', '');
  for (const tabela of tabelas) {
    // Estrutura.
    const [createRows] = await connection.query(
      `SHOW CREATE TABLE \`${tabela}\``,
    );
    const createSql = String(createRows[0]?.['Create Table'] ?? '');
    partes.push(`-- ----- Tabela: ${tabela} -----`);
    partes.push(`DROP TABLE IF EXISTS \`${tabela}\`;`);
    if (createSql) partes.push(`${createSql};`, '');
    // Dados.
    const [dados] = await connection.query(`SELECT * FROM \`${tabela}\``);
    if (dados.length) {
      const colunas = Object.keys(dados[0])
        .map((c) => `\`${c}\``)
        .join(', ');
      for (const linha of dados) {
        const valores = Object.values(linha).map(escaparValor).join(', ');
        partes.push(
          `INSERT INTO \`${tabela}\` (${colunas}) VALUES (${valores});`,
        );
      }
      partes.push('');
    }
  }
  partes.push('SET FOREIGN_KEY_CHECKS=1;');
  return partes.join('\n');
}
const dailyBackup = createDailyBackup({
  directory: BACKUP_DIR,
  today: appTodayIso,
  generate: gerarDumpSql,
  database: env.db.name,
  vault: dataVault,
});
/**
 * Roda o backup diario. Idempotente: se o arquivo de hoje ja existe, nao refaz
 * (o backend verifica a cada minuto). Retorna o caminho da cópia pronta.
 */
export async function rodarBackupAgendado() {
  if (env.localMode) return { gerado: false };
  const result = await dailyBackup();
  if (result.gerado)
    logger.info(`backup diario gerado: ${path.basename(result.arquivo)}`);
  return result;
}

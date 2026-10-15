import type { RowDataPacket } from 'mysql2/promise';
import fs from 'node:fs';
import path from 'node:path';
import { db } from '../db/mysql.ts';
import { env } from '../config/env.ts';
import { appTodayIso } from './dates.ts';
import { createLogger } from './logger.ts';
import { dataVault } from '../security/storedSecrets.ts';
// Backup do banco em SQL puro, sem depender de mysqldump (que nao existe no
// Node da Hostinger shared). Gera CREATE TABLE (via SHOW CREATE TABLE) + INSERTs
// de cada tabela. Serve tanto pro download manual no /admin quanto pro cron
// diario que preserva os arquivos em disco. A reten??o exige pol?tica expl?cita.
const logger = createLogger('backup');
// Diretorio de backups relativo ao cwd (raiz do app na Hostinger). Fica fora do
// deploy zip (o deploy so inclui src/public) e do git (ver .gitignore).
const BACKUP_DIR = path.resolve(process.cwd(), 'backups');
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
function nomeArquivoBackup(dataIso) {
  return `gestor-${dataIso}.sql${dataVault ? '.enc' : ''}`;
}
/**
 * Roda o backup diario. Idempotente: se o arquivo de hoje ja existe, nao refaz
 * (o cron chama isso a cada minuto). Retorna o caminho quando gera de fato.
 */
export async function rodarBackupAgendado() {
  if (env.localMode) return { gerado: false };
  const hoje = appTodayIso();
  const destino = path.join(BACKUP_DIR, nomeArquivoBackup(hoje));
  if (fs.existsSync(destino)) return { gerado: false };
  fs.mkdirSync(BACKUP_DIR, { recursive: true, mode: 0o700 });
  const dump = await gerarDumpSql();
  const content = dataVault
    ? JSON.stringify({
        version: 2,
        sourceDatabase: env.db.name,
        payload: dataVault.seal(dump, `database-backup:${env.db.name}`),
      })
    : dump;
  if (
    dataVault &&
    dataVault.open(
      JSON.parse(content).payload,
      `database-backup:${env.db.name}`,
    ) !== dump
  )
    throw new Error('Backup não passou na verificação de recuperação.');
  fs.writeFileSync(destino, content, {
    encoding: 'utf8',
    mode: 0o600,
    flag: 'wx',
  });
  // A etapa 2 preserva os backups existentes. Limpeza exige política explícita.
  const kb = Math.round(dump.length / 1024);
  logger.info(`backup diario gerado: ${nomeArquivoBackup(hoje)} (${kb} KB)`);
  return { gerado: true, arquivo: destino };
}
// Lista os backups em disco (pro painel admin mostrar).
export function listarBackups() {
  if (!fs.existsSync(BACKUP_DIR)) return [];
  return fs
    .readdirSync(BACKUP_DIR)
    .filter((f) => /^gestor-\d{4}-\d{2}-\d{2}\.sql(?:\.enc)?$/.test(f))
    .sort()
    .reverse()
    .map((nome) => {
      const st = fs.statSync(path.join(BACKUP_DIR, nome));
      return {
        nome,
        tamanhoKb: Math.round(st.size / 1024),
        data: nome.replace(/^gestor-/, '').replace(/\.sql(?:\.enc)?$/, ''),
      };
    });
}
export function caminhoBackup(nome) {
  // Sanitiza: so aceita o padrao esperado, sem path traversal.
  if (!/^gestor-\d{4}-\d{2}-\d{2}\.sql(?:\.enc)?$/.test(nome)) return null;
  const p = path.join(BACKUP_DIR, nome);
  return fs.existsSync(p) ? p : null;
}

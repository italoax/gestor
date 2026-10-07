import fs from 'node:fs';
import path from 'node:path';
import { db } from '../db/mysql.js';
import { env } from '../config/env.js';
import { appTodayIso } from './dates.js';
import { createLogger } from './logger.js';
// Backup do banco em SQL puro, sem depender de mysqldump (que nao existe no
// Node da Hostinger shared). Gera CREATE TABLE (via SHOW CREATE TABLE) + INSERTs
// de cada tabela. Serve tanto pro download manual no /admin quanto pro cron
// diario que guarda os ultimos N arquivos em disco.
const logger = createLogger('backup');
// Diretorio de backups relativo ao cwd (raiz do app na Hostinger). Fica fora do
// deploy zip (o deploy so inclui src/public) e do git (ver .gitignore).
const BACKUP_DIR = path.resolve(process.cwd(), 'backups');
const MANTER_ULTIMOS = 7; // retencao: 1 semana de dumps diarios
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
async function listarTabelas() {
  const [rows] = await db.query('SHOW TABLES');
  return rows.map((r) => String(Object.values(r)[0]));
}
/**
 * Gera o dump SQL completo do banco como string. Para bancos grandes isso
 * carrega tudo em memoria — ok pro porte atual (poucos MB); se crescer muito,
 * trocar por streaming pra arquivo.
 */
export async function gerarDumpSql() {
  const tabelas = await listarTabelas();
  const partes = [];
  partes.push(`-- Backup do gestor — ${new Date().toISOString()}`);
  partes.push(`-- Banco: ${env.db.name}`);
  partes.push('SET FOREIGN_KEY_CHECKS=0;', 'SET NAMES utf8mb4;', '');
  for (const tabela of tabelas) {
    // Estrutura.
    const [createRows] = await db.query(`SHOW CREATE TABLE \`${tabela}\``);
    const createSql = String(createRows[0]?.['Create Table'] ?? '');
    partes.push(`-- ----- Tabela: ${tabela} -----`);
    partes.push(`DROP TABLE IF EXISTS \`${tabela}\`;`);
    if (createSql) partes.push(`${createSql};`, '');
    // Dados.
    const [dados] = await db.query(`SELECT * FROM \`${tabela}\``);
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
  return `gestor-${dataIso}.sql`;
}
// Remove backups antigos, mantendo so os MANTER_ULTIMOS mais recentes.
function limparAntigos() {
  if (!fs.existsSync(BACKUP_DIR)) return;
  const arquivos = fs
    .readdirSync(BACKUP_DIR)
    .filter((f) => f.startsWith('gestor-') && f.endsWith('.sql'))
    .sort() // nome inclui data ISO, entao ordem alfabetica = cronologica
    .reverse();
  for (const antigo of arquivos.slice(MANTER_ULTIMOS)) {
    try {
      fs.unlinkSync(path.join(BACKUP_DIR, antigo));
    } catch {
      /* ignora */
    }
  }
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
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const dump = await gerarDumpSql();
  fs.writeFileSync(destino, dump, 'utf8');
  limparAntigos();
  const kb = Math.round(dump.length / 1024);
  logger.info(`backup diario gerado: ${nomeArquivoBackup(hoje)} (${kb} KB)`);
  return { gerado: true, arquivo: destino };
}
// Lista os backups em disco (pro painel admin mostrar).
export function listarBackups() {
  if (!fs.existsSync(BACKUP_DIR)) return [];
  return fs
    .readdirSync(BACKUP_DIR)
    .filter((f) => f.startsWith('gestor-') && f.endsWith('.sql'))
    .sort()
    .reverse()
    .map((nome) => {
      const st = fs.statSync(path.join(BACKUP_DIR, nome));
      return {
        nome,
        tamanhoKb: Math.round(st.size / 1024),
        data: nome.replace('gestor-', '').replace('.sql', ''),
      };
    });
}
export function caminhoBackup(nome) {
  // Sanitiza: so aceita o padrao esperado, sem path traversal.
  if (!/^gestor-\d{4}-\d{2}-\d{2}\.sql$/.test(nome)) return null;
  const p = path.join(BACKUP_DIR, nome);
  return fs.existsSync(p) ? p : null;
}

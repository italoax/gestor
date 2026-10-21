import { databaseConnection } from '../../src/security/databaseTls.ts';
import { readFileSync } from 'node:fs';
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import { loadVault } from '../../src/security/secretVault.ts';
async function main() {
  const args = process.argv.slice(2);
  const arg = (name: string) => {
    const i = args.indexOf(name);
    return i < 0 ? undefined : args[i + 1];
  };
  const configPath = arg('--config'),
    backupPath = arg('--backup');
  if (!configPath || !backupPath)
    throw new Error(
      'Informe --config e --backup. O destino deve ser um banco vazio de homologação.',
    );
  const config = dotenv.parse(readFileSync(configPath));
  if (!['local', 'staging'].includes(config.MIGRATION_ENVIRONMENT))
    throw new Error(
      'Restauração permitida somente em local/homologação isolada.',
    );
  if (
    config.MIGRATION_ENVIRONMENT === 'local' &&
    !['127.0.0.1', 'localhost', '::1'].includes(config.DB_HOST)
  )
    throw new Error('Alvo local inválido.');
  const vault = loadVault(config),
    artifact = JSON.parse(readFileSync(backupPath, 'utf8'));
  if (
    !vault ||
    artifact.version !== 2 ||
    typeof artifact.sourceDatabase !== 'string'
  )
    throw new Error('Backup ou chaves inválidos.');
  const sql = vault.open(
    artifact.payload,
    `database-backup:${artifact.sourceDatabase}`,
  );
  if (
    !['127.0.0.1', 'localhost', '::1'].includes(config.DB_HOST) &&
    config.DB_SSL !== 'true'
  )
    throw new Error('TLS obrigat?rio para banco remoto.');
  const conn = await mysql.createConnection({
    ...databaseConnection(config),
    user: config.DB_USER,
    password: config.DB_PASSWORD,
    database: config.DB_NAME,
    multipleStatements: true,
  });
  try {
    const [tables] = await conn.query('SHOW TABLES');
    if ((tables as any[]).length)
      throw new Error(
        'Destino não está vazio. Nenhuma tabela existente será removida.',
      );
    if (!args.includes('--apply'))
      console.log(
        JSON.stringify({
          action: 'restore-preview',
          emptyTarget: true,
          authenticatedBackup: true,
        }),
      );
    else {
      await conn.query("SET SESSION sql_mode = '';" + sql);
      console.log(
        JSON.stringify({
          action: 'restore-complete',
          tables: ((await conn.query('SHOW TABLES'))[0] as any[]).length,
        }),
      );
    }
  } finally {
    await conn.end();
  }
}
void main().catch((error) => {
  const code =
    typeof error?.code === 'string' && /^[A-Z0-9_]{1,40}$/.test(error.code)
      ? error.code
      : 'FAILED';
  console.error(
    JSON.stringify({
      event: 'security.command_failed',
      command: 'restore',
      code,
      message:
        'Operação não concluída. Confira o arquivo de configuração, as chaves, o estado do destino e as permissões. Nenhum segredo foi incluído neste log.',
    }),
  );
  process.exitCode = 1;
});

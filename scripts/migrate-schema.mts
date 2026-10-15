import { readFileSync } from 'node:fs';
import dotenv from 'dotenv';
import { databaseTls } from '../src/security/databaseTls.ts';
import { loadVault } from '../src/security/secretVault.ts';

async function main() {
  const args = process.argv.slice(2);
  const configFile = args[args.indexOf('--config') + 1];
  if (!args.includes('--config') || !configFile) throw new Error();
  const config = dotenv.parse(readFileSync(configFile));
  if (
    !['local', 'staging', 'production'].includes(config.MIGRATION_ENVIRONMENT)
  )
    throw new Error();
  if (
    config.MIGRATION_ENVIRONMENT === 'local' &&
    !['127.0.0.1', 'localhost', '::1'].includes(config.DB_HOST)
  )
    throw new Error();
  if (
    config.MIGRATION_ENVIRONMENT === 'production' &&
    !args.includes('--approve-production')
  )
    throw new Error();
  if (args.includes('--business') && !args.includes('--approve-business'))
    throw new Error();
  if (!args.includes('--apply')) {
    console.log(
      JSON.stringify({
        action: 'schema-plan',
        structural: true,
        business: args.includes('--business'),
        databaseConnected: false,
      }),
    );
    return;
  }
  if (args.includes('--business')) {
    const backupFile = args[args.indexOf('--business-backup') + 1];
    if (
      !args.includes('--restore-tested') ||
      !args.includes('--business-backup') ||
      !backupFile
    )
      throw new Error();
    const backup = JSON.parse(readFileSync(backupFile, 'utf8'));
    const vault = loadVault(config);
    if (
      !vault ||
      backup.version !== 2 ||
      backup.sourceDatabase !== config.DB_NAME ||
      !vault.open(backup.payload, `database-backup:${config.DB_NAME}`)
    )
      throw new Error();
  }
  // Definições existentes carregam env/vault: selecionar SOMENTE o arquivo explícito.
  // Impedir que variáveis herdadas substituam silenciosamente o arquivo selecionado.
  for (const name of Object.keys(process.env)) {
    if (
      /^(DB_|DATA_ENCRYPTION_|SESSION_SECRET$|LOCAL_MODE$|NODE_ENV$)/.test(name)
    )
      delete process.env[name];
  }
  Object.assign(process.env, config, {
    GESTOR_ENV_FILE: configFile,
    RUN_AUTOMATIONS: 'false',
  });
  const mysql = await import('mysql2/promise');
  const { runSchemaMigrations } = await import('../src/db/migrations.ts');
  const connection = await mysql.createConnection({
    host: config.DB_HOST,
    port: Number(config.DB_PORT || 3306),
    user: config.DB_USER,
    password: config.DB_PASSWORD || config.DB_PASS,
    database: config.DB_NAME,
    namedPlaceholders: true,
    ssl: databaseTls(config, true),
    connectTimeout: 5000,
  });
  try {
    await runSchemaMigrations(connection, {
      business: args.includes('--business'),
    });
    console.log(
      JSON.stringify({
        action: 'schema-completed',
        business: args.includes('--business'),
      }),
    );
  } finally {
    await connection.end();
  }
}
void main().catch(() => {
  console.error(
    JSON.stringify({
      event: 'schema.migration_failed',
      message:
        'Migração não concluída. Verifique configuração, aprovação, schema e permissões.',
    }),
  );
  process.exitCode = 1;
});

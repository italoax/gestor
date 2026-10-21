import { databaseConnection } from '../../src/security/databaseTls.ts';
import { readFileSync, writeFileSync } from 'node:fs';
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import { createHash, createDecipheriv } from 'node:crypto';
import { loadVault } from '../../src/security/secretVault.ts';
import {
  planSecretMigration,
  encodeMigrationBackup,
  decodeMigrationBackup,
  applySecretChanges,
  backupDigest,
} from '../../src/security/secretMigration.ts';

// Não usa o .env da aplicação por padrão. O alvo precisa ser nomeado explicitamente.
async function main() {
  const args = process.argv.slice(2);
  const arg = (name: string) => {
    const i = args.indexOf(name);
    return i < 0 ? undefined : args[i + 1];
  };
  const configPath = arg('--config');
  if (!configPath)
    throw new Error(
      'Informe --config com um arquivo exclusivo do ambiente autorizado. Sem --apply, apenas simula.',
    );
  const config = dotenv.parse(readFileSync(configPath));
  if (
    !['local', 'staging', 'production'].includes(config.MIGRATION_ENVIRONMENT)
  )
    throw new Error('Defina MIGRATION_ENVIRONMENT no arquivo exclusivo.');
  if (
    config.MIGRATION_ENVIRONMENT === 'production' &&
    !args.includes('--approve-production')
  )
    throw new Error('Produção exige aprovação e --approve-production.');
  if (
    config.MIGRATION_ENVIRONMENT === 'local' &&
    !['127.0.0.1', '::1', 'localhost'].includes(config.DB_HOST)
  )
    throw new Error('O ambiente local exige endereço de loopback.');
  const vault = loadVault(config);
  if (!vault || !config.DB_NAME)
    throw new Error('Banco e chaves explícitos são obrigatórios.');
  if (
    !['127.0.0.1', 'localhost', '::1'].includes(config.DB_HOST) &&
    config.DB_SSL !== 'true'
  )
    throw new Error('TLS obrigat?rio para banco remoto.');
  const conn = await mysql.createConnection({
    ...databaseConnection(config),
    database: config.DB_NAME,
    user: config.DB_USER,
    password: config.DB_PASSWORD,
    namedPlaceholders: true,
  });
  try {
    const restorePath = arg('--rollback');
    if (restorePath) {
      const changes = decodeMigrationBackup(
        vault,
        config.DB_NAME,
        readFileSync(restorePath, 'utf8'),
      );
      console.log(
        JSON.stringify({
          action: 'rollback',
          rows: changes.length,
          apply: args.includes('--apply'),
        }),
      );
      if (args.includes('--apply'))
        await applySecretChanges(conn, changes, true);
    } else {
      const legacyKey = createHash('sha256')
        .update(config.LEGACY_SESSION_SECRET || '')
        .digest();
      const legacy = (stored: string) => {
        if (!config.LEGACY_SESSION_SECRET)
          throw new Error(
            'A chave legada é necessária para migrar integrações antigas.',
          );
        try {
          const [iv, tag, data] = stored
            .split('.')
            .map((s) => Buffer.from(s, 'base64'));
          const d = createDecipheriv('aes-256-gcm', legacyKey, iv);
          d.setAuthTag(tag);
          return Buffer.concat([d.update(data), d.final()]).toString('utf8');
        } catch {
          throw new Error('Não foi possível recuperar uma integração legada.');
        }
      };
      const changes = await planSecretMigration(conn, vault, legacy);
      const backup = encodeMigrationBackup(vault, config.DB_NAME, changes);
      if (
        decodeMigrationBackup(vault, config.DB_NAME, backup).length !==
        changes.length
      )
        throw new Error('Falha no ensaio de recuperação.');
      console.log(
        JSON.stringify({
          action: 'migrate-or-rotate',
          rows: changes.length,
          apply: args.includes('--apply'),
          keyId: vault.active,
        }),
      );
      if (args.includes('--apply')) {
        if (!args.includes('--restore-tested'))
          throw new Error(
            'Execute o ensaio de restauração isolado antes de usar --restore-tested.',
          );
        const backupPath = arg('--backup');
        if (!backupPath)
          throw new Error('Informe --backup: o backup cifrado é obrigatório.');
        writeFileSync(backupPath, backup, {
          encoding: 'utf8',
          mode: 0o600,
          flag: 'wx',
        });
        // Expansão de capacidade não remove dados; rollback mantém as colunas largas.
        await conn.query('ALTER TABLE clientes MODIFY senha TEXT NULL');
        await conn.query('ALTER TABLE users MODIFY mp_access_token TEXT NULL');
        await applySecretChanges(conn, changes);
        console.log(
          JSON.stringify({
            action: 'completed',
            rows: changes.length,
            backupSha256: backupDigest(backup),
          }),
        );
      }
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
      command: 'migrate',
      code,
      message:
        'Operação não concluída. Confira o arquivo de configuração, as chaves, o estado do destino e as permissões. Nenhum segredo foi incluído neste log.',
    }),
  );
  process.exitCode = 1;
});

import { databaseConnection } from '../../src/security/databaseTls.ts';
import {
  readFileSync,
  realpathSync,
  statSync,
  statfsSync,
  readdirSync,
} from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import mysql from 'mysql2/promise';
import { loadVault } from '../../src/security/secretVault.ts';
import { trustedProxyAddresses } from '../../src/security/proxyTrust.ts';
import {
  inspectStoredSecrets,
  inspectSecuritySignals,
  operationalAlerts,
} from '../../src/security/productionReview.ts';

// Não importa env.ts, defaults de banco, schema ou automações da aplicação.
async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help')) {
    console.log(
      'security:production --config <arquivo> [--database] [--backup-dir <diretório>]',
    );
    return;
  }
  const arg = (name: string) => {
    const index = args.indexOf(name);
    return index < 0 ? undefined : args[index + 1];
  };
  const configPath = arg('--config');
  if (!configPath) throw new Error('CONFIG_REQUIRED');
  const config = dotenv.parse(readFileSync(configPath));
  const root = realpathSync(process.cwd());
  const within = (file: string) => {
    const relative = path.relative(root, realpathSync(file));
    return (
      relative === '' ||
      (!relative.startsWith('..' + path.sep) &&
        relative !== '..' &&
        !path.isAbsolute(relative))
    );
  };
  const vault = loadVault(config);
  trustedProxyAddresses(config.TRUSTED_PROXY_CIDRS || 'loopback');
  const keyFile = config.DATA_ENCRYPTION_KEY_FILE;
  const blockers: string[] = [];
  let validHttps = false;
  try {
    const url = new URL(config.APP_URL);
    validHttps = url.protocol === 'https:' && !url.username && !url.password;
  } catch {
    /* apenas estado, sem imprimir URL */
  }
  if (config.NODE_ENV !== 'production')
    blockers.push('production-mode-disabled');
  if (!validHttps) blockers.push('https-url-required');
  if (config.COOKIE_SECURE && !['true', '1'].includes(config.COOKIE_SECURE))
    blockers.push('secure-cookie-disabled');
  if (config.LOCAL_MODE === 'true')
    blockers.push('persistent-sessions-disabled');
  if (
    !config.SESSION_SECRET ||
    config.SESSION_SECRET.length < 32 ||
    config.SESSION_SECRET === 'dev-secret-change-me'
  )
    blockers.push('session-secret-invalid');
  if (!vault || config.DATA_ENCRYPTION_WRITE === 'false')
    blockers.push('encrypted-writes-disabled');
  if (config.DATA_ENCRYPTION_REQUIRED !== 'true')
    blockers.push('encryption-not-required');
  if (keyFile && within(keyFile)) blockers.push('key-file-inside-repository');
  if (keyFile && process.platform !== 'win32' && statSync(keyFile).mode & 0o077)
    blockers.push('key-file-permissions-too-open');
  const loopback = ['127.0.0.1', 'localhost', '::1'].includes(config.DB_HOST);
  let transport: ReturnType<typeof databaseConnection> | undefined;
  try {
    transport = databaseConnection(config);
  } catch {
    blockers.push('database-transport-not-authorized-or-invalid');
  }
  if (!loopback && config.DB_SSL !== 'true')
    blockers.push('remote-database-without-tls');
  if (
    config.NODE_ENV === 'production' &&
    config.DB_SSL !== 'true' &&
    !(transport && config.DB_TRANSPORT === 'hostinger-local-tcp')
  )
    blockers.push('production-database-without-tls');
  const report: Record<string, any> = {
    configurationOnly: !args.includes('--database'),
    databaseTransportPolicyAccepted: Boolean(transport),
    localDatabaseException:
      config.DB_TRANSPORT === 'hostinger-local-tcp'
        ? transport
          ? 'approved-local-plaintext'
          : 'blocked-pending-evidence'
        : 'not-requested',
    blockers,
    redirectConfiguredInApplication: config.ENFORCE_HTTPS === 'true',
    keyFilePermissions: !keyFile
      ? 'not-file-based'
      : process.platform === 'win32'
        ? 'acl-review-required'
        : 'posix-checked',
    pendingEvidence: [
      'public-tls-and-redirect',
      'firewall-and-database-exposure',
      'proxy-topology',
      'sql-least-privilege',
      'runtime-acls',
      'patching',
      'log-integrity-and-retention',
      'alert-delivery-and-critical-errors',
      'isolated-restore-and-rpo-rto',
    ],
    productionInfrastructureVerified: false,
  };
  const backupDir = arg('--backup-dir');
  if (backupDir) {
    const disk = statfsSync(backupDir);
    const backups = readdirSync(backupDir).filter((name) =>
      /^gestor-\d{4}-\d{2}-\d{2}\.sql(?:\.enc)?$/.test(name),
    );
    const latest = Math.max(
      0,
      ...backups.map((name) => statSync(path.join(backupDir, name)).mtimeMs),
    );
    report.operations = operationalAlerts({
      freeRatio: disk.blocks ? disk.bavail / disk.blocks : null,
      backupAgeHours: latest
        ? Math.max(0, (Date.now() - latest) / 3600_000)
        : null,
    });
    report.operations.unencryptedBackupFiles = backups.filter((name) =>
      name.endsWith('.sql'),
    ).length;
    if (
      report.operations.disk !== 'ok' ||
      report.operations.dailyBackup !== 'recent' ||
      report.operations.unencryptedBackupFiles
    )
      blockers.push('backup-or-disk-review-required');
  }
  if (args.includes('--database')) {
    if (
      !transport ||
      !config.DB_HOST ||
      !config.DB_NAME ||
      !config.DB_USER ||
      (!loopback && config.DB_SSL !== 'true')
    )
      throw new Error('DATABASE_CONFIG_INVALID');
    const connection = await mysql.createConnection({
      ...transport,
      database: config.DB_NAME,
      user: config.DB_USER,
      password: config.DB_PASSWORD || config.DB_PASS,
      connectTimeout: 5000,
    });
    try {
      await connection.query("SET time_zone = '+00:00'");
      await connection.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
      await connection.query(
        'START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY',
      );
      report.secrets = await inspectStoredSecrets(connection, vault);
      report.signals = await inspectSecuritySignals(connection);
      if (
        report.secrets.some(
          (field) =>
            field.plaintext ||
            field.legacyEncrypted ||
            field.unreadable ||
            field.unverified,
        )
      )
        blockers.push('stored-secrets-require-review');
      if (
        report.signals.excessiveLogin ||
        report.signals.adminDenied ||
        report.signals.adminWriteBurst
      )
        blockers.push('security-alerts-require-review');
      await connection.rollback();
    } finally {
      await connection.end();
    }
  }
  console.log(JSON.stringify(report, null, 2));
  if (blockers.length) process.exitCode = 2;
}
void main().catch(() => {
  console.error(
    JSON.stringify({
      event: 'security.production_review_failed',
      message:
        'Inspeção incompleta. Verifique configuração, chaves, permissões e disponibilidade. Nenhum detalhe interno foi registrado.',
    }),
  );
  process.exitCode = 1;
});

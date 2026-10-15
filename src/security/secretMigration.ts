import { createHash } from 'node:crypto';
import { SecretVault, isProtectedSecret } from './secretVault.ts';

export interface SecretChange {
  table: string;
  column: string;
  id?: number;
  owner: number;
  provider?: string;
  before: string;
  after: string;
}
export const secretTargets = [
  { table: 'clientes', column: 'senha', purpose: 'iptv' },
  { table: 'integracoes', column: 'senha_enc', purpose: 'integration' },
  {
    table: 'payment_provider_configs',
    column: 'credenciais',
    purpose: 'payment',
  },
  { table: 'users', column: 'mp_access_token', purpose: 'payment-legacy' },
];
export async function planSecretMigration(
  conn,
  vault: SecretVault,
  legacyIntegration: (value: string) => string,
) {
  const changes: SecretChange[] = [];
  for (const target of secretTargets) {
    const pk =
      target.table === 'payment_provider_configs'
        ? 'user_id, provider'
        : target.table === 'users'
          ? 'id, id AS user_id'
          : 'id, user_id';
    const [rows] = await conn.query(
      `SELECT ${pk}, \`${target.column}\` AS stored FROM \`${target.table}\` WHERE \`${target.column}\` IS NOT NULL AND \`${target.column}\` <> ''`,
    );
    for (const row of rows) {
      const stored = String(row.stored),
        owner = Number(row.user_id);
      const context = `${target.purpose}${row.provider ? ':' + row.provider : ''}:${owner}`;
      const protectedValue = isProtectedSecret(stored);
      const plain = protectedValue
        ? vault.open(stored, context)
        : target.purpose === 'integration'
          ? legacyIntegration(stored)
          : stored;
      if (protectedValue && stored.split(':')[2] === vault.active) continue;
      const after = vault.seal(plain, context);
      if (vault.open(after, context) !== plain)
        throw new Error('Falha na verificação da migração.');
      changes.push({
        table: target.table,
        column: target.column,
        id: row.id,
        owner,
        provider: row.provider,
        before: stored,
        after,
      });
    }
  }
  return changes;
}
export function encodeMigrationBackup(
  vault: SecretVault,
  database: string,
  changes: SecretChange[],
) {
  const plain = JSON.stringify({
    version: 1,
    database,
    createdAt: new Date().toISOString(),
    changes,
  });
  const sealed = vault.seal(plain, `migration-backup:${database}`);
  if (vault.open(sealed, `migration-backup:${database}`) !== plain)
    throw new Error('Backup não passou na verificação de recuperação.');
  return sealed;
}
export function decodeMigrationBackup(
  vault: SecretVault,
  database: string,
  backup: string,
): SecretChange[] {
  const parsed = JSON.parse(
    vault.open(backup.trim(), `migration-backup:${database}`),
  );
  if (
    parsed.version !== 1 ||
    parsed.database !== database ||
    !Array.isArray(parsed.changes)
  )
    throw new Error('Backup incompatível.');
  for (const c of parsed.changes) {
    if (
      !secretTargets.some(
        (t) => t.table === c.table && t.column === c.column,
      ) ||
      !Number.isSafeInteger(c.owner) ||
      c.owner <= 0 ||
      typeof c.before !== 'string' ||
      typeof c.after !== 'string'
    )
      throw new Error('Backup inválido.');
    if (
      c.table !== 'payment_provider_configs' &&
      (!Number.isSafeInteger(c.id) || c.id <= 0)
    )
      throw new Error('Identificador inválido.');
  }
  return parsed.changes;
}
export async function applySecretChanges(
  conn,
  changes: SecretChange[],
  rollback = false,
) {
  await conn.beginTransaction();
  try {
    for (const c of changes) {
      if (
        !secretTargets.some((t) => t.table === c.table && t.column === c.column)
      )
        throw new Error('Alvo de migração inválido.');
      const key =
        c.table === 'payment_provider_configs'
          ? 'user_id = :owner AND provider = :provider'
          : c.table === 'users'
            ? 'id = :id'
            : 'id = :id AND user_id = :owner';
      const [result] = await conn.execute(
        `UPDATE \`${c.table}\` SET \`${c.column}\` = :replacement WHERE ${key} AND BINARY \`${c.column}\` = BINARY :expected`,
        {
          id: c.id ?? null,
          owner: c.owner,
          provider: c.provider ?? null,
          expected: rollback ? c.after : c.before,
          replacement: rollback ? c.before : c.after,
        },
      );
      if (result.affectedRows !== 1)
        throw new Error(
          'Registro mudou após o planejamento. Nenhuma alteração foi confirmada.',
        );
    }
    await conn.commit();
  } catch (error) {
    await conn.rollback();
    throw error;
  }
}
export const backupDigest = (backup: string) =>
  createHash('sha256').update(backup).digest('hex');

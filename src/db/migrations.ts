import { createHash } from 'node:crypto';
import {
  campaignSchemaVersion,
  campaignSchemaChecksum,
  applyCampaignSchema,
} from './campaignSchema.ts';
import {
  applyStructuralSchema,
  applyLegacyBusinessMigration,
  structuralDefinition,
} from './schema.ts';

export const schemaVersion = '20261015-31-structural';
// Manifesto estável entre execução TS/tsx e build JS; mudanças exigem nova versão.
const checksum = createHash('sha256')
  .update(structuralDefinition + ':sessions-v1:cobrancas-acesso-v1')
  .digest('hex');
export async function verifyDatabaseSchema(connection) {
  const [rows] = await connection.query(
    'SELECT checksum FROM schema_migrations WHERE version = ?',
    [schemaVersion],
  );
  if (rows.length !== 1 || rows[0].checksum !== checksum)
    throw new Error(
      'Schema incompatível. Execute e aprove a migração explícita antes de iniciar.',
    );
  // No DDL, seed, or commercial update during startup.
  const [campaigns] = await connection.query(
    'SELECT checksum FROM schema_migrations WHERE version = ?',
    [campaignSchemaVersion],
  );
  if (
    campaigns.length !== 1 ||
    campaigns[0].checksum !== campaignSchemaChecksum
  )
    throw new Error(
      'Schema de envios automáticos incompatível. Execute a migração explícita antes de iniciar.',
    );
  await connection.query('SELECT session_id FROM sessions LIMIT 0');
  await connection.query('SELECT session_version FROM users LIMIT 0');
  await connection.query('SELECT external_reference FROM pagamentos LIMIT 0');
}

export async function runSchemaMigrations(
  connection,
  { business = false } = {},
) {
  const [database] = await connection.query('SELECT DATABASE() AS name');
  const lock =
    'gestor-schema-' +
    createHash('sha256').update(database[0].name).digest('hex').slice(0, 40);
  const [locked] = await connection.query('SELECT GET_LOCK(?, 0) AS acquired', [
    lock,
  ]);
  if (Number(locked[0].acquired) !== 1)
    throw new Error('Outra migração está em execução.');
  try {
    await connection.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      version VARCHAR(80) PRIMARY KEY, checksum CHAR(64) NOT NULL,
      applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB`);
    const apply = async (version: string, digest: string, operation) => {
      const [rows] = await connection.query(
        'SELECT checksum FROM schema_migrations WHERE version = ?',
        [version],
      );
      if (rows.length) {
        if (rows[0].checksum !== digest)
          throw new Error('Checksum de migração divergente.');
        return;
      }
      await operation(connection);
      await connection.execute(
        'INSERT INTO schema_migrations (version, checksum) VALUES (?, ?)',
        [version, digest],
      );
    };
    await apply(schemaVersion, checksum, applyStructuralSchema);
    await apply(
      campaignSchemaVersion,
      campaignSchemaChecksum,
      applyCampaignSchema,
    );
    if (business) {
      await connection.beginTransaction();
      try {
        await apply(
          '20261015-legacy-business',
          createHash('sha256')
            .update('legacy-payments-defaults-subscription-plans-trial-v1')
            .digest('hex'),
          applyLegacyBusinessMigration,
        );
        await connection.commit();
      } catch (error) {
        await connection.rollback();
        throw error;
      }
    }
  } finally {
    await connection.query('SELECT RELEASE_LOCK(?)', [lock]);
  }
}

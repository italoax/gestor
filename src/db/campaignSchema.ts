import { createHash } from 'node:crypto';

export const campaignSchemaVersion = '20261017-campaigns-v1';
export const campaignSchemaChecksum = createHash('sha256')
  .update('ALTER TABLE cobrancas ADD COLUMN campanha_config JSON NULL:v1')
  .digest('hex');

export async function applyCampaignSchema(connection) {
  const [rows] = await connection.query(
    "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='cobrancas' AND COLUMN_NAME='campanha_config'",
  );
  if (!rows.length)
    await connection.execute(
      'ALTER TABLE cobrancas ADD COLUMN campanha_config JSON NULL',
    );
  await connection.query('SELECT campanha_config FROM cobrancas LIMIT 0');
}

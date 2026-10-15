import { isProtectedSecret, type SecretVault } from './secretVault.ts';
import { secretTargets } from './secretMigration.ts';

// Somente SELECTs e resultados agregados. Nunca devolve valores, IDs ou chaves.
export async function inspectStoredSecrets(connection, vault?: SecretVault) {
  const inventory = [];
  for (const target of secretTargets) {
    const owner = target.table === 'users' ? 'id' : 'user_id';
    const provider =
      target.table === 'payment_provider_configs' ? ', provider' : '';
    const [rows] = await connection.query(
      `SELECT ${owner} AS owner, \`${target.column}\` AS stored${provider} FROM \`${target.table}\` WHERE \`${target.column}\` IS NOT NULL AND \`${target.column}\` <> ''`,
    );
    const counts = {
      field: `${target.table}.${target.column}`,
      total: rows.length,
      plaintext: 0,
      legacyEncrypted: 0,
      readable: 0,
      previousKey: 0,
      unreadable: 0,
      unverified: 0,
    };
    for (const row of rows) {
      const stored = String(row.stored);
      if (!isProtectedSecret(stored)) {
        if (target.purpose === 'integration') counts.legacyEncrypted++;
        else counts.plaintext++;
        continue;
      }
      if (!vault) {
        counts.unverified++;
        continue;
      }
      try {
        const context = `${target.purpose}${row.provider ? ':' + row.provider : ''}:${row.owner}`;
        vault.open(stored, context);
        counts.readable++;
        if (stored.split(':')[2] !== vault.active) counts.previousKey++;
      } catch {
        counts.unreadable++;
      }
    }
    inventory.push(counts);
  }
  return inventory;
}

export async function inspectSecuritySignals(connection) {
  const [rows] = await connection.query(
    `SELECT event, COUNT(*) AS count FROM security_events
     WHERE created_at >= UTC_TIMESTAMP() - INTERVAL 15 MINUTE GROUP BY event`,
  );
  const counts = new Map(
    rows.map((row) => [String(row.event), Number(row.count)]),
  );
  const count = (event: string): number => Number(counts.get(event) || 0);
  return {
    windowMinutes: 15,
    excessiveLogin:
      count('login.failure') >= 10 || count('login.rate_limited') > 0,
    adminDenied: count('admin.denied') > 0,
    adminWriteBurst: count('admin.critical') >= 10,
    exports: count('backup.exported'),
    // Ausência no SQL não exclui falhas de persistência: verificar stderr também.
    persistenceErrorsObservableHere: false,
  };
}

export function operationalAlerts({
  freeRatio,
  backupAgeHours,
}: {
  freeRatio: number | null;
  backupAgeHours: number | null;
}) {
  return {
    disk:
      freeRatio === null
        ? 'unknown'
        : freeRatio < 0.05
          ? 'critical'
          : freeRatio < 0.15
            ? 'warning'
            : 'ok',
    dailyBackup:
      backupAgeHours === null
        ? 'missing'
        : backupAgeHours > 26
          ? 'stale'
          : 'recent',
    // Data recente não comprova integridade, cópia externa ou restauração.
    recoveryVerified: false,
  };
}

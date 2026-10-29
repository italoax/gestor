import { db, queryRows } from '../../src/db/mysql.ts';
import {
  checkDeliveryMonitoring,
  defaultDeliveryMonitoring,
} from '../../src/services/deliveryMonitoringDefaults.ts';
import { safeError } from '../../src/security/safeError.ts';

// A single independent run. It never starts the web server or sends customer messages.
try {
  if (process.argv.includes('--dry-run')) {
    const users = await queryRows(
      "SELECT DISTINCT user_id AS userId FROM cobrancas WHERE status IN ('Ativo','Pausada')",
    );
    for (const { userId } of users) {
      const snapshot = await defaultDeliveryMonitoring.snapshot(Number(userId));
      console.log(
        JSON.stringify({
          userId,
          enabled: snapshot.enabled,
          scheduler: snapshot.scheduler.state,
          rules: snapshot.rules.map((rule) => ({
            id: rule.id,
            state: rule.state,
            scheduledAt: rule.scheduledAt,
            pending: rule.pending,
          })),
          attempts: snapshot.attempts.length,
          alerts: snapshot.alerts.length,
        }),
      );
    }
  } else
    console.log(
      JSON.stringify(await checkDeliveryMonitoring({ external: true })),
    );
} catch (error) {
  console.error('[monitor-envios]', safeError(error));
  process.exitCode = 1;
} finally {
  await db.end();
}

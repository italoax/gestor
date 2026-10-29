import { execute } from './mysql.ts';
let ready: Promise<void> | undefined;
export async function claimPaymentCheck(paymentId: number) {
  if (!ready)
    ready = execute(`CREATE TABLE IF NOT EXISTS payment_status_checks (
    payment_id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
    checked_at DATETIME(3) NOT NULL,
    INDEX payment_status_checks_time (checked_at)
  )`)
      .then(() => undefined)
      .catch((error) => {
        ready = undefined;
        throw error;
      });
  await ready;
  const created: any = await execute(
    'INSERT IGNORE INTO payment_status_checks (payment_id, checked_at) VALUES (:id, NOW(3))',
    { id: paymentId },
  );
  if (created.affectedRows === 1) return true;
  const claimed: any = await execute(
    `UPDATE payment_status_checks SET checked_at=NOW(3)
    WHERE payment_id=:id AND checked_at <= DATE_SUB(NOW(3), INTERVAL 61 SECOND)`,
    { id: paymentId },
  );
  return claimed.affectedRows === 1;
}

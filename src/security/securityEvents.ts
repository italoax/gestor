import { createHmac } from 'node:crypto';
const events = new Set([
  'login.rate_limited',
  'login.failure',
  'login.success',
  'admin.denied',
  'admin.critical',
  'backup.exported',
  'session.revoked',
  'session.expired',
  'session.privileges_changed',
  'credentials.changed',
  'security.persistence_failed',
]);
export function createSecurityEvents({
  execute,
  secret,
  logger = console,
}: {
  execute: (...args: any[]) => Promise<any>;
  secret: string;
  logger?: Pick<Console, 'log' | 'warn'>;
}) {
  return async (
    event: string,
    input: {
      userId?: unknown;
      ip?: string;
      reason?: string;
      count?: number;
    } = {},
  ) => {
    if (!events.has(event)) throw new Error('Evento de segurança inválido.');
    const userId =
      Number.isSafeInteger(Number(input.userId)) && Number(input.userId) > 0
        ? Number(input.userId)
        : null;
    const reason =
      input.reason && /^[a-z0-9_.-]{1,60}$/.test(input.reason)
        ? input.reason
        : null;
    const count =
      Number.isSafeInteger(input.count) && input.count >= 0
        ? input.count
        : null;
    const severity =
      /rate_limited|denied|privileges_changed|credentials.changed|admin.critical|session.revoked|backup.exported/.test(
        event,
      )
        ? 'alert'
        : 'info';
    const sourceHash = input.ip
      ? createHmac('sha256', secret).update(input.ip).digest('hex')
      : null;
    const entry = {
      event,
      severity,
      userId,
      sourceHash,
      reason,
      count,
      at: new Date().toISOString(),
    };
    if (severity === 'alert') logger.warn(JSON.stringify(entry));
    else logger.log(JSON.stringify(entry));
    try {
      await execute(
        'INSERT INTO security_events (event, severity, user_id, source_hash, reason, count_value) VALUES (:event, :severity, :userId, :sourceHash, :reason, :count)',
        entry,
      );
    } catch {
      logger.warn(
        JSON.stringify({
          event: 'security.persistence_failed',
          at: new Date().toISOString(),
        }),
      );
    }
  };
}

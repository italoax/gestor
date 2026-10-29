import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { env } from '../config/env.ts';
import { resolveStoragePaths } from '../config/storagePaths.ts';
import { automationsEnabled } from '../security/automationPolicy.ts';
import { db, queryRows, execute, withTransaction } from '../db/mysql.ts';
import { ensureDeliveryMonitoringSchema } from '../db/deliveryMonitoringSchema.ts';
import { readDefaultSchedulerHealth } from './schedulerHealthDefaults.ts';
import { enviarPushParaUsuario } from './push.ts';
import { createDeliveryTracker } from './deliveryTracker.ts';
import {
  createDeliveryMonitoring,
  createIncidentSynchronizer,
  deliveryIssues,
} from './deliveryMonitoring.ts';
import { fetchWithTimeout } from './http.ts';
import { createLogger } from './logger.ts';

const logger = createLogger('central-envios');
const monitorFile = () =>
  path.join(
    resolveStoragePaths().dataRoot,
    'monitoring',
    'delivery-watchdog.json',
  );
export async function readExternalDeliveryMonitor() {
  try {
    const record = JSON.parse(await fs.readFile(monitorFile(), 'utf8'));
    const checked = Date.parse(record.checkedAt);
    if (!Number.isFinite(checked) || checked > Date.now()) return null;
    return {
      checkedAt: new Date(checked).toISOString(),
      active: Date.now() - checked < 180_000,
    };
  } catch (error) {
    if (error.code === 'ENOENT' || error instanceof SyntaxError) return null;
    throw error;
  }
}
export const defaultDeliveryTracker = createDeliveryTracker({
  ensureSchema: ensureDeliveryMonitoringSchema,
  execute,
});
export const defaultDeliveryMonitoring = createDeliveryMonitoring({
  queryRows,
  ensureSchema: ensureDeliveryMonitoringSchema,
  getHealth: readDefaultSchedulerHealth,
  enabled: () => automationsEnabled(env),
  externalStatus: readExternalDeliveryMonitor,
});
const synchronizeIncidents = createIncidentSynchronizer({
  withTransaction,
  push: async (userId, payload) => {
    await enviarPushParaUsuario(userId, payload).catch((error) =>
      logger.error('falha na notificação do monitor', error),
    );
  },
});

async function whatsappState(
  userId: number,
): Promise<'connected' | 'disconnected' | 'unknown' | 'missing'> {
  const devices = await queryRows(
    'SELECT sessao FROM whatsapp_devices WHERE user_id=:userId ORDER BY principal DESC,id LIMIT 1',
    { userId },
  );
  if (!devices.length) return 'missing';
  if (!env.whatsapp.sessionApiUrl) return 'unknown';
  const session = encodeURIComponent(String(devices[0].sessao));
  const endpoint = env.whatsapp.sessionStatusPath.replace(
    /\{\s*session\s*\}|:session\b|\[\s*session\s*\]/gi,
    session,
  );
  const headers = env.whatsapp.sessionApiToken
    ? {
        Authorization: `Bearer ${env.whatsapp.sessionApiToken}`,
        token: env.whatsapp.sessionApiToken,
      }
    : {};
  try {
    const response = await fetchWithTimeout(
      env.whatsapp.sessionApiUrl +
        (endpoint.startsWith('/') ? '' : '/') +
        endpoint,
      { headers, redirect: 'error' },
      10_000,
    );
    if (!response.ok) return 'unknown';
    const data = await response.json();
    const state = String(data?.status || data?.state || '').toLowerCase();
    if (
      data?.connected === true ||
      ['connected', 'conectado', 'open'].includes(state)
    )
      return 'connected';
    if (
      data?.connected === false ||
      [
        'disconnected',
        'desconectado',
        'close',
        'closed',
        'qr',
        'qrcode',
      ].includes(state)
    )
      return 'disconnected';
    return 'unknown';
  } catch {
    return 'unknown';
  }
}

export async function checkDeliveryMonitoring({ external = false } = {}) {
  if (!automationsEnabled(env)) return { disabled: true, users: 0 };
  await ensureDeliveryMonitoringSchema();
  const connection = await db.getConnection();
  const lock =
    'gestor-monitor-' +
    createHash('sha256').update(env.db.name).digest('hex').slice(0, 24);
  let locked = false;
  try {
    const [rows]: any = await connection.query(
      'SELECT GET_LOCK(:lock,0) AS acquired',
      { lock },
    );
    locked = Number(rows[0]?.acquired) === 1;
    if (!locked) return { busy: true, users: 0 };
    const users = await queryRows(
      "SELECT user_id AS userId FROM cobrancas WHERE status IN ('Ativo','Pausada') UNION SELECT user_id AS userId FROM automation_incidents WHERE resolved_at IS NULL",
    );
    for (const { userId } of users) {
      const snapshot = await defaultDeliveryMonitoring.snapshot(Number(userId));
      const state = snapshot.rules.some((rule) => rule.active)
        ? await whatsappState(Number(userId))
        : 'connected';
      await synchronizeIncidents(
        Number(userId),
        deliveryIssues(snapshot, state),
      );
    }
    // Retain exactly the same three-month window as the delivery history.
    await execute(
      'DELETE FROM automation_delivery_attempts WHERE iniciado_em < DATE_SUB(UTC_TIMESTAMP(),INTERVAL 3 MONTH) LIMIT 1000',
    );
    if (external) {
      const file = monitorFile(),
        temporary = file + '.tmp';
      await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
      await fs.writeFile(
        temporary,
        JSON.stringify({ checkedAt: new Date().toISOString() }),
        { mode: 0o600 },
      );
      await fs.rename(temporary, file);
    }
    return { users: users.length };
  } finally {
    if (locked)
      await connection
        .query('SELECT RELEASE_LOCK(:lock)', { lock })
        .catch(() => undefined);
    connection.release();
  }
}

export function createDeliveryWatchdog({
  check = checkDeliveryMonitoring,
  onError = (error: unknown) =>
    logger.error('falha na verificação dos envios', error),
  intervalMs = 60_000,
} = {}) {
  let timer: ReturnType<typeof setTimeout> | undefined,
    pending: Promise<unknown> | undefined,
    stopped = true;
  const tick = () => {
    if (stopped) return;
    pending = Promise.resolve()
      .then(() => check())
      .catch(onError)
      .finally(() => {
        pending = undefined;
        if (!stopped) {
          timer = setTimeout(tick, intervalMs);
          timer.unref();
        }
      });
  };
  return {
    start() {
      if (!stopped) return;
      stopped = false;
      tick();
    },
    async stop() {
      stopped = true;
      clearTimeout(timer);
      await pending;
    },
  };
}

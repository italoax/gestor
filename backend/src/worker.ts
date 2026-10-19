import { safeError } from '../../src/security/safeError.ts';
import { stopWhenSupervisorExits } from '../../src/services/supervisorLifecycle.ts';
import {
  automationsEnabled,
  startEnabledAutomations,
} from '../../src/security/automationPolicy.ts';
import express from 'express';
import { createWorker } from './create-worker.ts';
import { env } from '../../src/config/env.ts';
import { db, execute } from '../../src/db/mysql.ts';
import { ensureCobrancasEnviosSchema } from '../../src/db/cobrancasEnviosSchema.ts';
import { appTodayIso } from '../../src/services/dates.ts';
import { createLogger } from '../../src/services/logger.ts';
import { createAutomationHistoryRetention } from '../../src/services/automationHistoryRetention.ts';
import {
  startCobrancasScheduler,
  stopCobrancasScheduler,
} from '../../src/services/cobrancasScheduler.ts';
import {
  startStatusScheduler,
  stopStatusScheduler,
} from '../../src/services/statusScheduler.ts';
import {
  startBackupScheduler,
  stopBackupScheduler,
} from '../../src/services/backupScheduler.ts';
import { createErrorHandler } from '../../src/middleware/errorHandler.ts';

const historyLogger = createLogger('historico-envios');
const historyRetention = createAutomationHistoryRetention({
  enabled: () => automationsEnabled(env),
  today: appTodayIso,
  ensureSchema: ensureCobrancasEnviosSchema,
  execute,
  onError: (error) =>
    historyLogger.error('Erro na limpeza do histórico de envios.', error),
  onCleanup: (deleted, cutoff) =>
    historyLogger.info('Registros de envio com mais de 3 meses removidos.', {
      registros: deleted,
      anterioresA: cutoff,
    }),
});

let worker: Awaited<ReturnType<typeof createWorker>> | undefined;
try {
  const application = express();
  application.disable('x-powered-by');
  worker = await createWorker({
    application,
    handleError: createErrorHandler(env.nodeEnv),
    initialize: async () => {
      await db.query({ sql: 'SELECT 1', timeout: 5000 });
    },
    checkDatabase: () => db.query({ sql: 'SELECT 1', timeout: 5000 }),
    startAutomations() {
      startEnabledAutomations(
        env,
        startCobrancasScheduler,
        startStatusScheduler,
        startBackupScheduler,
        () => historyRetention.start(),
      );
    },
    async stopAutomations() {
      await Promise.all([
        stopCobrancasScheduler(),
        stopStatusScheduler(),
        stopBackupScheduler(),
        historyRetention.stop(),
      ]);
    },
    stopDevReload() {},
    async closeSessionStores() {},
    closeDatabase: () => db.end(),
  });
  worker.enableShutdownHooks(['SIGINT', 'SIGTERM']);
  stopWhenSupervisorExits();
  if (process.env.WORKER_SOCKET) await worker.listen(process.env.WORKER_SOCKET);
  else await worker.listen(env.workerPort, '127.0.0.1');
  const address = worker.getHttpServer().address();
  if (typeof address === 'string')
    process.send?.({ type: 'listening', socketPath: address });
  if (address && typeof address === 'object')
    process.send?.({ type: 'listening', port: address.port });
  if (process.env.GESTOR_COMPACT_LOGS === 'true') {
    console.log(
      env.runAutomations && !env.localMode
        ? '[Automações] Prontas.'
        : '[Automações] Desativadas; nenhum timer iniciado.',
    );
  } else {
    console.log(
      typeof address === 'string'
        ? '[Worker] Automações prontas no canal interno.'
        : `[Worker] Automações prontas na porta ${address?.port ?? env.workerPort}.`,
    );
    console.log(
      env.runAutomations && !env.localMode
        ? '[Worker] Automações explicitamente habilitadas.'
        : '[Worker] Automações desativadas; nenhum timer iniciado.',
    );
  }
} catch (error) {
  const databaseLimit =
    (error as { code?: string })?.code === 'ER_USER_LIMIT_REACHED';
  if (databaseLimit && process.env.LOG_VERBOSE !== 'true')
    console.error(
      '[Worker] MySQL atingiu um limite de recursos. As automações não puderam iniciar; verifique a cota na hospedagem.',
    );
  else console.error('Erro ao iniciar o worker NestJS:', safeError(error));
  if (worker) await worker.close();
  else await db.end();
  process.exit(databaseLimit ? 78 : 1);
}

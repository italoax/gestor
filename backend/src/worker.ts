import { safeError } from '../../src/security/safeError.ts';
import { startEnabledAutomations } from '../../src/security/automationPolicy.ts';
import express from 'express';
import { createWorker } from './create-worker.ts';
import { env } from '../../src/config/env.ts';
import { db } from '../../src/db/mysql.ts';
import { verifyDatabaseSchema } from '../../src/db/migrations.ts';
import { createDefaultLocalCronWorkflow } from '../../src/workflows/defaults.ts';
import {
  startCobrancasCron,
  stopCobrancasCron,
} from '../../src/services/cobrancasCron.ts';
import {
  startStatusCron,
  stopStatusCron,
} from '../../src/services/statusCron.ts';
import { createErrorHandler } from '../../src/middleware/errorHandler.ts';

let worker: Awaited<ReturnType<typeof createWorker>> | undefined;
try {
  const application = express();
  application.disable('x-powered-by');
  worker = await createWorker({
    application,
    features: { cron: createDefaultLocalCronWorkflow() },
    handleError: createErrorHandler(env.nodeEnv),
    initialize: async () => {
      await db.query('SELECT 1');
      if (!env.localMode) await verifyDatabaseSchema(db);
    },
    checkDatabase: () => db.query({ sql: 'SELECT 1', timeout: 5000 }),
    startAutomations() {
      startEnabledAutomations(env, startCobrancasCron, startStatusCron);
    },
    async stopAutomations() {
      await Promise.all([stopCobrancasCron(), stopStatusCron()]);
    },
    stopDevReload() {},
    async closeSessionStores() {},
    closeDatabase: () => db.end(),
  });
  worker.enableShutdownHooks(['SIGINT', 'SIGTERM']);
  if (process.env.WORKER_SOCKET) await worker.listen(process.env.WORKER_SOCKET);
  else await worker.listen(env.workerPort, '127.0.0.1');
  const address = worker.getHttpServer().address();
  if (typeof address === 'string')
    process.send?.({ type: 'listening', socketPath: address });
  if (address && typeof address === 'object')
    process.send?.({ type: 'listening', port: address.port });
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

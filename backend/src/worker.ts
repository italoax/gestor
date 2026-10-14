import express from 'express';
import { createWorker } from './create-worker.ts';
import { env } from '../../src/config/env.ts';
import { db } from '../../src/db/mysql.ts';
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
    },
    checkDatabase: () => db.query({ sql: 'SELECT 1', timeout: 5000 }),
    startAutomations() {
      if (!env.localMode) {
        startCobrancasCron();
        startStatusCron();
      }
    },
    async stopAutomations() {
      await Promise.all([stopCobrancasCron(), stopStatusCron()]);
    },
    stopDevReload() {},
    async closeSessionStores() {},
    closeDatabase: () => db.end(),
  });
  worker.enableShutdownHooks(['SIGINT', 'SIGTERM']);
  await worker.listen(env.workerPort, '127.0.0.1');
  console.log(
    `Worker NestJS de automações iniciado na porta ${env.workerPort}.`,
  );
} catch (error) {
  console.error('Erro ao iniciar o worker NestJS:', error);
  if (worker) await worker.close();
  else await db.end();
  process.exit(1);
}

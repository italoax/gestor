import { listarRenovacoesPendentes } from '../../src/services/renovacoesPendentes.js';
import bcrypt from 'bcryptjs';
import {
  createDefaultFeatures,
  createDefaultCronWorkflow,
} from '../../src/workflows/defaults.js';
import { urlPagamentoDoCliente } from '../../src/workflows/payment-defaults.js';
import { createDefaultPaymentWorkflow } from '../../src/workflows/payment-defaults.js';
import { createDefaultPaymentConfirmation } from '../../src/workflows/confirmation-defaults.js';
import { createDefaultClientMutationWorkflow } from '../../src/workflows/client-defaults.js';
import { createBackend } from './create-backend.js';
import { createApplication } from '../../src/app.js';
import { env } from '../../src/config/env.js';
import { db, queryRows, queryOne, execute } from '../../src/db/mysql.js';
import { jaSemeou, marcarSemeado } from '../../src/services/catalogSeeds.js';
import { aplicativosConfig } from '../../src/config/catalogs.js';
import { dispositivosConfig } from '../../src/config/catalogs.js';
import { createErrorHandler } from '../../src/middleware/errorHandler.js';
import { closeSessionStores } from '../../src/db/sessionStore.js';
import { ensureDatabaseSchema } from '../../src/db/schema.js';
import {
  startCobrancasCron,
  stopCobrancasCron,
} from '../../src/services/cobrancasCron.js';
import {
  startStatusCron,
  stopStatusCron,
} from '../../src/services/statusCron.js';

const { app: application, stopDevReload } = createApplication();
let backend: Awaited<ReturnType<typeof createBackend>> | undefined;
try {
  backend = await createBackend({
    application,
    features: { ...createDefaultFeatures(), cron: createDefaultCronWorkflow() },
    auth: { queryOne, comparePassword: bcrypt.compare },
    payments: createDefaultPaymentWorkflow(),
    confirmPayment: createDefaultPaymentConfirmation(),
    catalogs: {
      configs: {
        aplicativos: aplicativosConfig,
        dispositivos: dispositivosConfig,
      },
      queryRows,
      queryOne,
      execute,
      jaSemeou,
      marcarSemeado,
    },
    plansServers: { queryRows, queryOne, execute, jaSemeou, marcarSemeado },
    clientMutations: createDefaultClientMutationWorkflow(),
    clients: {
      queryRows,
      queryOne,
      execute,
      listPendingRenewals: listarRenovacoesPendentes,
      paymentUrl: urlPagamentoDoCliente,
    },
    handleError: createErrorHandler(env.nodeEnv),
    async initialize() {
      if (env.localMode) {
        await db.query('SELECT 1');
        console.log(
          'Modo local: automações e migrações desativadas; sessões em memória.',
        );
      } else await ensureDatabaseSchema();
    },
    checkDatabase: () => db.query({ sql: 'SELECT 1', timeout: 5000 }),
    startAutomations() {
      if (env.runAutomations) {
        startCobrancasCron();
        startStatusCron();
      }
    },
    async stopAutomations() {
      await Promise.all([stopCobrancasCron(), stopStatusCron()]);
    },
    stopDevReload,
    closeSessionStores,
    closeDatabase: () => db.end(),
  });
  backend.enableShutdownHooks(['SIGINT', 'SIGTERM']);
  await backend.listen(
    env.port,
    env.host ?? (env.localMode ? '127.0.0.1' : '0.0.0.0'),
  );
  console.log(
    `Gestor NestJS rodando em ${env.appUrl || `http://localhost:${env.port}`}`,
  );
} catch (error) {
  console.error('Erro ao iniciar o Gestor NestJS:', error);
  try {
    if (backend) await backend.close();
    else {
      stopDevReload();
      await closeSessionStores();
      await db.end();
    }
  } catch (cleanupError) {
    console.error('Erro ao encerrar após falha:', cleanupError);
  }
  process.exit(
    (error as { code?: string })?.code === 'ER_USER_LIMIT_REACHED' ? 78 : 1,
  );
}

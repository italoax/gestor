import { safeError } from '../../src/security/safeError.ts';
import { listarRenovacoesPendentes } from '../../src/services/renovacoesPendentes.ts';
import bcrypt from 'bcryptjs';
import { createLoginAttempts } from '../../src/services/loginAttempts.ts';
import { recordSecurityEvent } from '../../src/security/runtimeSecurity.ts';
import {
  createDefaultFeatures,
  createDefaultCronWorkflow,
} from '../../src/workflows/defaults.ts';
import { urlPagamentoDoCliente } from '../../src/workflows/payment-defaults.ts';
import { createDefaultPaymentWorkflow } from '../../src/workflows/payment-defaults.ts';
import { createDefaultPaymentConfirmation } from '../../src/workflows/confirmation-defaults.ts';
import { createDefaultClientMutationWorkflow } from '../../src/workflows/client-defaults.ts';
import { createBackend } from './create-backend.ts';
import { createApplication } from '../../src/app.ts';
import { env } from '../../src/config/env.ts';
import { db, queryRows, queryOne, execute } from '../../src/db/mysql.ts';
import { jaSemeou, marcarSemeado } from '../../src/services/catalogSeeds.ts';
import { aplicativosConfig } from '../../src/config/catalogs.ts';
import { dispositivosConfig } from '../../src/config/catalogs.ts';
import { createErrorHandler } from '../../src/middleware/errorHandler.ts';
import { closeSessionStores } from '../../src/db/sessionStore.ts';
import { verifyDatabaseSchema } from '../../src/db/migrations.ts';
import {
  startCobrancasCron,
  stopCobrancasCron,
} from '../../src/services/cobrancasCron.ts';
import {
  startStatusCron,
  stopStatusCron,
} from '../../src/services/statusCron.ts';

const { app: application, stopDevReload } = createApplication();
let backend: Awaited<ReturnType<typeof createBackend>> | undefined;
try {
  backend = await createBackend({
    application,
    features: { ...createDefaultFeatures(), cron: createDefaultCronWorkflow() },
    auth: {
      queryOne,
      comparePassword: bcrypt.compare,
      loginAttempts: createLoginAttempts({
        execute,
        queryOne,
        audit: recordSecurityEvent,
      }),
      auditSecurity: recordSecurityEvent,
    },
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
      } else await verifyDatabaseSchema(db);
    },
    checkDatabase: () => db.query({ sql: 'SELECT 1', timeout: 5000 }),
    startAutomations() {
      // O worker é o único dono dos timers; o backend apenas encaminha o cron.
    },
    async stopAutomations() {
      await Promise.all([stopCobrancasCron(), stopStatusCron()]);
    },
    stopDevReload,
    closeSessionStores,
    closeDatabase: () => db.end(),
  });
  process.on('message', (message: unknown) => {
    const value = message as { type?: string; url?: string };
    if (value?.type === 'worker-url' && typeof value.url === 'string') {
      const url = new URL(value.url);
      if (url.protocol === 'http:' && url.hostname === '127.0.0.1')
        env.workerUrl = url.origin;
    }
  });
  backend.enableShutdownHooks(['SIGINT', 'SIGTERM']);
  if (process.env.BACKEND_SOCKET)
    await backend.listen(process.env.BACKEND_SOCKET);
  else
    await backend.listen(
      env.port,
      env.host ?? (env.localMode ? '127.0.0.1' : '0.0.0.0'),
    );
  const address = backend.getHttpServer().address();
  if (typeof address === 'string')
    process.send?.({ type: 'listening', socketPath: address });
  if (address && typeof address === 'object')
    process.send?.({ type: 'listening', port: address.port });
  console.log(
    `[Backend] Pronto em ${env.appUrl || `http://localhost:${env.port}`}`,
  );
} catch (error) {
  const databaseLimit =
    (error as { code?: string })?.code === 'ER_USER_LIMIT_REACHED';
  if (databaseLimit && process.env.LOG_VERBOSE !== 'true')
    console.error(
      '[Backend] MySQL atingiu um limite de recursos. Se for o limite de conexões por hora, aguarde a renovação da cota ou solicite a liberação à hospedagem.',
    );
  else console.error('Erro ao iniciar o Gestor NestJS:', safeError(error));
  try {
    if (backend) await backend.close();
    else {
      stopDevReload();
      await closeSessionStores();
      await db.end();
    }
  } catch (cleanupError) {
    console.error('Erro ao encerrar após falha:', safeError(cleanupError));
  }
  process.exit(databaseLimit ? 78 : 1);
}

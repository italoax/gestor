import { createApplication } from './app.js';
import { env } from './config/env.js';
import { db } from './db/mysql.js';
import { closeSessionStores } from './db/sessionStore.js';
import { ensureDatabaseSchema } from './db/schema.js';
import {
  startCobrancasCron,
  stopCobrancasCron,
} from './services/cobrancasCron.js';
import { startStatusCron, stopStatusCron } from './services/statusCron.js';

const { app, stopDevReload } = createApplication();

let httpServer = null;
let shuttingDown = false;
// Encerra o servidor de forma limpa: para de aceitar conexões novas, deixa as
// em curso terminarem (até 30s), fecha a pool do MySQL e sai. Sem isso, requests
// em curso eram abortadas a cada deploy/restart (cliente via "Erro de conexão").
async function shutdownGracefully(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[shutdown] ${signal} recebido — encerrando...`);
  const timeout = setTimeout(() => {
    console.warn('[shutdown] timeout — forçando saída');
    process.exit(1);
  }, 30000);
  try {
    stopDevReload();
    const jobs = Promise.all([stopCobrancasCron(), stopStatusCron()]);
    if (httpServer) {
      await new Promise((resolve, reject) =>
        httpServer.close((error) => (error ? reject(error) : resolve())),
      );
    }
    await jobs;
    await closeSessionStores();
    await db.end();
    clearTimeout(timeout);
    process.exit(0);
  } catch (error) {
    console.error('[shutdown] erro ao encerrar:', error);
    clearTimeout(timeout);
    process.exit(1);
  }
}
process.on('SIGINT', () => void shutdownGracefully('SIGINT'));
process.on('SIGTERM', () => void shutdownGracefully('SIGTERM'));
async function startServer() {
  if (env.localMode) {
    await db.query('SELECT 1');
    console.log(
      'Modo local: automações e migrações desativadas; sessões apenas em memória.',
    );
  } else {
    await ensureDatabaseSchema();
  }
  if (shuttingDown) return;
  httpServer = app.listen(
    {
      port: env.port,
      host: env.host ?? (env.localMode ? '127.0.0.1' : undefined),
    },
    () => {
      startCobrancasCron();
      startStatusCron();
      // Exibe a URL pública configurada, que pode diferir da porta do processo.
      const url =
        env.appUrl && env.appUrl.trim()
          ? env.appUrl
          : `http://localhost:${env.port}`;
      console.log(`Gestor Node rodando em ${url}`);
    },
  );
  httpServer.on('error', (error) => {
    console.error('Erro no servidor HTTP:', error);
    void shutdownGracefully('HTTP error');
  });
}
startServer().catch((error) => {
  console.error('Erro ao iniciar o Gestor Node:', error);
  if (error?.code === 'ER_USER_LIMIT_REACHED') {
    console.error(
      'Limite de recursos do MySQL atingido. Aguarde a liberacao pelo provedor antes de reiniciar.',
    );
    process.exit(78);
  }
  process.exit(1);
});

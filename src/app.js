import express from 'express';
import flash from 'connect-flash';
import { env } from './config/env.js';
import { configureHttp } from './config/http.js';
import { projectRoot, publicRoot } from './config/paths.js';
import { exposeLocals } from './middleware/auth.js';
import { installAssets } from './middleware/assets.js';
import { csrfMiddleware } from './middleware/csrf.js';
import { installDevReload } from './middleware/devReload.js';
import { createErrorHandler } from './middleware/errorHandler.js';
import { createSessionMiddleware } from './middleware/sessions.js';
import { exposeFormatLocals } from './middleware/viewLocals.js';
import { installRoutes } from './routes/index.js';
import { cronRouter, healthRouter } from './routes/system.js';

// Monta o aplicativo sem abrir a porta HTTP nem iniciar automações.
// src/server.js controla a inicialização e o encerramento do processo.
export function createApplication() {
  const app = express();
  const development = env.nodeEnv === 'development';
  const stopDevReload =
    development && process.env.GESTOR_DEV_RELOAD === '1'
      ? installDevReload(app, projectRoot)
      : () => {};

  configureHttp(app, projectRoot, env);
  installAssets(app, publicRoot, { development });
  app.use(healthRouter);

  app.use(createSessionMiddleware(env));
  app.use(flash());
  // CSRF pode renderizar uma página de erro; seus locals já precisam existir.
  app.use(exposeLocals);
  app.use(csrfMiddleware);
  app.use(exposeFormatLocals);

  app.use(cronRouter);
  installRoutes(app);
  app.use(createErrorHandler(env.nodeEnv));

  return { app, stopDevReload };
}

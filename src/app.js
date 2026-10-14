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
import {
  prepareFrontendSession,
  exposeFrontendPage,
} from './middleware/frontendPages.js';
import { installNativeRouteMiddleware } from './middleware/nativeRoutes.js';

// Monta o aplicativo sem abrir a porta HTTP nem iniciar automações.
// O Nest controla a inicialização e o encerramento do processo.
export function createApplication({
  runtimeEnv = env,
  sessionStoreFactory,
  nativeRouteMiddleware = installNativeRouteMiddleware,
} = {}) {
  const app = express();
  const development = runtimeEnv.nodeEnv === 'development';
  const stopDevReload =
    development && process.env.GESTOR_DEV_RELOAD === '1'
      ? installDevReload(app, projectRoot)
      : () => {};

  configureHttp(app, projectRoot, runtimeEnv);
  installAssets(app, publicRoot, { development });

  const routes = express.Router();

  routes.use(createSessionMiddleware(runtimeEnv, sessionStoreFactory));
  routes.use(prepareFrontendSession);
  routes.use(flash());
  routes.use(exposeFrontendPage);
  // CSRF pode renderizar uma página de erro; seus locals já precisam existir.
  routes.use(exposeLocals);
  routes.use(csrfMiddleware);
  routes.use(exposeFormatLocals);

  nativeRouteMiddleware(routes);
  routes.use(createErrorHandler(runtimeEnv.nodeEnv));
  app.use((req, res, next) => {
    // O controller Nest atende saúde antes das sessões e da autorização.
    if (
      ['GET', 'HEAD'].includes(req.method) &&
      /^\/healthz\/?$/i.test(req.path)
    )
      return next();
    return routes(req, res, next);
  });

  return { app, stopDevReload };
}

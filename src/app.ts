import express from 'express';
import flash from 'connect-flash';
import { env } from './config/env.ts';
import { configureHttp } from './config/http.ts';
import { projectRoot, publicRoot } from './config/paths.ts';
import { exposeLocals } from './middleware/auth.ts';
import { installAssets } from './middleware/assets.ts';
import { csrfMiddleware } from './middleware/csrf.ts';
import { installDevReload } from './middleware/devReload.ts';
import { createErrorHandler } from './middleware/errorHandler.ts';
import { createSessionMiddleware } from './middleware/sessions.ts';
import { exposeFormatLocals } from './middleware/viewLocals.ts';
import {
  prepareFrontendSession,
  exposeFrontendPage,
} from './middleware/frontendPages.ts';
import { installNativeRouteMiddleware } from './middleware/nativeRoutes.ts';
import { exposeFrontendAction } from './middleware/frontendActions.ts';

// Monta o aplicativo sem abrir a porta HTTP nem iniciar automações.
// O Nest controla a inicialização e o encerramento do processo.
export function createApplication({
  runtimeEnv = env,
  sessionStoreFactory,
  nativeRouteMiddleware = installNativeRouteMiddleware,
}: Record<string, any> = {}) {
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
  routes.use(exposeFrontendAction);
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

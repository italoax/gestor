import { requireAuth } from './auth.js';
import { invalidarCacheMiddleware } from './invalidarCache.js';
import {
  loginRateLimit,
  accountRateLimit,
  portalRateLimit,
  aliasRateLimit,
  criarPixRateLimit,
} from './rateLimits.js';
import { statusUploadMiddleware } from './statusUpload.js';

// Somente infraestrutura HTTP. Todas as ações são atendidas pelos controllers Nest.
export function installNativeRouteMiddleware(app) {
  app.use(['/pagar', '/p'], (_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    res.set('Referrer-Policy', 'no-referrer');
    next();
  });
  app.get('/r/:alias', aliasRateLimit);
  app.post('/pagar/:token/criar', criarPixRateLimit);
  app.use(['/area-cliente', '/acessos-clientes'], (_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    res.set('Referrer-Policy', 'no-referrer');
    next();
  });
  app.post('/login', loginRateLimit);
  app.get('/area-cliente/login', portalRateLimit);
  app.post('/area-cliente/login', portalRateLimit);
  app.post('/minha-conta', requireAuth, accountRateLimit);
  app.post('/status', requireAuth, statusUploadMiddleware);
  app.use((req, res, next) => {
    const path = req.path.toLowerCase().replace(/\/$/, '') || '/';
    const read = ['GET', 'HEAD'].includes(req.method);
    const write = req.method === 'POST';
    const publicRead =
      read &&
      ([
        '/',
        '/ix-streaming',
        '/login',
        '/register',
        '/area-cliente/login',
        '/area-cliente',
        '/__cron/cobrancas',
      ].includes(path) ||
        /^\/(?:r\/[^/]+|(?:pagar|p)\/[^/]+|pagar\/[^/]+\/status\/[^/]+)$/.test(
          path,
        ));
    const publicWrite =
      write &&
      ([
        '/login',
        '/register',
        '/logout',
        '/area-cliente/login',
        '/area-cliente/sair',
        '/area-cliente/renovar',
      ].includes(path) ||
        /^\/(?:pagar\/[^/]+\/criar|webhook\/(?:mercadopago|asaas|openpix|pagbank|pagarme))$/.test(
          path,
        ));
    return publicRead || publicWrite ? next() : requireAuth(req, res, next);
  });
  app.use(invalidarCacheMiddleware);
}

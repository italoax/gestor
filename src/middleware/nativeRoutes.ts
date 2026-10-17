import { requireAuth, createAdminAuthorization } from './auth.ts';
import bcrypt from 'bcryptjs';
import { execute, queryOne, queryRows } from '../db/mysql.ts';
import { recordSecurityEvent } from '../security/runtimeSecurity.ts';
import { createAccountSessionActions } from '../security/accountSessions.ts';
import { requireRecentAuthentication } from './recentAuthentication.ts';
import { invalidarCacheMiddleware } from './invalidarCache.ts';
import {
  loginRateLimit,
  accountRateLimit,
  portalRateLimit,
  aliasRateLimit,
  criarPixRateLimit,
  sensitiveRateLimit,
  adminWriteRateLimit,
} from './rateLimits.ts';
import { statusUploadMiddleware } from './statusUpload.ts';

// Somente infraestrutura HTTP. Todas as ações são atendidas pelos controllers Nest.
export function installNativeRouteMiddleware(app) {
  app.use(
    '/admin',
    requireAuth,
    createAdminAuthorization(queryOne, Date.now, recordSecurityEvent),
    adminWriteRateLimit,
  );
  app.get(
    '/admin/security/events',
    requireRecentAuthentication,
    async (req, res, next) => {
      try {
        const events = await queryRows(
          'SELECT id, created_at AS createdAt, event, severity, user_id AS userId, source_hash AS sourceHash, reason, count_value AS count FROM security_events ORDER BY id DESC LIMIT 100',
        );
        res.set('Cache-Control', 'no-store').json({
          events,
          alerts: events.filter((e) => e.severity === 'alert'),
        });
      } catch (error) {
        next(error);
      }
    },
  );
  const sessionAction = createAccountSessionActions({
    execute,
    queryOne,
    comparePassword: bcrypt.compare,
    audit: recordSecurityEvent,
  });
  app.post(
    ['/minha-conta/confirmar', '/minha-conta/sessoes/revogar'],
    requireAuth,
    accountRateLimit,
    sessionAction,
  );
  app.post(
    [
      '/minha-conta/pix',
      '/integracao-pagamento',
      '/integracoes',
      '/acessos-clientes',
    ],
    requireAuth,
    sensitiveRateLimit,
    requireRecentAuthentication,
  );
  app.get(
    '/minha-conta/backup',
    requireAuth,
    sensitiveRateLimit,
    requireRecentAuthentication,
  );
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

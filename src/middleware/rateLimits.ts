import rateLimit from 'express-rate-limit';
import { execute, queryOne } from '../db/mysql.ts';
import { SharedRateStore } from '../security/sharedRateStore.ts';
import { recordSecurityEvent } from '../security/runtimeSecurity.ts';

export function createRateLimiters({
  shared = false,
  db = { execute, queryOne },
  audit = async (..._args: any[]) => {},
} = {}) {
  const make = (bucket, options) =>
    rateLimit({
      standardHeaders: 'draft-7',
      legacyHeaders: false,
      ...(shared ? { store: new SharedRateStore(db, bucket) } : {}),
      handler: async (req, res) => {
        await audit('login.rate_limited', {
          userId: req.session?.user?.id,
          ip: req.ip,
          reason: bucket,
        });
        res
          .status(429)
          .send(
            'Muitas tentativas. Aguarde o prazo informado antes de tentar novamente.',
          );
      },
      ...options,
    });
  return {
    loginRateLimit: make('login-ip', {
      windowMs: 15 * 60_000,
      limit: 5,
      skipSuccessfulRequests: true,
      requestWasSuccessful: (_req, res) =>
        res.locals.loginSucceeded === true ||
        res.locals.loginStepSucceeded === true,
    }),
    accountRateLimit: make('account-write', {
      windowMs: 15 * 60_000,
      limit: 10,
      keyGenerator: (req) => String(req.session.user.id),
    }),
    sensitiveRateLimit: make('sensitive-write', {
      windowMs: 15 * 60_000,
      limit: 20,
      keyGenerator: (req) => String(req.session.user.id),
    }),
    adminWriteRateLimit: make('admin-write', {
      windowMs: 15 * 60_000,
      limit: 20,
      keyGenerator: (req) => String(req.session.user.id),
      skip: (req) => ['GET', 'HEAD', 'OPTIONS'].includes(req.method),
    }),
    portalRateLimit: make('portal-ip', { windowMs: 15 * 60_000, limit: 10 }),
    aliasRateLimit: make('alias-ip', { windowMs: 60_000, limit: 60 }),
    criarPixRateLimit: make('pix-ip', { windowMs: 5 * 60_000, limit: 10 }),
  };
}
export const {
  loginRateLimit,
  accountRateLimit,
  sensitiveRateLimit,
  adminWriteRateLimit,
  portalRateLimit,
  aliasRateLimit,
  criarPixRateLimit,
} = createRateLimiters({
  shared:
    process.env.NODE_ENV === 'production' ||
    process.env.SHARED_RATE_LIMITS === 'true',
  audit: recordSecurityEvent,
});

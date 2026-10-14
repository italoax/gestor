import rateLimit from 'express-rate-limit';
export const loginRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  requestWasSuccessful: (_req, res) => res.locals.loginSucceeded === true,
  message:
    'Muitas tentativas de login. Aguarde 15 minutos antes de tentar de novo.',
});
export const accountRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  keyGenerator: (req) => String(req.session.user.id),
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: 'Muitas tentativas de alteração da conta. Aguarde 15 minutos.',
});
export const portalRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: 'Muitas tentativas. Aguarde 15 minutos.',
});
export const aliasRateLimit = rateLimit({
  windowMs: 60000,
  limit: 60,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
});
export const criarPixRateLimit = rateLimit({
  windowMs: 5 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    ok: false,
    error: 'Muitas tentativas. Aguarde alguns minutos e tente de novo.',
  },
});

import { Router } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { queryOne } from '../db/mysql.js';
// Brute-force no /login: 5 tentativas a cada 15min por IP. Conta requests só
// quando bate senha errada (skipSuccessfulRequests), pra usuário legítimo que
// digitou errado uma vez não ficar bloqueado depois de logar.
const loginRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  requestWasSuccessful: (_req, res) => res.locals.loginSucceeded === true,
  message:
    'Muitas tentativas de login. Aguarde 15 minutos antes de tentar de novo.',
});
export const authRouter = Router();
const REMEMBER_ME_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 30;
function wantsPersistentLogin(value) {
  return ['1', 'true', 'on', 'yes', 'sim'].includes(
    String(value ?? '').toLowerCase(),
  );
}
authRouter.get('/login', (req, res) => {
  res.set('Cache-Control', 'no-store');
  if (req.session.user) return res.redirect('/dashboard');
  if (req.query.session_check === '1') {
    // Prova de ida e volta: o token veio do formulário recém-carregado, mas
    // só coincide se o navegador devolveu o cookie e o store preservou a sessão.
    const valid =
      Boolean(req.session.csrfToken) &&
      req.get('x-csrf-token') === req.session.csrfToken;
    return res.status(valid ? 200 : 409).json({ ok: valid });
  }
  res.render('pages/login', { title: 'Login' });
});
authRouter.post('/login', loginRateLimit, async (req, res, next) => {
  try {
    const username = String(req.body.username ?? '').trim();
    const password = String(req.body.password ?? '');
    const user = await queryOne(
      'SELECT id, name, username, email, password_hash AS passwordHash, is_admin AS isAdmin FROM users WHERE username = :username LIMIT 1',
      { username },
    );
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      console.warn(
        `[login] FALHA user="${username}" ip=${req.ip} ua="${req.get('user-agent') ?? ''}"`,
      );
      req.flash('error', 'Usuário ou senha inválidos.');
      return res.redirect('/login');
    }
    console.log(`[login] OK user="${username}" id=${user.id} ip=${req.ip}`);
    const remember = wantsPersistentLogin(req.body.remember);
    // Session fixation: regenera o ID antes de marcar o user como logado.
    // Sem isso, um atacante que conseguisse plantar um cookie de sessão antes
    // do login depois teria acesso à sessão autenticada com o mesmo ID.
    req.session.regenerate((err) => {
      if (err) return next(err);
      req.session.user = {
        id: user.id,
        name: user.name,
        username: user.username,
        email: user.email,
        isAdmin: Boolean(user.isAdmin),
      };
      req.session.cookie.maxAge = remember ? REMEMBER_ME_MAX_AGE_MS : undefined;
      req.session.save((saveErr) => {
        if (saveErr) return next(saveErr);
        res.locals.loginSucceeded = true;
        res.redirect('/dashboard');
      });
    });
  } catch (error) {
    next(error);
  }
});
authRouter.get('/register', (_req, res) => res.redirect('/login'));
authRouter.post('/register', (_req, res) =>
  res.status(403).send('Cadastro publico desativado.'),
);
authRouter.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/login'));
});

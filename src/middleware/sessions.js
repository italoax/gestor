import session from 'express-session';
import { createSessionStore } from '../db/sessionStore.js';

export function createSessionMiddleware(
  env,
  storeFactory = createSessionStore,
) {
  // Nome exclusivo: cookies connect.sid de versões antigas/outros apps não
  // podem substituir a sessão do painel durante o login.
  const painelSession = session({
    name: 'ixstreaming.painel.sid',
    store: storeFactory(),
    secret: env.sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: env.cookieSecure,
    },
  });
  const clienteSession = session({
    name: 'ixstreaming.cliente.sid',
    store: storeFactory(),
    secret: env.sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      path: '/area-cliente',
      httpOnly: true,
      sameSite: 'lax',
      secure: env.cookieSecure,
    },
  });
  return (req, res, next) => {
    const portal =
      req.path === '/area-cliente' || req.path.startsWith('/area-cliente/');
    // Remove o cookie do painel emitido com o path do portal pela versão anterior.
    if (!portal && req.path === '/login') {
      res.clearCookie('ixstreaming.painel.sid', {
        path: '/area-cliente',
        httpOnly: true,
        sameSite: 'lax',
        secure: env.cookieSecure,
      });
    }
    return (portal ? clienteSession : painelSession)(req, res, (error) => {
      if (error) return next(error);
      // Sessões persistidas antes da correção também precisam do path correto.
      req.session.cookie.path = portal ? '/area-cliente' : '/';
      next();
    });
  };
}

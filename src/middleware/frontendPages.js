import { csrfMiddleware } from './csrf.js';
import { nativePageData } from '../services/frontendPageData.js';
import {
  isSitePage,
  safeReturnPath,
  sessionBootstrapPath,
  needsFrontendSession,
} from '../frontend/pageRoutes.js';

// Estabelece o cookie no navegador, antes da leitura SSR. O fetch do servidor
// Next não pode entregar um Set-Cookie do Express ao navegador por si só.
export function prepareFrontendSession(req, res, next) {
  const bootstrap = [
    '/__frontend/session',
    '/area-cliente/__frontend/session',
  ].includes(req.path);
  if (bootstrap && req.method === 'GET') {
    return csrfMiddleware(req, res, () => {
      res.redirect(303, safeReturnPath(req.query.return));
    });
  }
  if (
    req.method === 'GET' &&
    req.get('x-gestor-page') === '1' &&
    needsFrontendSession(req.path) &&
    !req.session.csrfToken
  ) {
    return res.redirect(
      303,
      `${sessionBootstrapPath(req.path)}?return=${encodeURIComponent(req.originalUrl)}`,
    );
  }
  next();
}

// Envia somente o documento que já seria visível nesta rota, nunca todos os
// locals, a sessão ou linhas completas do banco. A autorização fica na rota.
export function exposeFrontendPage(req, res, next) {
  if (
    req.method !== 'GET' ||
    req.get('x-gestor-page') !== '1' ||
    !isSitePage(req.path)
  )
    return next();
  const render = res.render.bind(res);
  res.render = (view, options, callback) => {
    if (callback || typeof options === 'function' || !view.startsWith('pages/'))
      return render(view, options, callback);
    const model = nativePageData(view, res.locals, options);
    if (model) return res.set('Cache-Control', 'private, no-store').json(model);
    return render(view, options, (error, html) => {
      if (error) return next(error);
      res.set('Cache-Control', 'private, no-store');
      res.json({ view, html, status: res.statusCode });
    });
  };
  next();
}

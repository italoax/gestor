import { queryOne } from '../db/mysql.ts';
export function requireAuth(req, res, next) {
  if (!req.session.user) {
    if (req.path.startsWith('/api/')) {
      return res
        .status(401)
        .json({ ok: false, error: 'Faça login para continuar.' });
    }
    res.redirect('/login');
    return;
  }
  next();
}
// Gate do /admin/*. Consulta is_admin FRESH no banco (nao confia so na sessao):
// se o admin for rebaixado, perde acesso na hora sem precisar deslogar. Roda
// depois do requireAuth, entao session.user existe.
export function createAdminAuthorization(
  lookupUser = queryOne,
  now = Date.now,
  audit = async (..._args: any[]) => {},
) {
  return async function requireAdmin(req, res, next) {
    try {
      const userId = req.session.user?.id;
      if (!userId) return res.redirect('/login');
      const row = await lookupUser(
        'SELECT is_admin AS isAdmin FROM users WHERE id = :id LIMIT 1',
        { id: userId },
      );
      if (!row || !Number(row.isAdmin)) {
        await audit('admin.denied', {
          userId,
          ip: req.ip,
          reason: 'permission',
        });
        return res.status(403).render('pages/error', {
          title: 'Acesso negado',
          error: { message: 'Área restrita ao administrador do sistema.' },
        });
      }
      // Mantem a flag da sessao em dia pro sidebar refletir.
      if (req.session.user) req.session.user.isAdmin = true;
      if (
        !['GET', 'HEAD', 'OPTIONS'].includes(req.method) &&
        (!req.session.security?.authenticatedAt ||
          now() -
            (req.session.security.recentAuthAt ??
              req.session.security.authenticatedAt) >
            15 * 60_000)
      ) {
        return res.status(403).render('pages/error', {
          title: 'Confirme sua identidade',
          error: {
            message:
              'Entre novamente para realizar esta operação administrativa.',
          },
        });
      }
      if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method))
        await audit('admin.critical', {
          userId,
          ip: req.ip,
          reason: 'write_requested',
        });
      next();
    } catch (error) {
      next(error);
    }
  };
}
export const requireAdmin = createAdminAuthorization();
export function exposeLocals(req, res, next) {
  res.locals.user = req.session.user ?? null;
  res.locals.currentPath = req.path;
  res.locals.success = req.flash('success');
  res.locals.error = req.flash('error');
  next();
}

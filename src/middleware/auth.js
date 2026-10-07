import { queryOne } from '../db/mysql.js';
export function requireAuth(req, res, next) {
  if (!req.session.user) {
    res.redirect('/login');
    return;
  }
  next();
}
// Gate do /admin/*. Consulta is_admin FRESH no banco (nao confia so na sessao):
// se o admin for rebaixado, perde acesso na hora sem precisar deslogar. Roda
// depois do requireAuth, entao session.user existe.
export async function requireAdmin(req, res, next) {
  try {
    const userId = req.session.user?.id;
    if (!userId) return res.redirect('/login');
    const row = await queryOne(
      'SELECT is_admin AS isAdmin FROM users WHERE id = :id LIMIT 1',
      { id: userId },
    );
    if (!row || !row.isAdmin) {
      return res.status(403).render('pages/error', {
        title: 'Acesso negado',
        error: { message: 'Área restrita ao administrador do sistema.' },
      });
    }
    // Mantem a flag da sessao em dia pro sidebar refletir.
    if (req.session.user) req.session.user.isAdmin = true;
    next();
  } catch (error) {
    next(error);
  }
}
export function exposeLocals(req, res, next) {
  res.locals.user = req.session.user ?? null;
  res.locals.currentPath = req.path;
  res.locals.success = req.flash('success');
  res.locals.error = req.flash('error');
  next();
}

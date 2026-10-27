import { hasRecentAuthentication } from '../services/sessionSecurity.ts';
export function requireRecentAuthentication(req, res, next) {
  if (hasRecentAuthentication(req.session?.security)) return next();
  res.status(403);
  if (
    (req.get('accept') || '').includes('application/json') ||
    req.get('x-gestor-action') === '1'
  )
    return res.json({
      ok: false,
      error: 'Por segurança, saia e entre novamente antes desta operação.',
      reauthenticate: '/login',
    });
  return res.render('pages/error', {
    title: 'Confirme sua identidade',
    error: {
      message: 'Por segurança, saia e entre novamente antes desta operação.',
    },
  });
}

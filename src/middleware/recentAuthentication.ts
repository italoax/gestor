export function requireRecentAuthentication(req, res, next) {
  const security = req.session?.security;
  const at = security?.recentAuthAt ?? security?.authenticatedAt;
  if (Number.isFinite(at) && Date.now() >= at && Date.now() - at <= 15 * 60_000)
    return next();
  res.status(403);
  if (
    (req.get('accept') || '').includes('application/json') ||
    req.get('x-gestor-action') === '1'
  )
    return res.json({
      ok: false,
      error: 'Confirme sua senha em Minha Conta antes desta operação.',
      reauthenticate: '/minha-conta?confirmar=1',
    });
  return res.render('pages/error', {
    title: 'Confirme sua identidade',
    error: {
      message: 'Confirme sua senha em Minha Conta antes desta operação.',
    },
  });
}

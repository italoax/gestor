import { invalidarDashboardCache } from '../routes/dashboard.js';
// Rotas cujo POST altera dados refletidos no dashboard. Lista explícita pra não
// invalidar à toa em rotas que não mudam nada (ex.: /whatsapp/status polling).
const ROTAS_QUE_AFETAM_DASHBOARD = [
  '/clientes',
  '/transacoes',
  '/planos',
  '/servidores',
  '/dispositivos',
  '/aplicativos',
];
export function invalidarCacheMiddleware(req, res, next) {
  if (req.method !== 'POST') return next();
  if (!req.session?.user) return next();
  const mudaDashboard =
    ROTAS_QUE_AFETAM_DASHBOARD.includes(req.path) ||
    /^\/pagamentos\/\d+\/confirmar-renovacao$/.test(req.path);
  if (!mudaDashboard) return next();
  const userId = req.session.user.id;
  // Invalidate after writes finish so a parallel dashboard request cannot
  // repopulate the cache with data from before the mutation.
  res.once('finish', () => {
    if (res.statusCode < 400) invalidarDashboardCache(userId);
  });
  return next();
}

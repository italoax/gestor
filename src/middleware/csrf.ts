import crypto from 'node:crypto';
// CSRF protection via "synchronizer token pattern": token aleatório gerado na
// sessão, embutido em campo hidden de cada form, validado a cada POST/PUT/DELETE.
// Mesmo com sameSite=lax já mitigando a maioria dos ataques, isso é defesa em
// profundidade — protege contra subdomain takeover, browser bug, link especial, etc.
// Caminhos que pulam validação: webhooks de pagamento e endpoints
// de cron protegidos por token próprio. Esses não são chamados pelo browser do
// usuário, então CSRF não se aplica.
const ROTAS_EXENTAS = [
  /^\/webhook\//,
  /^\/__cron\//,
  // /pagar/<token>/criar é POST público da página de pagamento (cliente final
  // não logado). Não tem como ter CSRF token. O token na URL já dá pertinência
  // ao cliente certo, e não há estado autenticado pra um CSRF abusar.
  /^\/pagar\/[^/]+\/(criar|status)(?:\/|$)/,
];
function obterTokenDaSessao(req) {
  if (!req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(32).toString('hex');
  }
  return req.session.csrfToken;
}
export function csrfMiddleware(req, res, next) {
  // Token sempre disponível pros templates (mesmo em GET) — pra forms embutirem
  // no campo hidden.
  const token = obterTokenDaSessao(req);
  res.locals.csrfToken = token;
  // Helper EJS: <%- csrfInput %> emite o input hidden direto.
  res.locals.csrfInput = `<input type="hidden" name="_csrf" value="${token}">`;
  // HTML com tokens de sessão não deve ser reutilizado por navegador ou proxy.
  res.set('Cache-Control', 'no-store');
  // Métodos seguros (não alteram estado) não precisam validar.
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  // Rotas exentas (webhooks externos, cron).
  if (ROTAS_EXENTAS.some((re) => re.test(req.path))) return next();
  const recebido = String(
    (req.body && req.body._csrf) || req.get('x-csrf-token') || '',
  );
  const recusar = () => {
    if (req.path === '/login') {
      return res.status(403).render('pages/login', {
        title: 'Login',
        user: null,
        error: [
          'Sua sessão expirou. Digite novamente suas credenciais para entrar.',
        ],
      });
    }
    if (req.path === '/area-cliente' || req.path.startsWith('/area-cliente/')) {
      res.set('Cache-Control', 'no-store');
      return res.status(403).render('pages/area-cliente', {
        layout: false,
        cliente: null,
        pix: false,
        erro: 'Sua sessão expirou. Digite novamente o usuário e a senha IPTV para entrar.',
      });
    }
    return res.status(403).render('pages/error', {
      title: 'Sessão expirada',
      error: {
        message:
          'Sessão expirada ou inválida. Volte, recarregue a página e tente novamente.',
      },
    });
  };
  if (!recebido || recebido.length !== token.length) {
    return recusar();
  }
  // Comparação timing-safe pra não vazar info de quanto bate.
  const a = Buffer.from(recebido);
  const b = Buffer.from(token);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return recusar();
  }
  return next();
}

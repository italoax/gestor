// Apenas páginas: APIs, ações, downloads e arquivos continuam no Express.
const pages = new Set([
  '/',
  '/login',
  '/register',
  '/dashboard',
  '/clientes',
  '/acessos-clientes',
  '/planos',
  '/servidores',
  '/aplicativos',
  '/dispositivos',
  '/status',
  '/mensagens',
  '/automacao',
  '/avisos',
  '/transacoes',
  '/whatsapp',
  '/integracoes',
  '/integracao-pagamento',
  '/minha-conta',
  '/area-cliente',
  '/area-cliente/login',
]);

export function isSitePage(pathname) {
  const path = pathname.length > 1 ? pathname.replace(/\/$/, '') : pathname;
  return pages.has(path) || /^\/(pagar|p|em-breve)\/[^/]+\/?$/.test(path);
}

export function sessionBootstrapPath(pathname) {
  return pathname === '/area-cliente' || pathname.startsWith('/area-cliente/')
    ? '/area-cliente/__frontend/session'
    : '/__frontend/session';
}

export function needsFrontendSession(pathname) {
  // Landing e PIX público não dependem de cookies: crawlers e clientes que
  // bloqueiam cookies precisam conseguir abrir essas páginas normalmente.
  return (
    isSitePage(pathname) && pathname !== '/' && !/^\/(pagar|p)\//.test(pathname)
  );
}

export function safeReturnPath(value) {
  if (
    typeof value !== 'string' ||
    !value.startsWith('/') ||
    value.startsWith('//') ||
    /[\\\r\n]/.test(value)
  )
    return '/login';
  try {
    const url = new URL(value, 'http://gestor.local');
    return url.origin === 'http://gestor.local' && isSitePage(url.pathname)
      ? url.pathname + url.search
      : '/login';
  } catch {
    return '/login';
  }
}

export function contentSecurityPolicy(nonce: string, development = false) {
  if (!/^[a-zA-Z0-9+/=_-]{16,128}$/.test(nonce))
    throw new Error('Nonce CSP inválido.');
  return `default-src 'self'; base-uri 'self'; object-src 'none'; script-src 'self' 'nonce-${nonce}'${development ? " 'unsafe-eval'" : ''}; script-src-attr 'none'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; media-src 'self' data: blob: https:; connect-src 'self'${development ? ' ws: wss:' : ''}; font-src 'self' data:; frame-ancestors 'self'; form-action 'self'`;
}

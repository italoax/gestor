export function caminhoPagamento(token) {
  const curto = /^[a-f0-9]{32}$/i.test(token)
    ? Buffer.from(token, 'hex').toString('base64url')
    : token;
  return `/p/${encodeURIComponent(curto)}`;
}
export function tokenPagamentoOriginal(token) {
  if (!/^[A-Za-z0-9_-]{22}$/.test(token)) return token;
  const bytes = Buffer.from(token, 'base64url');
  return bytes.length === 16 && bytes.toString('base64url') === token
    ? bytes.toString('hex')
    : token;
}

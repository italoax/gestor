import proxyaddr from 'proxy-addr';
import { isIP } from 'node:net';
import { createHmac, timingSafeEqual } from 'node:crypto';
export function trustedProxyAddresses(raw = 'loopback') {
  const entries = raw
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
  if (
    !entries.length ||
    entries.some(
      (v) =>
        v === '0.0.0.0/0' || v === '::/0' || v === 'true' || /^\d+$/.test(v),
    )
  )
    throw new Error('Configure proxies por endereços ou CIDRs explícitos.');
  return proxyaddr.compile(entries);
}
export function resolveClientOrigin(
  request,
  trusted = trustedProxyAddresses(),
) {
  const remote = request.socket?.remoteAddress;
  if (!remote || !isIP(remote))
    return {
      ip: undefined,
      protocol: request.socket?.encrypted ? 'https' : 'http',
    };
  const header = String(request.headers['x-forwarded-for'] || '');
  const valid =
    header.length <= 2048 &&
    header.split(',').every((v) => !v.trim() || isIP(v.trim()));
  const source = {
    socket: { remoteAddress: remote },
    headers: valid ? request.headers : {},
  };
  const ip = proxyaddr(source, trusted);
  const forwardedProtocol = String(request.headers['x-forwarded-proto'] || '');
  const protocol =
    trusted(remote) && ['https', 'http'].includes(forwardedProtocol)
      ? forwardedProtocol
      : request.socket?.encrypted
        ? 'https'
        : 'http';
  return { ip, protocol };
}
export function originSignature(ip: string, protocol: string, secret: string) {
  return createHmac('sha256', secret)
    .update(`gestor-origin:${ip}:${protocol}`)
    .digest('hex');
}
export function verifiedOrigin(
  headers: { get(name: string): string | null },
  secret?: string,
) {
  const ip = headers.get('x-forwarded-for') || '',
    protocol = headers.get('x-forwarded-proto') || '',
    signature = headers.get('x-gestor-origin-signature') || '';
  if (
    !secret ||
    !isIP(ip) ||
    !['http', 'https'].includes(protocol) ||
    !/^[a-f0-9]{64}$/.test(signature)
  )
    return undefined;
  const expected = originSignature(ip, protocol, secret);
  return timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
    ? { ip, protocol }
    : undefined;
}
export function normalizePublicOrigin(
  request,
  trusted,
  secret?: string,
  localTransportProtocol?: string,
) {
  const origin = resolveClientOrigin(request, trusted);
  if (
    !request.socket?.remoteAddress &&
    ['http', 'https'].includes(localTransportProtocol)
  )
    origin.protocol = localTransportProtocol;
  delete request.headers['forwarded'];
  delete request.headers['x-real-ip'];
  delete request.headers['x-gestor-origin-signature'];
  delete request.headers['x-forwarded-host'];
  if (origin.ip) request.headers['x-forwarded-for'] = origin.ip;
  else delete request.headers['x-forwarded-for'];
  request.headers['x-forwarded-proto'] = origin.protocol;
  if (secret && origin.ip)
    request.headers['x-gestor-origin-signature'] = originSignature(
      origin.ip,
      origin.protocol,
      secret,
    );
}

import dns from 'node:dns';
import https from 'node:https';
import { BlockList, isIP } from 'node:net';
const blocked = new BlockList();
for (const [address, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.88.99.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
])
  blocked.addSubnet(address, prefix, 'ipv4');
const globalV6 = new BlockList();
globalV6.addSubnet('2000::', 3, 'ipv6');
for (const [address, prefix] of [
  ['2001::', 23],
  ['2001:db8::', 32],
  ['2002::', 16],
  ['3fff::', 20],
]) {
  blocked.addSubnet(address, prefix, 'ipv6');
}
export function isPublicAddress(address) {
  if (isIP(address) === 4) return !blocked.check(address, 'ipv4');
  if (isIP(address) === 6)
    return globalV6.check(address, 'ipv6') && !blocked.check(address, 'ipv6');
  return false;
}
export function publicHttpsUrl(value) {
  const url = new URL(value);
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    (url.port && url.port !== '443') ||
    (isIP(host) && !isPublicAddress(host))
  ) {
    throw new Error(
      'Use uma URL HTTPS pública, sem credenciais e na porta 443.',
    );
  }
  return url;
}
// Verifica os IPs na resolução usada pela própria conexão: não há uma segunda
// resolução entre validar e conectar (proteção contra DNS rebinding).
export const publicLookup = (hostname, options, callback) => {
  dns.lookup(hostname, { ...options, all: true }, (error, addresses) => {
    if (error) return callback(error, '', 4);
    if (
      !addresses.length ||
      addresses.some(({ address }) => !isPublicAddress(address))
    ) {
      return callback(
        new Error('Destino de rede privado ou reservado bloqueado.'),
        '',
        4,
      );
    }
    if (options.all) callback(null, addresses);
    else callback(null, addresses[0].address, addresses[0].family);
  });
};
export const publicHttpsAgent = new https.Agent({
  lookup: publicLookup,
  keepAlive: false,
});
export function publicHttpsText(value, init) {
  const url = publicHttpsUrl(value);
  return new Promise((resolve, reject) => {
    const req = https.request(
      url,
      {
        method: init.method,
        headers: init.headers,
        agent: publicHttpsAgent,
        signal: AbortSignal.timeout(30000),
      },
      (res) => {
        const chunks = [];
        let bytes = 0;
        res.on('data', (chunk) => {
          bytes += chunk.length;
          if (bytes > 1024 * 1024)
            res.destroy(new Error('Resposta da integração excede 1 MB.'));
          else chunks.push(chunk);
        });
        res.on('error', reject);
        // https.request não segue redirecionamentos para outros destinos.
        res.on('end', () =>
          resolve({
            status: res.statusCode ?? 502,
            contentType: String(res.headers['content-type'] ?? ''),
            text: Buffer.concat(chunks).toString('utf8'),
          }),
        );
      },
    );
    req.on('error', reject);
    req.end(init.body);
  });
}

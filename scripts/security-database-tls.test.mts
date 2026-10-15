import assert from 'node:assert/strict';
import { test } from 'node:test';
import net from 'node:net';
import tls from 'node:tls';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { probeMysqlTls } from './lib/mysql-tls-probe.mts';

mkdirSync('.tmp-ui', { recursive: true });
const root = mkdtempSync(path.resolve('.tmp-ui/mysql-tls-probe-'));
const openssl =
  process.platform === 'win32' &&
  existsSync('C:/Program Files/Git/usr/bin/openssl.exe')
    ? 'C:/Program Files/Git/usr/bin/openssl.exe'
    : 'openssl';
for (const name of ['localhost', 'wrong.invalid']) {
  execFileSync(
    openssl,
    [
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-nodes',
      '-days',
      '2',
      '-keyout',
      path.join(root, name + '.key'),
      '-out',
      path.join(root, name + '.crt'),
      '-subj',
      '/CN=' + name,
      '-addext',
      'subjectAltName=DNS:' + name,
    ],
    { stdio: 'pipe', windowsHide: true },
  );
}
const ca = readFileSync(path.join(root, 'localhost.crt'), 'utf8');

async function fixture(
  run: (
    port: number,
    observed: { requests: Buffer[]; applicationBytes: number },
  ) => Promise<void>,
  mode: 'valid' | 'wrong-host' | 'no-tls' | 'invalid' | 'silent' = 'valid',
) {
  const name = mode === 'wrong-host' ? 'wrong.invalid' : 'localhost';
  const context = tls.createSecureContext({
    key: readFileSync(path.join(root, name + '.key')),
    cert: readFileSync(path.join(root, name + '.crt')),
  });
  const observed = { requests: [] as Buffer[], applicationBytes: 0 };
  const sockets = new Set<net.Socket>();
  const server = net.createServer((socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    socket.on('error', () => {});
    if (mode === 'silent') return;
    if (mode === 'invalid') {
      socket.end(Buffer.from([1, 0, 0, 0, 0xff]));
      return;
    }
    const payload = Buffer.concat([
      Buffer.from([10]),
      Buffer.from('synthetic-only\0'),
      Buffer.alloc(4),
      Buffer.alloc(8, 1),
      Buffer.from([0]),
      Buffer.from(mode === 'no-tls' ? [0, 2] : [0, 10]),
      Buffer.alloc(20),
    ]);
    const header = Buffer.alloc(4);
    header.writeUIntLE(payload.length, 0, 3);
    // Fragment header deliberately to exercise bounded packet reassembly.
    socket.write(header.subarray(0, 2));
    socket.write(Buffer.concat([header.subarray(2), payload]));
    let buffer = Buffer.alloc(0);
    socket.on('data', function sslRequest(chunk: Buffer) {
      buffer = Buffer.concat([buffer, chunk]);
      if (buffer.length < 36) return;
      observed.requests.push(buffer.subarray(0, 36));
      socket.removeListener('data', sslRequest);
      socket.pause();
      // TCP can coalesce SSLRequest and the TLS ClientHello in one chunk.
      // Preserve the latter for TLS parsing; these are not SQL/login bytes.
      if (buffer.length > 36) socket.unshift(buffer.subarray(36));
      const secure = new tls.TLSSocket(socket, {
        isServer: true,
        secureContext: context,
      });
      sockets.add(secure);
      secure.on('close', () => sockets.delete(secure));
      secure.on('error', () => {});
      secure.on('data', (data) => {
        observed.applicationBytes += data.length;
      });
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    await run(address.port, observed);
  } finally {
    for (const socket of sockets) socket.destroy();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

test('trusted TLS validates DNS identity and sends only SSLRequest, never authentication or SQL', async () => {
  await fixture(async (port, observed) => {
    const result = await probeMysqlTls({ host: 'localhost', port, ca });
    assert.equal(result.serverVerified, true);
    assert.equal(result.credentialsSent, false);
    assert.equal(result.sqlSent, false);
    assert.ok(
      result.certificate?.subjectAlternativeNames?.includes('DNS:localhost'),
    );
    assert.ok(result.protocol === 'TLSv1.2' || result.protocol === 'TLSv1.3');
    assert.equal(observed.requests.length, 1);
    const request = observed.requests[0];
    assert.equal(request.length, 36);
    assert.equal(request.readUIntLE(0, 3), 32);
    assert.equal(request[3], 1);
    assert.equal(request.readUInt32LE(4), 0x0a00);
    assert.deepEqual(request.subarray(13), Buffer.alloc(23));
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(observed.applicationBytes, 0);
  });
});

test('untrusted certificate is refused without insecure retry or credentials', async () => {
  await fixture(async (port, observed) => {
    const result = await probeMysqlTls({ host: 'localhost', port });
    assert.equal(result.serverVerified, false);
    assert.equal(result.errorCode, 'DEPTH_ZERO_SELF_SIGNED_CERT');
    assert.equal(observed.requests.length, 1);
    assert.equal(observed.applicationBytes, 0);
  });
});

test('trusted chain with wrong hostname is refused', async () => {
  await fixture(async (port) => {
    const result = await probeMysqlTls({
      host: 'localhost',
      port,
      ca: readFileSync(path.join(root, 'wrong.invalid.crt'), 'utf8'),
    });
    assert.equal(result.serverVerified, false);
    assert.equal(result.errorCode, 'ERR_TLS_CERT_ALTNAME_INVALID');
  }, 'wrong-host');
});

test('no TLS capability never falls back to a plaintext login', async () => {
  await fixture(async (port, observed) => {
    const result = await probeMysqlTls({ host: 'localhost', port });
    assert.equal(result.errorCode, 'TLS_NOT_ADVERTISED');
    assert.equal(observed.requests.length, 0);
  }, 'no-tls');
});

test('malformed greeting is refused without reflecting server error contents', async () => {
  await fixture(async (port) => {
    const result = await probeMysqlTls({ host: 'localhost', port });
    assert.equal(result.errorCode, 'INVALID_GREETING');
  }, 'invalid');
});

test('silent server times out without credentials', async () => {
  await fixture(async (port) => {
    const result = await probeMysqlTls({
      host: 'localhost',
      port,
      timeoutMs: 100,
    });
    assert.equal(result.errorCode, 'PROBE_TIMEOUT');
    assert.equal(result.credentialsSent, false);
  }, 'silent');
});

test('invalid destinations are rejected before connecting', () => {
  for (const host of [
    '127.0.0.1',
    'user:password@server',
    'https://server',
    '../file',
    '',
  ])
    assert.throws(() => probeMysqlTls({ host }));
  assert.throws(() => probeMysqlTls({ host: 'localhost', port: 0 }));
  assert.throws(() => probeMysqlTls({ host: 'localhost', timeoutMs: 0 }));
});

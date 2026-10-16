import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, readFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import express from 'express';
import session from 'express-session';
import flash from 'connect-flash';
import { SecretVault, loadVault } from '../src/security/secretVault.ts';
import {
  trustedProxyAddresses,
  resolveClientOrigin,
  originSignature,
  verifiedOrigin,
  normalizePublicOrigin,
} from '../src/security/proxyTrust.ts';
import { contentSecurityPolicy } from '../src/security/contentSecurityPolicy.ts';
import { createSecurityEvents } from '../src/security/securityEvents.ts';
import { createAccountSessionActions } from '../src/security/accountSessions.ts';
import { createSessionSecurity } from '../src/middleware/sessionSecurity.ts';
import { requireRecentAuthentication } from '../src/middleware/recentAuthentication.ts';
import { csrfMiddleware } from '../src/middleware/csrf.ts';
import { requireAuth } from '../src/middleware/auth.ts';
import {
  credentialRevision,
  sessionLimits,
} from '../src/services/sessionSecurity.ts';
import { safeError } from '../src/security/safeError.ts';
import { createPaymentWorkflow } from '../src/services/paymentWorkflow.ts';
import { createClientPageData } from '../src/services/clientPageData.ts';
import { proxyBackend } from '../src/frontend/backendTransport.ts';
import { createServer, request as httpRequest } from 'node:http';

test('AES-GCM isolates accounts and purposes, authenticates data and does not reveal plaintext in failures', () => {
  const vault = new SecretVault({
    active: 'first',
    keys: { first: randomBytes(32).toString('base64') },
  });
  const a = vault.seal('sensitive-value', 'iptv:1'),
    b = vault.seal('sensitive-value', 'iptv:1');
  assert.notEqual(a, b);
  assert.equal(a.includes('sensitive-value'), false);
  assert.equal(vault.open(a, 'iptv:1'), 'sensitive-value');
  assert.throws(() => vault.open(a, 'iptv:2'));
  assert.throws(() => vault.open(a, 'payment:1'));
  const parts = a.split(':');
  parts[4] = Buffer.alloc(16).toString('base64url');
  assert.throws(
    () => vault.open(parts.join(':'), 'iptv:1'),
    (error) => !String(error).includes('sensitive-value'),
  );
});

test('key rotation preserves old ciphertext while lost or malformed keys fail closed', () => {
  const first = randomBytes(32).toString('base64'),
    second = randomBytes(32).toString('base64');
  const old = new SecretVault({ active: 'a', keys: { a: first } });
  const stored = old.seal('value', 'integration:1');
  const next = new SecretVault({ active: 'b', keys: { a: first, b: second } });
  assert.equal(next.open(stored, 'integration:1'), 'value');
  const rotated = next.rotate(stored, 'integration:1');
  assert.ok(rotated.startsWith('gestor:v2:b:'));
  assert.equal(next.open(rotated, 'integration:1'), 'value');
  assert.throws(() => old.open(rotated, 'integration:1'));
  assert.throws(() => loadVault({ DATA_ENCRYPTION_REQUIRED: 'true' } as any));
  assert.throws(() => new SecretVault({ active: 'a', keys: { a: 'short' } }));
});

test('key generator never prints key material, preserves old keys and refuses to overwrite files', () => {
  mkdirSync('.tmp-ui', { recursive: true });
  const root = mkdtempSync(path.resolve('.tmp-ui/key-test-')),
    first = path.join(root, 'first.json'),
    second = path.join(root, 'second.json');
  const run = (args: string[]) =>
    execFileSync(
      process.execPath,
      ['--import', 'tsx', 'scripts/security-keys.mts', ...args],
      { encoding: 'utf8', windowsHide: true, stdio: 'pipe' },
    );
  const output = run(['--file', first, '--id', 'first']);
  const key = JSON.parse(readFileSync(first, 'utf8')).keys.first;
  assert.equal(output.includes(key), false);
  run(['--file', second, '--from', first, '--id', 'second']);
  const rotated = JSON.parse(readFileSync(second, 'utf8'));
  assert.equal(rotated.keys.first, key);
  assert.equal(rotated.active, 'second');
  assert.throws(() => run(['--file', first]));
});

test('untrusted forwarding headers and forged origin signatures cannot select the client IP', () => {
  const trusted = trustedProxyAddresses('loopback');
  assert.equal(
    resolveClientOrigin(
      {
        socket: { remoteAddress: '203.0.113.10' },
        headers: {
          'x-forwarded-for': '127.0.0.1',
          'x-forwarded-proto': 'https',
        },
      },
      trusted,
    ).ip,
    '203.0.113.10',
  );
  const request = {
    socket: { remoteAddress: '127.0.0.1' },
    headers: {
      'x-forwarded-for': '198.51.100.99, 203.0.113.10',
      'x-forwarded-proto': 'https',
    },
  };
  assert.equal(resolveClientOrigin(request, trusted).ip, '203.0.113.10');
  const secret = randomBytes(32).toString('hex');
  normalizePublicOrigin(request, trusted, secret);
  const headers = new Headers(request.headers);
  assert.equal(verifiedOrigin(headers, secret)?.ip, '203.0.113.10');
  headers.set('x-forwarded-for', '198.51.100.99');
  assert.equal(verifiedOrigin(headers, secret), undefined);
  headers.set(
    'x-gestor-origin-signature',
    originSignature('198.51.100.99', 'https', 'wrong-key'),
  );
  assert.equal(verifiedOrigin(headers, secret), undefined);
  assert.equal(trusted('::ffff:192.0.2.1'), false);
  assert.equal(trusted('::ffff:127.0.0.1'), true);
  assert.throws(() => trustedProxyAddresses('0.0.0.0/0'));
});

test('invalid forwarding chains are ignored and admin sessions have bounded shorter policies', () => {
  const origin = resolveClientOrigin({
    socket: { remoteAddress: '127.0.0.1' },
    headers: {
      'x-forwarded-for': 'invalid, 192.0.2.1',
      'x-forwarded-proto': 'https,http',
    },
  });
  assert.deepEqual(origin, { ip: '127.0.0.1', protocol: 'http' });
  assert.equal(sessionLimits({}, false, true).idle, 60 * 60_000);
  assert.equal(sessionLimits({}, false, true).absolute, 8 * 3600_000);
  assert.notEqual(
    credentialRevision({ id: 1, sessionVersion: 0 }),
    credentialRevision({ id: 1, sessionVersion: 1 }),
  );
});

test('production CSP permits only nonced inline scripts and keeps attribute handlers blocked', () => {
  const policy = contentSecurityPolicy(randomBytes(18).toString('base64'));
  const scripts = policy
    .split(';')
    .find((v) => v.trim().startsWith('script-src '));
  assert.ok(scripts.includes("'nonce-"));
  assert.equal(scripts.includes('unsafe-inline'), false);
  assert.equal(scripts.includes('unsafe-eval'), false);
  assert.ok(policy.includes("script-src-attr 'none'"));
  assert.equal(policy.includes('cdn.jsdelivr.net'), false);
  assert.throws(() => contentSecurityPolicy('evil\"; script-src *'));
});

test('security alerts persist only allowlisted metadata and persistence failure logs no internal error', async () => {
  const writes = [],
    logs = [];
  let fail = false;
  const audit = createSecurityEvents({
    secret: randomBytes(32).toString('hex'),
    execute: async (_sql, params) => {
      if (fail) throw Error('private-token');
      writes.push(params);
    },
    logger: {
      log: (v) => {
        logs.push(v);
      },
      warn: (v) => {
        logs.push(v);
      },
    },
  });
  await audit('credentials.changed', {
    userId: 7,
    ip: '192.0.2.1',
    password: 'private-password',
    token: 'private-token',
    reason: 'password',
  } as any);
  assert.equal(writes[0].severity, 'alert');
  assert.equal(JSON.stringify(writes).includes('private-'), false);
  assert.equal(logs[0].includes('192.0.2.1'), false);
  fail = true;
  await audit('admin.denied', { userId: 7 });
  assert.equal(logs.join('').includes('private-token'), false);
  await assert.rejects(audit('arbitrary-secret-event'));
});

test('error diagnostics and payment failures never expose SQL, tokens, provider responses or decrypted messages', async () => {
  const error = Object.assign(new Error('private-payment-token'), {
    code: 'ER_DUP_ENTRY',
    sql: "INSERT secret='private-password'",
    response: { token: 'private-payment-token' },
  });
  assert.deepEqual(safeError(error), { name: 'Error', code: 'ER_DUP_ENTRY' });
  const workflow = createPaymentWorkflow({
    queryOne: async () => {
      throw error;
    },
  } as any);
  const status = await workflow.status('a'.repeat(32), 1);
  assert.equal(status.status, 500);
  assert.equal(JSON.stringify(status).includes('private-'), false);
});

test('nested additional-access data cannot reintroduce secrets into React page data', () => {
  const page = createClientPageData({
    clientes: [
      {
        id: 1,
        adicional: {
          user: 'additional',
          senha: 'private-password',
          passwordHash: 'private-hash',
        },
        plano_adicional: JSON.stringify({
          user: 'additional',
          senha_enc: 'private-cipher',
        }),
      },
    ],
  });
  assert.equal(JSON.stringify(page).includes('private-'), false);
  assert.equal(page.clientes[0].adicional.user, 'additional');
  assert.equal(JSON.parse(page.clientes[0].plano_adicional).user, 'additional');
});

test('an absolute HTTP request target cannot turn the backend proxy into an external proxy', async (t) => {
  let attackerRequests = 0,
    internalRequests = 0;
  const attacker = createServer((_req, res) => {
    attackerRequests++;
    res.end('external');
  });
  const backend = createServer((req, res) => {
    internalRequests++;
    assert.equal(req.url, '/api/private?x=1');
    res.end('internal');
  });
  const listen = async (server) => {
    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', resolve),
    );
    return `http://127.0.0.1:${server.address().port}`;
  };
  const attackerUrl = await listen(attacker),
    backendUrl = await listen(backend);
  const front = createServer((req, res) =>
    proxyBackend(req, res, backendUrl, undefined),
  );
  const frontUrl = new URL(await listen(front));
  t.after(async () => {
    for (const server of [front, backend, attacker]) {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
  const body = await new Promise<string>((resolve, reject) => {
    const req = httpRequest(
      {
        hostname: frontUrl.hostname,
        port: frontUrl.port,
        path: attackerUrl + '/api/private?x=1',
        headers: { cookie: 'private-cookie' },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => resolve(data));
      },
    );
    req.on('error', reject);
    req.end();
  });
  assert.equal(body, 'internal');
  assert.equal(attackerRequests, 0);
  assert.equal(internalRequests, 1);
});

test('recent authentication rotates the session without extending its absolute lifetime; revocation invalidates every session', async (t) => {
  const app = express();
  app.set('view engine', 'ejs');
  app.set('views', path.resolve('src/views'));
  app.use(express.urlencoded({ extended: false }));
  app.use(
    session({
      secret: 'advanced-session-test-only',
      resave: false,
      saveUninitialized: false,
      cookie: { maxAge: 86400_000 },
    }),
  );
  app.use(flash());
  const row = {
    id: 7,
    username: 'test',
    passwordHash: 'hash',
    isAdmin: 0,
    sessionVersion: 0,
  };
  const originalAt = Date.now() - 20 * 60_000;
  app.get('/seed', (req, res) => {
    req.session.user = {
      id: 7,
      username: 'test',
      name: 'Test',
      isAdmin: false,
    };
    req.session.security = {
      authenticatedAt: originalAt,
      lastActiveAt: Date.now(),
      credentialRevision: credentialRevision(row),
    };
    res.sendStatus(204);
  });
  app.use(
    createSessionSecurity(
      { sessionIdleMs: 2 * 3600_000, sessionAbsoluteMs: 4 * 3600_000 },
      async () => row,
    ),
  );
  app.use(csrfMiddleware);
  app.get('/api/private', requireAuth, (req, res) =>
    res.json({ security: req.session.security, token: res.locals.csrfToken }),
  );
  app.post('/critical', requireAuth, requireRecentAuthentication, (_req, res) =>
    res.sendStatus(204),
  );
  const actions = createAccountSessionActions({
    queryOne: async () => row,
    execute: async (_sql, params) => {
      assert.equal(params.id, 7);
      row.sessionVersion++;
    },
    comparePassword: async (value) => value === 'current-password',
    audit: async () => {},
  });
  app.post(
    ['/minha-conta/confirmar', '/minha-conta/sessoes/revogar'],
    requireAuth,
    actions,
  );
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  t.after(
    () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  );
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const base = `http://127.0.0.1:${address.port}`;
  const seed = async () =>
    (await fetch(base + '/seed')).headers.get('set-cookie')!.split(';')[0];
  const get = (cookie) =>
    fetch(base + '/api/private', { headers: { cookie }, redirect: 'manual' });
  const post = (url, cookie, token, password = 'current-password') =>
    fetch(base + url, {
      method: 'POST',
      headers: { cookie, accept: 'application/json' },
      body: new URLSearchParams({ _csrf: token, current_password: password }),
      redirect: 'manual',
    });
  const first = await seed(),
    second = await seed();
  let data = await (await get(first)).json();
  assert.equal((await post('/critical', first, data.token)).status, 403);
  await post('/minha-conta/confirmar', first, data.token, 'wrong');
  assert.equal(row.sessionVersion, 0);
  const confirmed = await post('/minha-conta/confirmar', first, data.token);
  const current = confirmed.headers.get('set-cookie')!.split(';')[0];
  assert.notEqual(current, first);
  assert.equal((await get(first)).status, 401);
  data = await (await get(current)).json();
  assert.equal(data.security.authenticatedAt, originalAt);
  assert.ok(data.security.recentAuthAt > originalAt);
  assert.equal((await post('/critical', current, data.token)).status, 204);
  assert.equal(
    (await post('/minha-conta/sessoes/revogar', current, 'invalid')).status,
    403,
  );
  assert.equal(row.sessionVersion, 0);
  assert.equal(
    (await post('/minha-conta/sessoes/revogar', current, data.token)).status,
    302,
  );
  assert.equal(row.sessionVersion, 1);
  assert.equal((await get(second)).status, 401);
  assert.equal((await get(current)).status, 401);
});

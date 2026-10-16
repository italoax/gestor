import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import session from 'express-session';
import { AuthService } from '../backend/src/auth/auth.service.ts';
import { createSessionSecurity } from '../src/middleware/sessionSecurity.ts';
import {
  credentialRevision,
  sessionLimits,
} from '../src/services/sessionSecurity.ts';
import { createLoginAttempts } from '../src/services/loginAttempts.ts';
import { validStatusMedia } from '../src/services/statusMedia.ts';
import { statusUploadMiddleware } from '../src/middleware/statusUpload.ts';
import {
  requireAuth,
  createAdminAuthorization,
} from '../src/middleware/auth.ts';
import { csrfMiddleware } from '../src/middleware/csrf.ts';
import { createErrorHandler } from '../src/middleware/errorHandler.ts';
import { execFileSync } from 'node:child_process';
import { createClientPageData } from '../src/services/clientPageData.ts';
import { createClientMutationWorkflow } from '../src/services/clientMutations.ts';
import * as format from '../src/services/format.ts';
import * as dates from '../src/services/dates.ts';
import { createPaymentSettingsWorkflow } from '../src/workflows/payment-settings.ts';
import { nativePageData } from '../src/services/frontendPageData.ts';
import { createAccountWorkflow } from '../src/workflows/account.ts';

const row = {
  id: 7,
  username: 'test',
  passwordHash: 'test-only-hash',
  isAdmin: 0,
  name: 'Test',
};
async function serve(t, app) {
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
  return `http://127.0.0.1:${address.port}`;
}

test('login always compares a bcrypt hash for missing accounts and wrong passwords, and returns no hash', async () => {
  const comparisons = [];
  const service = new AuthService({
    auth: {
      loginAttempts: { consume: async () => true, reset: async () => {} },
      queryOne: async (_sql, params) =>
        params.username === 'missing' ? null : row,
      comparePassword: async (password, hash) => {
        comparisons.push({ password, hash });
        return password === 'valid' && hash === row.passwordHash;
      },
    },
  } as any);
  assert.equal(await service.authenticate('missing', 'invalid'), null);
  assert.equal(await service.authenticate('test', 'invalid'), null);
  assert.match(comparisons[0].hash, /^\$2b\$12\$/);
  assert.equal(comparisons.length, 2);
  const user = await service.authenticate('test', 'valid');
  assert.equal(user?.isAdmin, false);
  assert.equal('passwordHash' in user, false);
  assert.equal(await service.authenticate('test', 'é'.repeat(37)), null);
  assert.equal(await service.authenticate('x'.repeat(61), 'valid'), null);
  assert.equal(
    comparisons.length,
    3,
    'Oversized credentials never reach bcrypt',
  );
});

test('account throttling uses the stored account ID for aliases and rejects valid credentials while blocked', async () => {
  const ids = [],
    resets = [];
  let allowed = false;
  const service = new AuthService({
    auth: {
      queryOne: async () => row,
      comparePassword: async (_password, hash) => hash === row.passwordHash,
      loginAttempts: {
        consume: async (id) => {
          ids.push(id);
          return allowed;
        },
        reset: async (id) => {
          resets.push(id);
        },
      },
    },
  } as any);
  assert.equal(await service.authenticate('TEST', 'valid'), null);
  assert.equal(await service.authenticate('tést', 'valid'), null);
  assert.deepEqual(ids, [7, 7]);
  assert.deepEqual(resets, []);
  allowed = true;
  assert.equal((await service.authenticate('test', 'valid'))?.id, 7);
  assert.deepEqual(resets, [7]);
});

test('persistent account limiter survives service recreation and resets after its window', async () => {
  let time = 1_000_000;
  const counters = new Map();
  const db = {
    execute: async (sql, params) => {
      if (sql.startsWith('DELETE')) return counters.delete(params.userId);
      const old = counters.get(params.userId);
      counters.set(
        params.userId,
        !old || old.reset_at <= params.time
          ? { attempts: 1, reset_at: params.resetAt }
          : { ...old, attempts: Math.min(11, old.attempts + 1) },
      );
    },
    queryOne: async (_sql, params) => counters.get(params.userId),
  };
  const first = createLoginAttempts(db, () => time);
  for (let i = 0; i < 10; i++) assert.equal(await first.consume(7), true);
  const restarted = createLoginAttempts(db, () => time);
  assert.equal(await restarted.consume(7), false);
  assert.equal(await restarted.consume(8), true);
  time += 15 * 60_000;
  assert.equal(await restarted.consume(7), true);
  await restarted.reset(7);
  assert.equal(counters.has(7), false);
  const failed = createLoginAttempts({
    execute: async () => {
      throw Error('DB unavailable');
    },
    queryOne: db.queryOne,
  });
  await assert.rejects(failed.consume(7), /DB unavailable/);
});

test('session timeouts, credential revocation and database outages are enforced through real HTTP sessions', async (t) => {
  let time = Date.now(),
    user = { ...row },
    fail = false;
  const store = new session.MemoryStore();
  const app = express();
  app.use(
    session({
      name: 'ixstreaming.painel.sid',
      store,
      secret: 'security-tests-only-session-secret',
      resave: false,
      saveUninitialized: false,
    }),
  );
  app.get('/seed', (req, res) => {
    req.session.user = {
      id: 7,
      name: 'Test',
      username: 'test',
      isAdmin: Boolean(Number(user.isAdmin)),
    };
    req.session.security = {
      authenticatedAt: time,
      lastActiveAt: time,
      credentialRevision: credentialRevision(user),
    };
    if (req.query.legacy) delete req.session.security;
    if (req.query.remember)
      Object.assign(req.session.security, { remember: true });
    res.json({ ok: true });
  });
  app.use(
    createSessionSecurity(
      {
        sessionIdleMs: 5 * 60_000,
        sessionAbsoluteMs: 180 * 60_000,
        cookieSecure: false,
      },
      async () => {
        if (fail) throw Error('PRIVATE DATABASE DETAIL');
        return user;
      },
      () => time,
    ),
  );
  app.get('/api/private', requireAuth, (req, res) =>
    res.json({ ok: true, security: req.session.security }),
  );
  app.use(createErrorHandler('production'));
  const base = await serve(t, app);
  const seed = async (query = '') =>
    (await fetch(base + '/seed' + query)).headers
      .get('set-cookie')!
      .split(';')[0];
  const get = (cookie, accept = 'application/json', headers = {}) =>
    fetch(base + '/api/private', {
      headers: { cookie, accept, ...headers },
      redirect: 'manual',
    });
  let cookie = await seed('?remember=1');
  time += 4 * 60_000;
  assert.equal((await get(cookie)).status, 200);
  time += 30_000;
  assert.equal(
    (await get(cookie, 'text/html', { 'x-gestor-background': '1' })).status,
    200,
  );
  time += 30_000;
  assert.equal(
    (await get(cookie)).status,
    401,
    'JSON and HTML polling did not extend the five-minute idle timeout, even for old remembered sessions',
  );
  assert.equal(
    (await get(cookie)).status,
    401,
    'Expired cookie cannot be reused',
  );
  for (const admin of [0, 1]) {
    user.isAdmin = admin;
    cookie = await seed();
    for (let i = 0; i < 20; i++) {
      time += 4 * 60_000;
      assert.equal((await get(cookie, 'text/html')).status, 200);
    }
    time += 5 * 60_000;
    assert.equal(
      (await get(cookie, 'text/html')).status,
      401,
      'Active use lasts beyond one hour, but five minutes without interaction expires the session',
    );
  }
  user.isAdmin = 0;
  cookie = await seed();
  user.passwordHash = 'replacement-hash';
  assert.equal(
    (await get(cookie)).status,
    401,
    'Password change revokes old sessions',
  );
  cookie = await seed();
  user.isAdmin = 1;
  assert.equal(
    (await get(cookie)).status,
    401,
    'Privilege change requires authentication again',
  );
  cookie = await seed();
  fail = true;
  const outage = await get(cookie);
  assert.equal(outage.status, 500);
  assert.equal((await outage.text()).includes('PRIVATE DATABASE'), false);
  fail = false;
  cookie = await seed('?legacy=1');
  assert.equal(
    (await get(cookie)).status,
    401,
    'Legacy sessions must authenticate again',
  );
});

test('credential revisions cover username, password and privileges; panel and portal policies remain bounded', () => {
  for (const change of [
    { username: 'renamed' },
    { passwordHash: 'changed' },
    { isAdmin: 1 },
  ])
    assert.notEqual(
      credentialRevision(row),
      credentialRevision({ ...row, ...change }),
    );
  assert.equal(
    credentialRevision(row),
    credentialRevision({ ...row, isAdmin: '0' }),
  );
  assert.equal(sessionLimits({}, false, false).idle, 5 * 60_000);
  assert.equal(sessionLimits({}, false, true).idle, 5 * 60_000);
  assert.equal(sessionLimits({}, false, false).absolute, 12 * 3600_000);
  assert.equal(sessionLimits({}, true).absolute, 8 * 3600_000);
});

test('upload validation rejects SVG, HTML disguised as PNG, MIME mismatch and oversized files', async (t) => {
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWQAAAABJRU5ErkJggg==',
    'base64',
  );
  assert.equal(validStatusMedia({ mimetype: 'image/png', buffer: png }), true);
  assert.equal(
    validStatusMedia({ mimetype: 'image/jpeg', buffer: png }),
    false,
  );
  const app = express();
  let writes = 0;
  app.use((req, _res, next) => {
    req.flash = (() => []) as any;
    next();
  });
  app.post('/status', statusUploadMiddleware, (_req, res) => {
    writes++;
    res.sendStatus(204);
  });
  const base = await serve(t, app);
  for (const [type, content, expected] of [
    ['image/png', png, 204],
    ['image/png', Buffer.from('<script>alert(1)</script>'), 302],
    ['image/svg+xml', Buffer.from('<svg onload="alert(1)"></svg>'), 302],
    ['image/jpeg', png, 302],
    ['image/png', Buffer.alloc(5 * 1024 * 1024 + 1), 302],
  ] as const) {
    const body = new FormData();
    body.set(
      'media_file',
      new Blob([new Uint8Array(content)], { type }),
      'upload',
    );
    assert.equal(
      (
        await fetch(base + '/status', {
          method: 'POST',
          body,
          redirect: 'manual',
        })
      ).status,
      expected,
    );
  }
  assert.equal(writes, 1);
});

test('CSRF still rejects a forged write before the handler executes', () => {
  let status = 0;
  csrfMiddleware(
    {
      method: 'POST',
      path: '/minha-conta',
      session: { csrfToken: 'a'.repeat(64) },
      body: { _csrf: 'b'.repeat(64) },
      get() {},
    },
    {
      locals: {},
      set() {},
      status(code) {
        status = code;
        return this;
      },
      render() {},
    },
    () => assert.fail('forged write accepted'),
  );
  assert.equal(status, 403);
});

test('security logs cannot inject lines or include passwords and raw user agents', () => {
  const logs = [];
  const service = new AuthService({
    auth: {
      logger: {
        log: (text) => logs.push(text),
        warn: (text) => logs.push(text),
      },
    },
  } as any);
  service.recordAttempt(
    'injected\npassword-value',
    null,
    '127.0.0.1',
    'unsafe-agent\n',
  );
  assert.equal(logs.length, 1);
  assert.equal(logs[0].includes('\n'), false);
  assert.equal(logs[0].includes('password-value'), false);
  assert.equal(logs[0].includes('unsafe-agent'), false);
  assert.equal(JSON.parse(logs[0]).outcome, 'failure');
});

test('production rejects insecure cookies, MemoryStore mode and a cleartext application URL', () => {
  const run = (overrides: Record<string, string>) =>
    execFileSync(
      process.execPath,
      [
        '--import',
        'tsx',
        '--input-type=module',
        '-e',
        "await import('./src/config/env.ts')",
      ],
      {
        env: {
          ...process.env,
          NODE_ENV: 'production',
          DB_HOST: 'localhost',
          DB_SSL: 'true',
          SESSION_SECRET: 'test-only-production-secret-at-least-32-chars',
          COOKIE_SECURE: 'true',
          LOCAL_MODE: 'false',
          APP_URL: 'https://example.test',
          ...overrides,
        },
        stdio: 'pipe',
      },
    );
  for (const overrides of [
    { COOKIE_SECURE: 'false' },
    { LOCAL_MODE: 'true' },
    { APP_URL: 'http://example.test' },
  ])
    assert.throws(() => run(overrides));
  assert.doesNotThrow(() => run({}));
});

test('customer page data never serializes IPTV passwords or password hashes', () => {
  const data = createClientPageData({
    clientes: [
      {
        id: 42,
        nome: 'Test',
        senha: 'private-iptv',
        passwordHash: 'private-hash',
        portal_hash: 'private-portal',
        password_hash: 'private-db-hash',
      },
    ],
  });
  assert.deepEqual(data.clientes, [{ id: 42, nome: 'Test' }]);
});

test('customer edits keep an existing password unless a replacement or explicit removal is submitted', async () => {
  const writes = [];
  const mutate = createClientMutationWorkflow({
    ...format,
    ...dates,
    queryOne: async (_sql, params) => {
      assert.equal(params.userId, 7);
      return { plano_adicional: null };
    },
    execute: async (sql, params) => {
      writes.push({ sql, params });
      return { affectedRows: 1 };
    },
    lerPlanoAdicional: () => null,
  } as any);
  const base = {
    action: 'update_cliente',
    id: '42',
    nome: 'Test',
    telefone: '11999999999',
    telefone_prefixo: '+55',
    vencimento: '01/11/2026',
    plano: 'Mensal',
    servidor: 'Test',
    telas: '1',
    valor: '30',
  };
  for (const fields of [
    { senha: '' },
    { senha: 'replacement' },
    { senha: '', limpar_senha: '1' },
  ]) {
    await mutate(7, { ...base, ...fields });
  }
  assert.equal(writes.length, 3);
  assert.match(
    writes[0].sql,
    /senha = IF\(:limparSenha = 1, NULL, COALESCE\(:senha, senha\)\)/,
  );
  assert.equal(writes[0].params.senha, null);
  assert.equal(writes[0].params.limparSenha, 0);
  assert.equal(writes[1].params.senha, 'replacement');
  assert.equal(writes[2].params.limparSenha, 1);
});

test('manual messages reject another account’s WhatsApp device before sending anything', async () => {
  const reads = [];
  const mutate = createClientMutationWorkflow({
    queryRows: async (sql, params) => {
      reads.push({ sql, params });
      return [];
    },
    enviarMensagemModelo: async () => assert.fail('sent using foreign device'),
  } as any);
  await mutate(7, {
    action: 'send_whatsapp',
    id: '42',
    dispositivo: 'foreign-session',
    mensagem_texto: 'test',
  });
  assert.equal(reads.length, 1);
  assert.match(reads[0].sql, /user_id = :userId/);
  assert.deepEqual(reads[0].params, { userId: 7, sessao: 'foreign-session' });
});

test('payment credentials stay on the server; blank edits preserve them and explicit removal deletes them', async () => {
  let stored = { access_token: 'private-payment-token', ambiente: 'sandbox' };
  const workflow = createPaymentSettingsWorkflow({
    carregarConfigsDoUsuario: async (id) => {
      assert.equal(id, 7);
      return [{ provider: 'asaas', credenciais: stored, ativo: true }];
    },
    salvarConfig: async (id, provider, credentials, active) => {
      assert.equal(id, 7);
      assert.equal(provider, 'asaas');
      stored = credentials;
      if (!Object.keys(credentials).length) assert.equal(active, false);
    },
    queryRows: async () => [],
    queryOne: async () => ({}),
    env: { appUrl: 'https://example.test' },
    PROVIDER_LISTA: ['asaas'],
  } as any);
  const input = {
    session: { user: { id: 7 } },
    body: {},
    flash() {},
    locals: {},
  };
  const page: any = await workflow.list(input);
  assert.equal(JSON.stringify(page).includes('private-payment-token'), false);
  const dto = nativePageData('pages/integracao-pagamento', {
    user: { id: 7 },
    providers: ['asaas'],
    credPorProvider: { asaas: stored },
  });
  assert.equal(JSON.stringify(dto).includes('private-payment-token'), false);
  const body = {
    provider: 'asaas',
    ativo_asaas: '1',
    creds_asaas_access_token: '',
  };
  await workflow.change({ ...input, body });
  assert.equal(stored.access_token, 'private-payment-token');
  await workflow.change({
    ...input,
    body: { ...body, remover_credenciais: '1' },
  });
  assert.deepEqual(stored, {});
});

test('admin authorization checks current database permissions and demands recent login for writes', async () => {
  let row: any = { isAdmin: '0' },
    allowed = false,
    status = 0;
  const now = 5_000_000;
  const middleware = createAdminAuthorization(
    async (_sql, params) => {
      assert.equal(params.id, 7);
      return row;
    },
    () => now,
  );
  const req = {
    session: {
      user: { id: 7, isAdmin: true },
      security: { authenticatedAt: now },
    },
    method: 'POST',
  };
  const res = {
    status(code) {
      status = code;
      return this;
    },
    render() {},
  };
  const next = (error) => {
    if (error) throw error;
    allowed = true;
  };
  await middleware(req, res, next);
  assert.equal(allowed, false);
  assert.equal(
    status,
    403,
    'Session flag never grants administrative permission',
  );
  row = { isAdmin: 1 };
  status = 0;
  req.session.security.authenticatedAt = now - 16 * 60_000;
  await middleware(req, res, next);
  assert.equal(allowed, false);
  assert.equal(status, 403);
  req.session.security.authenticatedAt = now;
  await middleware(req, res, next);
  assert.equal(allowed, true);
});

test('new panel passwords require 15 characters, respect bcrypt’s byte limit and use cost 12', async () => {
  const writes = [],
    costs = [];
  const workflow = createAccountWorkflow({
    queryOne: async (sql) =>
      sql.includes('id <>') ? null : { username: 'test', passwordHash: 'hash' },
    bcrypt: {
      compare: async (value) => value === 'current-password',
      hash: async (_value, cost) => {
        costs.push(cost);
        return 'new-hash';
      },
    },
    execute: async (_sql, params) => {
      writes.push(params);
    },
  } as any);
  const input = {
    session: { user: { id: 7, name: 'Test', username: 'test' } },
    flash() {},
    locals: {},
  };
  for (const password of ['a'.repeat(14), 'é'.repeat(37), '🐈'.repeat(8)]) {
    await workflow.saveProfile({
      ...input,
      body: {
        name: 'Test',
        username: 'test',
        current_password: 'current-password',
        password,
        password_confirm: password,
      },
    });
  }
  assert.equal(writes.length, 0);
  const password = 'passphrase-15-characters';
  await workflow.saveProfile({
    ...input,
    body: {
      name: 'Test',
      username: 'test',
      current_password: 'current-password',
      password,
      password_confirm: password,
    },
  });
  assert.equal(writes.length, 1);
  assert.deepEqual(costs, [12]);
});

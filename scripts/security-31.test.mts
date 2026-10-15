import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, createHash, generateKeyPairSync, sign } from 'node:crypto';
import express from 'express';
import { databaseTls } from '../src/security/databaseTls.ts';
import { authenticateWebhook } from '../src/security/paymentWebhooks.ts';
import { createPaymentWorkflow } from '../src/services/paymentWorkflow.ts';
import {
  automationsEnabled,
  startEnabledAutomations,
} from '../src/security/automationPolicy.ts';
import { createCronWorkflow } from '../src/workflows/cron.ts';
import { createWorkerProxyWorkflow } from '../src/workflows/worker-proxy.ts';
import {
  verifyDatabaseSchema,
  runSchemaMigrations,
} from '../src/db/migrations.ts';
import { configureHttp } from '../src/config/http.ts';
import { normalizeStatus } from '../src/services/paymentProvider.ts';

test('all SQL TLS options validate chain and DNS identity and have no insecure production switch', () => {
  assert.deepEqual(
    databaseTls({
      DB_HOST: 'db.example.test',
      DB_SSL: 'true',
      DB_SSL_REJECT_UNAUTHORIZED: 'false',
    }),
    { rejectUnauthorized: true, verifyIdentity: true, minVersion: 'TLSv1.2' },
  );
  assert.throws(() =>
    databaseTls({
      NODE_ENV: 'production',
      DB_HOST: 'remote.example.test',
      DB_SSL: 'false',
    }),
  );
  assert.throws(() => databaseTls({ DB_HOST: '127.0.0.1', DB_SSL: 'true' }));
  assert.throws(() =>
    databaseTls({ DB_HOST: '127.0.0.1', NODE_ENV: 'production' }),
  );
  assert.equal(
    databaseTls({ DB_HOST: '127.0.0.1', NODE_ENV: 'development' }),
    undefined,
  );
  assert.equal(
    databaseTls({ DB_HOST: 'localhost', DB_SSL: 'true', DB_SSL_CA: 'a\\nb' })
      .ca,
    'a\nb',
  );
});

const body = { type: 'order', data: { id: 'pix-1' } };
function mpRequest(
  secret = 'test-webhook-secret',
  ts = String(Math.floor(Date.now() / 1000)),
) {
  return {
    query: { 'data.id': 'pix-1' },
    headers: {
      'x-request-id': 'request-1',
      'x-signature': `ts=${ts},v1=${createHmac('sha256', secret).update(`id:pix-1;request-id:request-1;ts:${ts};`).digest('hex')}`,
    },
  };
}
test('Mercado Pago authenticates its official manifest and rejects stale, missing, tampered or cross-account signatures', () => {
  const cfg = { mode: 'hmac-sha256' as const, secret: 'test-webhook-secret' };
  assert.equal(
    authenticateWebhook('mercadopago', body, mpRequest(), cfg),
    true,
  );
  assert.equal(
    authenticateWebhook('mercadopago', body, mpRequest('foreign-owner'), cfg),
    false,
  );
  assert.equal(
    authenticateWebhook(
      'mercadopago',
      body,
      mpRequest(cfg.secret, '1000000000'),
      { ...cfg, timestampToleranceMs: 300000 },
    ),
    false,
  );
  assert.equal(
    authenticateWebhook(
      'mercadopago',
      body,
      mpRequest(cfg.secret, '1000000000'),
      cfg,
    ),
    true,
    'provider retries are not rejected solely by age without an approved tolerance',
  );
  assert.equal(
    authenticateWebhook(
      'mercadopago',
      { data: { id: 'other' } },
      mpRequest(),
      cfg,
    ),
    false,
  );
  assert.equal(authenticateWebhook('mercadopago', body, {}, cfg), false);
});
test('Asaas compares the dedicated webhook token, not a browser authorization field', () => {
  const cfg = { mode: 'token' as const, secret: 'dedicated-synthetic-token' };
  assert.equal(
    authenticateWebhook(
      'asaas',
      {},
      { headers: { 'asaas-access-token': cfg.secret } },
      cfg,
    ),
    true,
  );
  assert.equal(
    authenticateWebhook('asaas', { token: cfg.secret }, { headers: {} }, cfg),
    false,
  );
});
test('OpenPix RSA and PagBank ECDSA validate original bytes and fixed key algorithms', () => {
  const rawBody = Buffer.from('{ "id": "pix-1" }');
  for (const [provider, algorithm, mode, name] of [
    ['openpix', 'rsa', 'rsa-sha256', 'x-webhook-signature'],
    ['pagbank', 'ec', 'ecdsa-sha256', 'x-payload-signature'],
  ] as const) {
    const keys =
      algorithm === 'rsa'
        ? generateKeyPairSync('rsa', { modulusLength: 2048 })
        : generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    const cfg = {
      mode,
      publicKey: keys.publicKey
        .export({ type: 'spki', format: 'pem' })
        .toString(),
    };
    const request = {
      rawBody,
      headers: {
        [name]: sign('sha256', rawBody, keys.privateKey).toString('base64'),
      },
    };
    assert.equal(authenticateWebhook(provider, {}, request, cfg), true);
    assert.equal(
      authenticateWebhook(
        provider,
        {},
        { ...request, rawBody: Buffer.from('{"id":"pix-1"}') },
        cfg,
      ),
      false,
    );
    assert.equal(
      authenticateWebhook(provider, {}, { headers: request.headers }, cfg),
      false,
    );
  }
});
test('PagBank legacy SHA256 is explicit; unconfirmed Pagar.me never accepts an invented algorithm', () => {
  const rawBody = Buffer.from('{"id":"synthetic"}'),
    secret = 'synthetic-pagbank-token';
  const headers = {
    'x-authenticity-token': createHash('sha256')
      .update(secret + '-')
      .update(rawBody)
      .digest('hex'),
  };
  assert.equal(
    authenticateWebhook(
      'pagbank',
      {},
      { rawBody, headers },
      { mode: 'legacy-sha256', secret },
    ),
    true,
  );
  assert.equal(
    authenticateWebhook(
      'pagbank',
      {},
      { rawBody, headers },
      { mode: 'legacy-sha256', secret: 'wrong' },
    ),
    false,
  );
  assert.equal(
    authenticateWebhook(
      'pagarme',
      {},
      { rawBody, headers },
      { mode: 'legacy-sha256', secret },
    ),
    false,
  );
});

async function paymentFixture(overrides = {}) {
  const payment = {
    id: 99,
    userId: 7,
    clienteId: 42,
    valor: '25.00',
    status: 'pending',
    externalReference: 'cliente=42',
    provider: 'mercadopago',
  };
  let current = 'pending',
    notified = false,
    writes = 0,
    messages = 0,
    calls = 0;
  const confirmed = {
    id: 'pix-1',
    status: 'approved',
    amount: 25,
    currency: 'BRL',
    externalReference: 'cliente=42',
  };
  let queue = Promise.resolve();
  const workflow = createPaymentWorkflow({
    queryRows: async () => [payment],
    queryOne: async () => null,
    withTransaction: async (fn) => {
      const previous = queue;
      let unlock;
      queue = new Promise<void>((resolve) => {
        unlock = resolve;
      });
      await previous;
      try {
        return await fn({
          query: async () => [[{ status: current }]],
          execute: async (_sql, params) => {
            assert.equal(params.userId, 7);
            assert.equal(params.clienteId, 42);
            current = params.status;
            writes++;
          },
        });
      } finally {
        unlock();
      }
    },
    webhookSecurity: () => ({
      mode: 'hmac-sha256',
      secret: 'test-webhook-secret',
    }),
    configDoProvider: async (owner) => {
      assert.equal(owner, 7);
      return { credenciais: {} };
    },
    getProvider: () => ({
      consultarPagamento: async () => {
        calls++;
        return confirmed;
      },
    }),
    normalizeStatus,
    registrarPagamentoPendente: async () => {
      if (notified) return false;
      notified = true;
      return true;
    },
    enviarConfirmacaoPix: async () => {
      messages++;
    },
    ...overrides,
  } as any);
  return {
    workflow,
    confirmed,
    counts: () => ({ writes, messages, calls }),
    setState: (value) => {
      current = value;
    },
  };
}
test('webhook requires authenticity before provider access and checks amount, currency, resource and reference before writing', async () => {
  const f = await paymentFixture();
  assert.equal((await f.workflow.webhook('mercadopago', body, {})).status, 401);
  assert.equal(f.counts().calls, 0);
  for (const change of [
    { amount: 0.01 },
    { currency: 'USD' },
    { id: 'foreign' },
    { externalReference: 'cliente=999' },
  ]) {
    const original = { ...f.confirmed };
    Object.assign(f.confirmed, change);
    assert.equal(
      (await f.workflow.webhook('mercadopago', body, mpRequest())).status,
      422,
    );
    Object.assign(f.confirmed, original);
  }
  assert.equal(f.counts().writes, 0);
});
test('duplicate and concurrent authentic callbacks perform one transition and one claimed notification; delayed pending cannot regress approval', async () => {
  const f = await paymentFixture();
  const responses = await Promise.all(
    Array.from({ length: 8 }, () =>
      f.workflow.webhook('mercadopago', body, mpRequest()),
    ),
  );
  assert.ok(responses.every((r) => r.status === 200));
  assert.equal(f.counts().writes, 1);
  assert.equal(f.counts().messages, 1);
  f.confirmed.status = 'pending';
  await f.workflow.webhook('mercadopago', body, mpRequest());
  assert.equal(f.counts().writes, 1);
  f.confirmed.status = 'refunded';
  await f.workflow.webhook('mercadopago', body, mpRequest());
  assert.equal(f.counts().writes, 2);
  assert.equal(f.counts().messages, 1);
});
test('ambiguous cross-account payment IDs and unavailable auth contracts never update; transient failures request retry', async () => {
  const ambiguous = await paymentFixture({ queryRows: async () => [{}, {}] });
  assert.equal(
    (await ambiguous.workflow.webhook('mercadopago', body, mpRequest())).status,
    409,
  );
  const missing = await paymentFixture({ webhookSecurity: () => undefined });
  assert.equal(
    (await missing.workflow.webhook('mercadopago', body, mpRequest())).status,
    503,
  );
  const transient = await paymentFixture({
    getProvider: () => ({
      consultarPagamento: async () => {
        throw Error('private-credential');
      },
    }),
  });
  assert.equal(
    (await transient.workflow.webhook('mercadopago', body, mpRequest())).status,
    503,
  );
  assert.equal(transient.counts().writes, 0);
});
test('RUN_AUTOMATIONS=false and local mode block timers and HTTP cron/proxy before any dependency runs', async () => {
  let starts = 0;
  for (const localMode of [false, true])
    for (const runAutomations of [false, true]) {
      const env = { localMode, runAutomations, cronToken: 'synthetic-token' };
      const enabled = !localMode && runAutomations;
      assert.equal(automationsEnabled(env), enabled);
      assert.equal(
        startEnabledAutomations(env, () => {
          starts++;
        }),
        enabled,
      );
      if (enabled) continue;
      const deps = {
        env,
        executarCobrancasAutomaticas: async () => assert.fail('real cron'),
        executarAgendados: async () => assert.fail('real status'),
        rodarBackupAgendado: async () => assert.fail('real backup'),
      };
      const input = {
        query: { token: 'synthetic-token' },
        headers: {},
        get: () => '',
        locals: {},
      };
      assert.equal((await createCronWorkflow(deps).run(input)).status, 403);
      assert.equal(
        (
          await createWorkerProxyWorkflow({
            env,
            fetch: async () => assert.fail('worker request'),
          }).run(input)
        ).status,
        403,
      );
    }
  assert.equal(starts, 1);
});
test('schema startup can repeat with SELECT only; missing version blocks; concurrent migration fails before DDL', async () => {
  const read = [];
  const conn = {
    query: async (sql) => {
      read.push(sql);
      return [[]];
    },
  };
  await assert.rejects(verifyDatabaseSchema(conn));
  assert.ok(read.every((sql) => sql.startsWith('SELECT')));
  let executed = false;
  await assert.rejects(
    runSchemaMigrations({
      query: async (sql) => {
        if (sql.includes('DATABASE()')) return [[{ name: 'isolated' }]];
        if (sql.includes('GET_LOCK')) return [[{ acquired: 0 }]];
        executed = true;
        return [[]];
      },
    }),
  );
  assert.equal(executed, false);
});
test('HTTP parser preserves exact webhook bytes and does not attach ordinary bodies as raw data', async (t) => {
  const app = express();
  configureHttp(app, process.cwd(), { nodeEnv: 'development' });
  app.post(['/webhook/openpix', '/ordinary'], (req, res) =>
    res.json({
      raw: (req as any).rawBody?.toString() || null,
      parsed: req.body,
    }),
  );
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((r) => server.once('listening', r));
  t.after(
    () =>
      new Promise<void>((r) => {
        server.closeAllConnections();
        server.close(() => r());
      }),
  );
  const address = server.address() as any,
    raw = '{ "id": 1 }';
  const post = (path) =>
    fetch(`http://127.0.0.1:${address.port}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: raw,
    }).then((r) => r.json());
  assert.equal((await post('/webhook/openpix')).raw, raw);
  assert.equal((await post('/ordinary')).raw, null);
});

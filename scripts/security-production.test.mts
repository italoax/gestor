import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { SecretVault } from '../src/security/secretVault.ts';
import {
  inspectStoredSecrets,
  inspectSecuritySignals,
  operationalAlerts,
} from '../src/security/productionReview.ts';
import { gerarDumpSql } from '../src/services/backup.ts';
import { createAccountWorkflow } from '../src/workflows/account.ts';
import { createIntegrationsWorkflow } from '../src/workflows/integrations.ts';
import { createPaymentConfirmationWorkflow } from '../src/services/paymentConfirmation.ts';
import { createSecurityEvents } from '../src/security/securityEvents.ts';
import { createAdminAuthorization } from '../src/middleware/auth.ts';
import { hostingEntrySource } from './hosting-entry.mts';

test('inventory authenticates previous keys and detects plaintext, legacy, missing keys and foreign contexts without revealing values', async () => {
  const oldKey = randomBytes(32).toString('base64');
  const old = new SecretVault({ active: 'old', keys: { old: oldKey } });
  const vault = new SecretVault({
    active: 'new',
    keys: { old: oldKey, new: randomBytes(32).toString('base64') },
  });
  const connection = {
    query: async (sql) => {
      assert.match(sql, /^SELECT /);
      if (!sql.includes('FROM `clientes`')) return [[]];
      return [
        [
          { owner: 1, stored: 'PRIVATE-plaintext' },
          { owner: 1, stored: old.seal('PRIVATE-old', 'iptv:1') },
          { owner: 1, stored: vault.seal('PRIVATE-other-account', 'iptv:2') },
          { owner: 1, stored: vault.seal('PRIVATE-current', 'iptv:1') },
        ],
      ];
    },
  };
  const report = await inspectStoredSecrets(connection, vault);
  assert.deepEqual(report[0], {
    field: 'clientes.senha',
    total: 4,
    plaintext: 1,
    legacyEncrypted: 0,
    readable: 2,
    previousKey: 1,
    unreadable: 1,
    unverified: 0,
  });
  assert.equal(JSON.stringify(report).includes('PRIVATE'), false);
  assert.equal((await inspectStoredSecrets(connection))[0].unverified, 3);
  const legacy = await inspectStoredSecrets(
    {
      query: async (sql) => [
        sql.includes('FROM `integracoes`')
          ? [{ owner: 1, stored: 'PRIVATE-legacy' }]
          : [],
      ],
    },
    vault,
  );
  assert.equal(legacy[1].legacyEncrypted, 1);
});

test('monitor emits local signals for login abuse, administrative activity, disk pressure and missing backups', async () => {
  const signals = await inspectSecuritySignals({
    query: async (sql) => {
      assert.match(sql, /^SELECT /);
      assert.match(sql, /INTERVAL 15 MINUTE/);
      return [
        [
          { event: 'login.failure', count: 10 },
          { event: 'admin.denied', count: 1 },
          { event: 'admin.critical', count: 10 },
          { event: 'backup.exported', count: 2 },
        ],
      ];
    },
  });
  assert.equal(signals.excessiveLogin, true);
  assert.equal(signals.adminDenied, true);
  assert.equal(signals.adminWriteBurst, true);
  assert.equal(signals.exports, 2);
  assert.deepEqual(operationalAlerts({ freeRatio: 0.04, backupAgeHours: 27 }), {
    disk: 'critical',
    dailyBackup: 'stale',
    recoveryVerified: false,
  });
  assert.equal(
    operationalAlerts({ freeRatio: null, backupAgeHours: null }).dailyBackup,
    'missing',
  );
});

test('dump pins a pool connection to a read-only snapshot and releases it after success or failure', async () => {
  for (const fail of [false, true]) {
    const calls = [];
    const connection = {
      query: async (sql) => {
        calls.push(sql);
        if (sql === 'SHOW TABLES') {
          if (fail) throw new Error('test-failure');
          return [[{ table: 'sessions' }, { table: 'clientes' }]];
        }
        if (sql.startsWith('SHOW CREATE'))
          return [[{ 'Create Table': 'CREATE TABLE clientes (id INT)' }]];
        if (sql.startsWith('SELECT *')) return [[{ id: 1 }]];
        return [[]];
      },
      commit: async () => {
        calls.push('commit');
      },
      rollback: async () => {
        calls.push('rollback');
      },
      release: () => {
        calls.push('release');
      },
    };
    const pool = {
      getConnection: async () => connection,
      query: () => assert.fail('pool query cannot guarantee a snapshot'),
    };
    if (fail) await assert.rejects(gerarDumpSql(pool as any));
    else {
      const sql = await gerarDumpSql(pool as any);
      assert.ok(sql.includes('INSERT INTO `clientes`'));
      assert.equal(sql.includes('CREATE TABLE sessions'), false);
    }
    assert.equal(calls[0], 'SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
    assert.equal(
      calls[1],
      'START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY',
    );
    assert.deepEqual(calls.slice(-2), [
      fail ? 'rollback' : 'commit',
      'release',
    ]);
  }
});

const input = (body = {}) => ({
  session: { user: { id: 7 } },
  body,
  query: { userId: 99 },
  params: { id: '99' },
  locals: {},
  flash: () => [],
});
test('account export ignores browser ownership and audits the export with no-store headers', async () => {
  const audit = [];
  const owner = async (sql, params) => {
    assert.match(sql, /WHERE (?:user_id|id) = :userId/);
    assert.equal(params.userId, 7);
  };
  const workflow = createAccountWorkflow({
    queryOne: async (sql, params) => {
      await owner(sql, params);
      return { id: 7 };
    },
    queryRows: async (sql, params) => {
      await owner(sql, params);
      return [];
    },
    auditSecurity: async (...args) => {
      audit.push(args);
    },
  } as any);
  const reply = await workflow.backup(input({ userId: 99 }));
  assert.equal(reply.headers['Cache-Control'], 'no-store');
  assert.deepEqual(audit, [
    ['backup.exported', { userId: 7, reason: 'account' }],
  ]);
  const writes = [];
  await createSecurityEvents({
    secret: 'test',
    execute: async (_sql, params) => {
      writes.push(params);
    },
    logger: { log() {}, warn() {} },
  })('backup.exported', { userId: 7, reason: 'account' });
  assert.equal(writes[0].severity, 'alert');
});

test('foreign integration IDs cannot trigger provider requests or modify another owner', async () => {
  const writes = [];
  const workflow = createIntegrationsWorkflow({
    queryOne: async (sql, params) => {
      assert.match(sql, /id = :id AND user_id = :userId/);
      assert.equal(params.userId, 7);
      return null;
    },
    execute: async (sql, params) => {
      assert.match(sql, /id = :id AND user_id = :userId/);
      assert.equal(params.userId, 7);
      writes.push(params);
      return { affectedRows: 0 };
    },
    sigmaLogin: async () => assert.fail('foreign integration reached provider'),
    decryptSecret: () => assert.fail('foreign secret decrypted'),
  } as any);
  await workflow.change(
    input({ action: 'test_integracao', id: 99, userId: 99 }),
  );
  await workflow.change(
    input({ action: 'delete_integracao', id: 99, userId: 99 }),
  );
  assert.equal(writes.length, 1);
});

test('foreign payment IDs cannot renew clients even with a manipulated owner in browser data', async () => {
  const confirm = createPaymentConfirmationWorkflow({
    queryOne: async (sql, params) => {
      assert.match(sql, /id = :id AND user_id = :userId/);
      assert.equal(params.userId, 7);
      return null;
    },
    renovarClienteAutomatico: async () => assert.fail('foreign renewal'),
    renovarPlanosDoCliente: async () => assert.fail('foreign renewal'),
  } as any);
  assert.equal((await confirm(7, '99')).status, 404);
  assert.equal((await confirm(7, '99 OR 1=1')).status, 400);
});

test('a forged admin flag cannot bypass current database permissions', async () => {
  let denied = false;
  await createAdminAuthorization(async () => ({ isAdmin: 0 }) as any)(
    { session: { user: { id: 7, isAdmin: true } }, method: 'GET' },
    {
      status: (code) => {
        assert.equal(code, 403);
        return {
          render: () => {
            denied = true;
          },
        };
      },
    },
    () => assert.fail('ordinary account entered admin'),
  );
  assert.equal(denied, true);
});

test('production review requires explicit config, never loads the application dotenv or prints secret values', () => {
  mkdirSync('.tmp-ui', { recursive: true });
  const root = mkdtempSync(path.resolve('.tmp-ui/production-review-'));
  const file = path.join(root, 'review.security.env');
  writeFileSync(
    file,
    'NODE_ENV=development\nSESSION_SECRET=PRIVATE-sentinel\nDB_HOST=127.0.0.1\nAPP_URL=http://localhost\n',
    { mode: 0o600 },
  );
  try {
    execFileSync(
      process.execPath,
      ['--import', 'tsx', 'scripts/security-production.mts', '--config', file],
      { stdio: 'pipe', windowsHide: true },
    );
    assert.fail('insecure config must produce a failing exit code');
  } catch (error) {
    assert.equal(error.status, 2);
    const output = error.stdout.toString();
    assert.equal(output.includes('PRIVATE'), false);
    const report = JSON.parse(output);
    assert.equal(report.configurationOnly, true);
    assert.ok(report.blockers.includes('encrypted-writes-disabled'));
    assert.equal(report.productionInfrastructureVerified, false);
  }
});

test('hosting startup selects the explicit environment without mixing default dotenv values and refuses a missing file', () => {
  const root = mkdtempSync(path.resolve('.tmp-ui/environment-selection-'));
  mkdirSync(path.join(root, 'runtime/src/frontend'), { recursive: true });
  mkdirSync(path.join(root, 'runtime/scripts'), { recursive: true });
  writeFileSync(path.join(root, 'package.json'), '{"type":"module"}');
  writeFileSync(
    path.join(root, '.env'),
    'GESTOR_TEST_DEFAULT_ONLY=should-not-load\nGESTOR_TEST_SELECTION=default\n',
  );
  const config = path.join(root, 'isolated.security.env');
  writeFileSync(config, 'GESTOR_TEST_SELECTION=isolated\n');
  writeFileSync(path.join(root, 'entry.mjs'), hostingEntrySource());
  writeFileSync(
    path.join(root, 'runtime/src/frontend/publicServer.js'),
    'export function openPublicServer() { return { close: async () => {} }; }',
  );
  writeFileSync(
    path.join(root, 'runtime/scripts/run-stack.mjs'),
    `export async function runStack() {
    if (process.env.GESTOR_TEST_SELECTION !== 'isolated' || process.env.GESTOR_TEST_DEFAULT_ONLY) throw new Error('mixed environment');
    console.log('isolated-environment-ok');
  }`,
  );
  const run = (file) =>
    execFileSync(process.execPath, ['entry.mjs'], {
      cwd: root,
      encoding: 'utf8',
      windowsHide: true,
      stdio: 'pipe',
      env: { ...process.env, GESTOR_ENV_FILE: file },
    });
  assert.match(run(config), /isolated-environment-ok/);
  assert.throws(() => run(path.join(root, 'missing.security.env')));
});

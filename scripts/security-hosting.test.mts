import test from 'node:test';
import assert from 'node:assert/strict';
import {
  databaseConnection,
  databaseTls,
} from '../src/security/databaseTls.ts';
import {
  assertApprovedLocalDatabase,
  type DatabaseRuntimeIdentity,
} from '../src/security/localDatabasePolicy.ts';
import {
  approvedLocalDatabaseDeployments,
  type LocalDatabaseDeployment,
} from '../src/security/localDatabaseDeployments.ts';

const config = {
  NODE_ENV: 'production',
  DB_TRANSPORT: 'hostinger-local-tcp',
  DB_HOST: 'localhost',
  DB_PORT: '3306',
  DB_SSL: 'false',
};
const runtime: DatabaseRuntimeIdentity = {
  platform: 'linux',
  hostname: 'synthetic-host',
  uid: 2001,
  effectiveUid: 2001,
  gid: 2001,
  effectiveGid: 2001,
  applicationRoot:
    '/home/synthetic/domains/ixstreaming.com.br/hbuilds/versions/test-release/nodejs',
  networkNamespace: 'net:[12345]',
};
const approval: LocalDatabaseDeployment = {
  domain: 'ixstreaming.com.br',
  hostname: runtime.hostname,
  uid: runtime.uid,
  gid: runtime.gid,
  releasesRoot: '/home/synthetic/domains/ixstreaming.com.br/hbuilds/versions',
  networkNamespace: runtime.networkNamespace,
  evidenceReference: 'synthetic-only-no-real-hosting-evidence',
  approvedBy: 'test-only',
  validUntil: '2099-01-01T00:00:00Z',
  controls: {
    sameHostDatabase: true,
    tenantIsolation: true,
    databaseAccessRestricted: true,
    noForwardingOrTunnel: true,
  },
};

test('localhost alone and an environment flag never authorize plaintext in production', () => {
  assert.equal(approvedLocalDatabaseDeployments.length, 0);
  assert.throws(() =>
    databaseConnection({
      NODE_ENV: 'production',
      DB_HOST: 'localhost',
      DB_SSL: 'false',
    }),
  );
  assert.throws(() => databaseConnection(config), /aprovados/);
  assert.throws(() =>
    databaseConnection({
      ...config,
      HOSTNAME: runtime.hostname,
      APP_URL: 'https://ixstreaming.com.br',
      DB_ALLOW_LOCAL_PLAINTEXT: 'true',
    }),
  );
});

test('pure policy accepts only a simulated reviewed topology, never a real approval', () => {
  assert.doesNotThrow(() =>
    assertApprovedLocalDatabase(config, runtime, [approval]),
  );
  assert.throws(() => assertApprovedLocalDatabase(config, runtime, []));
  for (const key of Object.keys(approval.controls))
    assert.throws(() =>
      assertApprovedLocalDatabase(config, runtime, [
        { ...approval, controls: { ...approval.controls, [key]: false } },
      ]),
    );
  for (const patch of [
    { approvedBy: '' },
    { evidenceReference: '' },
    { validUntil: '2000-01-01' },
    { domain: 'other.invalid' },
    { networkNamespace: 'net:[9999]' },
  ])
    assert.throws(() =>
      assertApprovedLocalDatabase(config, runtime, [
        { ...approval, ...patch } as LocalDatabaseDeployment,
      ]),
    );
});

test('runtime identity checks reject another machine, user, group, namespace, application or release location', () => {
  for (const patch of [
    { platform: 'win32' },
    { hostname: 'other-machine' },
    { uid: 2002 },
    { effectiveUid: 0 },
    { gid: 2002 },
    { effectiveGid: 0 },
    { networkNamespace: 'net:[9999]' },
    { applicationRoot: '/tmp/nodejs' },
    { applicationRoot: approval.releasesRoot + '/../../public_html/nodejs' },
    { applicationRoot: approval.releasesRoot + '/release/nested/nodejs' },
  ])
    assert.throws(() =>
      assertApprovedLocalDatabase(config, { ...runtime, ...patch }, [approval]),
    );
});

test('remote and manipulated hostnames cannot obtain the local transport exception', () => {
  for (const host of [
    'srv1182.hstgr.io',
    'localhost.evil.invalid',
    'localhost.',
    'LOCALHOST',
    ' localhost',
    'localhost ',
    '127.0.0.1',
    '127.1',
    '2130706433',
    '0x7f000001',
    '::1',
    'localhost:3306',
    'mysql://localhost',
    'localhost\0.evil',
  ]) {
    assert.throws(() =>
      assertApprovedLocalDatabase({ ...config, DB_HOST: host }, runtime, [
        approval,
      ]),
    );
    if (!['127.0.0.1', '::1'].includes(host))
      assert.throws(() =>
        databaseConnection({
          NODE_ENV: 'production',
          DB_HOST: host,
          DB_SSL: 'false',
          DB_ALLOW_LOCAL_PLAINTEXT: 'true',
        }),
      );
  }
  for (const port of [
    '3307',
    '03306',
    '3306 ',
    '-1',
    '0',
    '65536',
    'not-a-port',
  ])
    assert.throws(() =>
      assertApprovedLocalDatabase({ ...config, DB_PORT: port }, runtime, [
        approval,
      ]),
    );
});

test('all remote SQL requires TLS even in development and caller boolean cannot disable it', () => {
  for (const NODE_ENV of ['development', 'production']) {
    assert.throws(() =>
      databaseConnection({
        NODE_ENV,
        DB_HOST: 'remote.invalid',
        DB_SSL: 'false',
      }),
    );
    assert.throws(() =>
      databaseTls({ NODE_ENV, DB_HOST: 'remote.invalid' }, false),
    );
    const options = databaseConnection({
      NODE_ENV,
      DB_HOST: 'remote.invalid',
      DB_SSL: 'true',
      DB_SSL_REJECT_UNAUTHORIZED: 'false',
    });
    assert.equal(options.ssl.rejectUnauthorized, true);
    assert.equal(options.ssl.verifyIdentity, true);
  }
});

test('invalid and alternative connection configurations are refused before creating a socket', () => {
  const secure = { DB_HOST: 'sql.example.test', DB_SSL: 'true' };
  for (const patch of [
    { DB_TRANSPORT: 'anything' },
    { DB_TRANSPORT: 'tls', DB_SSL: 'false' },
    { DB_SOCKET_PATH: '/unconfirmed/mysql.sock' },
    { DB_SOCKET: '/unconfirmed/mysql.sock' },
    { DATABASE_URL: 'mysql://localhost' },
    { DB_URL: 'mysql://localhost' },
    { DB_SSL: '0' },
    { DB_SSL: 'TRUE' },
    { DB_HOST: 'sql.example.test\r\n' },
    { DB_PORT: '0' },
    { DB_PORT: '65536' },
    { DB_PORT: '1.2' },
    { DB_PORT: 'abc' },
  ])
    assert.throws(() => databaseConnection({ ...secure, ...patch }));
  assert.throws(() =>
    assertApprovedLocalDatabase(
      { ...config, DB_SSL_CA: 'unexpected' },
      runtime,
      [approval],
    ),
  );
  assert.throws(() =>
    assertApprovedLocalDatabase({ ...config, DB_SSL: 'true' }, runtime, [
      approval,
    ]),
  );
});

test('laboratory TCP pins localhost to a literal address and never adds an unconfirmed socket path', () => {
  assert.deepEqual(
    databaseConnection({
      NODE_ENV: 'development',
      DB_HOST: 'localhost',
      DB_PORT: '12345',
      DB_SSL: 'false',
    }),
    { host: '127.0.0.1', port: 12345, ssl: undefined },
  );
  assert.equal(
    Object.hasOwn(databaseConnection({ DB_HOST: 'localhost' }), 'socketPath'),
    false,
  );
});

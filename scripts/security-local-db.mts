import assert from 'node:assert/strict';
import { createServer, createConnection as tcpConnection } from 'node:net';
import { execFileSync, spawn } from 'node:child_process';
import {
  randomBytes,
  createCipheriv,
  createHash,
  createHmac,
} from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  writeFileSync,
  readFileSync,
} from 'node:fs';
import path from 'node:path';
import mysql from 'mysql2/promise';
import { SecretVault } from '../src/security/secretVault.ts';
import {
  planSecretMigration,
  encodeMigrationBackup,
  decodeMigrationBackup,
  applySecretChanges,
} from '../src/security/secretMigration.ts';
import { SharedRateStore } from '../src/security/sharedRateStore.ts';
import { createLoginAttempts } from '../src/services/loginAttempts.ts';
import { createSecurityEvents } from '../src/security/securityEvents.ts';
import { gerarDumpSql } from '../src/services/backup.ts';
import { databaseTls } from '../src/security/databaseTls.ts';
import {
  runSchemaMigrations,
  verifyDatabaseSchema,
} from '../src/db/migrations.ts';
import { createPaymentWorkflow } from '../src/services/paymentWorkflow.ts';
import { createPendingPaymentRegistrar } from '../src/services/renovacoesPendentes.ts';
import { normalizeStatus } from '../src/services/paymentProvider.ts';

const bin = path.resolve(
  process.env.MARIADB_TEST_BIN ||
    '.tmp-ui/mariadb/server/mariadb-11.8.3-winx64/bin',
);
if (!existsSync(path.join(bin, 'mariadbd.exe')))
  throw new Error(
    'Informe MARIADB_TEST_BIN para uma distribuição MariaDB portátil autorizada.',
  );
mkdirSync('.tmp-ui', { recursive: true });
const root = mkdtempSync(path.resolve('.tmp-ui/security-db-'));
const openssl =
  process.env.OPENSSL_TEST_BIN || 'C:/Program Files/Git/usr/bin/openssl.exe';
const certFile = path.join(root, 'server.crt'),
  privateKeyFile = path.join(root, 'server.key');
for (const label of ['server', 'untrusted']) {
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
      path.join(root, label + '.key'),
      '-out',
      path.join(root, label + '.crt'),
      '-subj',
      '/CN=localhost',
      '-addext',
      'subjectAltName=DNS:localhost',
    ],
    { windowsHide: true, stdio: 'pipe' },
  );
}
const datadir = path.join(root, 'data'),
  password = randomBytes(32).toString('base64url');
const probe = createServer();
await new Promise<void>((resolve) => probe.listen(0, '127.0.0.1', resolve));
const address = probe.address();
assert.ok(address && typeof address !== 'string');
const port = address.port;
await new Promise<void>((resolve) => probe.close(() => resolve()));
execFileSync(
  path.join(bin, 'mariadb-install-db.exe'),
  [
    `--datadir=${datadir}`,
    `--password=${password}`,
    `--port=${port}`,
    '--silent',
  ],
  { windowsHide: true, stdio: 'pipe' },
);
const server = spawn(
  path.join(bin, 'mariadbd.exe'),
  [
    '--no-defaults',
    `--basedir=${path.dirname(bin)}`,
    `--datadir=${datadir}`,
    '--bind-address=127.0.0.1',
    `--port=${port}`,
    '--skip-log-bin',
    '--max-connections=25',
    '--innodb-buffer-pool-size=64M',
    '--console',
    `--ssl-cert=${certFile}`,
    `--ssl-key=${privateKeyFile}`,
  ],
  { windowsHide: true, stdio: 'ignore' },
);
let conn: any, restored: any, secondConnection: any;
const credentials = {
  host: '127.0.0.1',
  port,
  user: 'root',
  password,
  namedPlaceholders: true,
  connectTimeout: 1000,
  multipleStatements: true,
};
try {
  for (let i = 0; i < 100; i++) {
    try {
      conn = await mysql.createConnection(credentials);
      break;
    } catch {
      if (server.exitCode !== null)
        throw new Error('O MariaDB de teste não iniciou.');
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  assert.ok(conn, 'MariaDB local disponível');
  const tlsOptions = (host: string, caFile = certFile) => ({
    ...credentials,
    host,
    stream: () => tcpConnection({ host: '127.0.0.1', port }),
    ssl: databaseTls({
      DB_HOST: host,
      DB_SSL: 'true',
      DB_SSL_CA: readFileSync(caFile, 'utf8'),
    }),
  });
  const secured = await mysql.createConnection(tlsOptions('localhost'));
  const [tlsCipher] = await secured.query(
    "SHOW SESSION STATUS LIKE 'Ssl_cipher'",
  );
  assert.ok(tlsCipher[0].Value);
  await secured.end();
  await assert.rejects(
    mysql.createConnection(
      tlsOptions('localhost', path.join(root, 'untrusted.crt')),
    ),
  );
  await assert.rejects(mysql.createConnection(tlsOptions('wrong.invalid')));
  console.log(
    'PASS: TLS SQL real em loopback aceita certificado confiável e recusa CA errada e hostname divergente.',
  );
  const [location] = await conn.query(
    'SELECT @@datadir AS dir, @@version AS version',
  );
  assert.ok(
    path.resolve(location[0].dir).toLowerCase().startsWith(root.toLowerCase()),
  );
  const database = 'gestor_security_' + randomBytes(6).toString('hex'),
    restoreDb = database + '_restore';
  await conn.query(
    `CREATE DATABASE \`${database}\`; CREATE DATABASE \`${restoreDb}\`; USE \`${database}\``,
  );
  await conn.query(`
    CREATE TABLE users (id INT PRIMARY KEY, username VARCHAR(60), password_hash VARCHAR(255), mp_access_token TEXT, session_version INT NOT NULL DEFAULT 0);
    CREATE TABLE clientes (id INT PRIMARY KEY, user_id INT NOT NULL, user VARCHAR(120), senha TEXT, pagamento_curto VARCHAR(16), arquivado INT DEFAULT 0, portal_bloqueado INT DEFAULT 0);
    CREATE TABLE integracoes (id INT PRIMARY KEY, user_id INT NOT NULL, senha_enc TEXT);
    CREATE TABLE payment_provider_configs (user_id INT NOT NULL, provider VARCHAR(40), credenciais TEXT, ativo INT, PRIMARY KEY (user_id, provider));
    CREATE TABLE auth_login_attempts (user_id INT PRIMARY KEY, attempts INT UNSIGNED, reset_at BIGINT UNSIGNED);
    CREATE TABLE security_rate_limits (bucket VARCHAR(40), key_hash CHAR(64), hits INT UNSIGNED, reset_at BIGINT UNSIGNED, PRIMARY KEY (bucket,key_hash));
    CREATE TABLE security_events (id BIGINT AUTO_INCREMENT PRIMARY KEY, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, event VARCHAR(60), severity VARCHAR(12), user_id INT, source_hash CHAR(64), reason VARCHAR(60), count_value INT);`);
  const legacySecret = randomBytes(32).toString('hex');
  const legacyKey = createHash('sha256').update(legacySecret).digest(),
    iv = randomBytes(12),
    cipher = createCipheriv('aes-256-gcm', legacyKey, iv);
  const encrypted = Buffer.concat([
    cipher.update('integration-one'),
    cipher.final(),
  ]);
  const legacyCipher = [iv, cipher.getAuthTag(), encrypted]
    .map((v) => v.toString('base64'))
    .join('.');
  await conn.execute(
    'INSERT INTO users VALUES (1, :username, :hash, :token, 0)',
    {
      username: 'owner-one',
      hash: 'unchanged-password-hash-one',
      token: 'legacy-payment-one',
    },
  );
  await conn.execute(
    'INSERT INTO users VALUES (2, :username, :hash, NULL, 0)',
    { username: 'owner-two', hash: 'unchanged-password-hash-two' },
  );
  await conn.execute(
    'INSERT INTO clientes VALUES (1, 1, :user, :password, :alias, 0, 0)',
    { user: 'customer-one', password: 'iptv-one', alias: 'ABCDEFGHIJKLMNOP' },
  );
  await conn.execute(
    'INSERT INTO clientes VALUES (2, 2, :user, :password, NULL, 0, 0)',
    { user: 'customer-two', password: 'iptv-two' },
  );
  await conn.execute('INSERT INTO integracoes VALUES (1, 1, :secret)', {
    secret: legacyCipher,
  });
  await conn.execute(
    'INSERT INTO payment_provider_configs VALUES (1, :provider, :credentials, 1)',
    {
      provider: 'mercadopago',
      credentials: JSON.stringify({ access_token: 'payment-one' }),
    },
  );
  const keys = {
    first: randomBytes(32).toString('base64'),
    second: randomBytes(32).toString('base64'),
  };
  const vault = new SecretVault({ active: 'first', keys });
  const keyFile = path.join(root, 'keyring.json');
  writeFileSync(keyFile, JSON.stringify({ active: 'first', keys }), {
    mode: 0o600,
    flag: 'wx',
  });
  const configFile = path.join(root, 'migration.env'),
    restoreConfig = path.join(root, 'restore.env');
  const config = (name: string) =>
    `MIGRATION_ENVIRONMENT=local\nDB_HOST=127.0.0.1\nDB_PORT=${port}\nDB_NAME=${name}\nDB_USER=root\nDB_PASSWORD=${password}\nLEGACY_SESSION_SECRET=${legacySecret}\nDATA_ENCRYPTION_KEY_FILE=${keyFile.replace(/\\/g, '/')}\n`;
  writeFileSync(configFile, config(database), { mode: 0o600, flag: 'wx' });
  writeFileSync(restoreConfig, config(restoreDb), { mode: 0o600, flag: 'wx' });
  // Nunca herdar dotenv/credenciais do processo que importa os módulos reais.
  // Apenas variáveis do SO, mais o alvo efêmero explícito, chegam aos filhos.
  const isolatedChildEnv = (overrides: Record<string,string> = {}) => {
    const os = Object.fromEntries(Object.entries(process.env).filter(([name]) =>
      /^(systemroot|windir|path|pathext|temp|tmp|comspec|userprofile|appdata|localappdata|number_of_processors|processor_architecture)$/i.test(name)));
    const result = {...os, NODE_ENV:'development', GESTOR_ENV_FILE:configFile,
      DB_HOST:'127.0.0.1',DB_PORT:String(port),DB_NAME:database,DB_USER:'root',DB_PASSWORD:password,
      DB_SSL:'false',RUN_AUTOMATIONS:'false',SESSION_SECRET:legacySecret,...overrides};
    assert.equal(result.DB_HOST,'127.0.0.1');assert.equal(result.DB_PORT,String(port));
    assert.ok(result.DB_NAME === database || result.DB_NAME.startsWith(database+'_'));
    return result;
  };
  const child = (file: string, args: string[] = [], env = {}) =>
    execFileSync(process.execPath, ['--import', 'tsx', file, ...args], {
      windowsHide: true,
      stdio: 'pipe',
      env: isolatedChildEnv(env),
      timeout: 30000,
    }).toString('utf8');
  assert.throws(() => isolatedChildEnv({DB_HOST:'remote.invalid'}));
  assert.throws(() => isolatedChildEnv({DB_PORT:'3306'}));
  assert.throws(() => isolatedChildEnv({DB_NAME:'unrelated_schema'}));
  assert.equal(Object.hasOwn(isolatedChildEnv(), 'WA_SESSION_API_TOKEN'), false);
  // Ensaio de recuperação completo em outro schema ANTES da primeira migração.
  // Outra conexão altera um registro depois de aberto o snapshot. O dump
  // deve preservar a visão anterior, mesmo lendo a tabela posteriormente.
  const concurrent = await mysql.createConnection({ ...credentials, database });
  let concurrentWrite = false;
  let dump: string;
  try {
    dump = await gerarDumpSql({
      query: async (sql) => {
        if (!concurrentWrite && sql === 'SHOW TABLES') {
          concurrentWrite = true;
          await concurrent.query(
            "UPDATE clientes SET senha='isolated-concurrent-write' WHERE id=1",
          );
        }
        return conn.query(sql);
      },
      commit: () => conn.commit(),
      rollback: () => conn.rollback(),
    } as any);
    assert.ok(concurrentWrite);
    assert.equal(dump.includes('isolated-concurrent-write'), false);
    assert.ok(dump.includes('iptv-one'));
    await concurrent.query("UPDATE clientes SET senha='iptv-one' WHERE id=1");
  } finally {
    await concurrent.end();
  }
  console.log(
    'PASS: snapshot do dump preserva consistência diante de escrita concorrente em outra conexão.',
  );
  const backupPath = path.join(root, 'before.sql.enc');
  const fullBackup = JSON.stringify({
    version: 2,
    sourceDatabase: database,
    payload: vault.seal(dump, `database-backup:${database}`),
  });
  assert.equal(fullBackup.includes('iptv-one'), false);
  writeFileSync(backupPath, fullBackup, { mode: 0o600, flag: 'wx' });
  child('scripts/restore-backup.mts', [
    '--config',
    restoreConfig,
    '--backup',
    backupPath,
    '--apply',
  ]);
  restored = await mysql.createConnection({
    ...credentials,
    database: restoreDb,
  });
  assert.equal(
    (await restored.query('SELECT senha FROM clientes WHERE id=1'))[0][0].senha,
    'iptv-one',
  );
  assert.equal(
    (await restored.query('SELECT password_hash FROM users WHERE id=1'))[0][0]
      .password_hash,
    'unchanged-password-hash-one',
  );
  const [sourceTables] = await conn.query('SHOW TABLES');
  for (const row of sourceTables) {
    const table = String(Object.values(row)[0]);
    if (['sessions', 'auth_login_attempts'].includes(table)) continue;
    const quoted = '`' + table.replace(/`/g, '``') + '`';
    const [originalRows] = await conn.query(`SELECT * FROM ${quoted}`);
    const [restoredRows] = await restored.query(`SELECT * FROM ${quoted}`);
    const canonical = (rows) =>
      rows.map((value) => JSON.stringify(value)).sort();
    assert.deepEqual(
      canonical(restoredRows),
      canonical(originalRows),
      'Integridade de todas as linhas restauradas',
    );
  }
  assert.throws(
    () =>
      child('scripts/restore-backup.mts', [
        '--config',
        restoreConfig,
        '--backup',
        backupPath,
        '--apply',
      ]),
    'Banco ocupado não pode ser sobrescrito',
  );
  console.log(
    'PASS: restauração real de backup cifrado em schema vazio, antes da migração; destino ocupado é recusado.',
  );
  const rollbackFile = path.join(root, 'migration.enc');
  child('scripts/migrate-secrets.mts', ['--config', configFile]);
  child('scripts/migrate-secrets.mts', [
    '--config',
    configFile,
    '--apply',
    '--backup',
    rollbackFile,
    '--restore-tested',
  ]);
  const [customer] = await conn.query('SELECT * FROM clientes WHERE id=1');
  assert.ok(customer[0].senha.startsWith('gestor:v2:first:'));
  assert.equal(vault.open(customer[0].senha, 'iptv:1'), 'iptv-one');
  assert.throws(() => vault.open(customer[0].senha, 'iptv:2'));
  const legacyDecode = (value: string) => {
    assert.equal(value, legacyCipher);
    return 'integration-one';
  };
  assert.equal(
    (await planSecretMigration(conn, vault, legacyDecode)).length,
    0,
    'Migração idempotente',
  );
  child('scripts/security-compatibility-child.mts', [], {
    NODE_ENV: 'test',
    LOCAL_MODE: 'true',
    COOKIE_SECURE: 'false',
    SESSION_SECRET: legacySecret,
    DATA_ENCRYPTION_KEY_FILE: keyFile,
    DATA_ENCRYPTION_KEYS: '',
    DATA_ENCRYPTION_ACTIVE_KEY: '',
    DB_HOST: '127.0.0.1',
    DB_PORT: String(port),
    DB_USER: 'root',
    DB_PASSWORD: password,
    DB_NAME: database,
    DB_SSL: 'false',
  });
  // O teste de compatibilidade regravou um token, então restauramos o estado
  // migrado correspondente antes de ensaiar o rollback com comparação exata.
  const originalPlan = decodeMigrationBackup(
    vault,
    database,
    (await import('node:fs')).readFileSync(rollbackFile, 'utf8'),
  );
  const payment = originalPlan.find(
    (c) => c.table === 'payment_provider_configs',
  )!;
  await conn.execute(
    'UPDATE payment_provider_configs SET credenciais=:after WHERE user_id=1',
    { after: payment.after },
  );
  child('scripts/migrate-secrets.mts', [
    '--config',
    configFile,
    '--rollback',
    rollbackFile,
    '--apply',
  ]);
  assert.equal(
    (await conn.query('SELECT senha FROM clientes WHERE id=1'))[0][0].senha,
    'iptv-one',
  );
  assert.equal(
    (await conn.query('SELECT senha_enc FROM integracoes WHERE id=1'))[0][0]
      .senha_enc,
    legacyCipher,
  );
  console.log(
    'PASS: migração, leitura das integrações, isolamento entre contas, idempotência e rollback real sem alterar hashes de login.',
  );
  const plan = await planSecretMigration(conn, vault, legacyDecode);
  const encryptedPlan = encodeMigrationBackup(vault, database, plan);
  assert.equal(
    decodeMigrationBackup(vault, database, encryptedPlan).length,
    plan.length,
  );
  await applySecretChanges(conn, plan);
  const rotated = new SecretVault({ active: 'second', keys });
  const rotation = await planSecretMigration(conn, rotated, legacyDecode);
  await applySecretChanges(conn, rotation);
  const stored = (
    await conn.query('SELECT senha FROM clientes WHERE id=1')
  )[0][0].senha;
  assert.ok(stored.startsWith('gestor:v2:second:'));
  assert.equal(rotated.open(stored, 'iptv:1'), 'iptv-one');
  assert.throws(() =>
    new SecretVault({ active: 'first', keys: { first: keys.first } }).open(
      stored,
      'iptv:1',
    ),
  );
  const changed = [...rotation].map((c) => ({ ...c }));
  changed[changed.length - 1].after = 'concurrent-change';
  await assert.rejects(applySecretChanges(conn, changed, true));
  assert.equal(
    (await conn.query('SELECT senha FROM clientes WHERE id=1'))[0][0].senha,
    stored,
    'Conflito não deixa rollback parcial',
  );
  console.log(
    'PASS: rotação de chave, recuperação com keyring, rejeição de chave ausente e rollback atômico diante de alteração concorrente.',
  );
  const db = {
    execute: async (sql, params) => (await conn.execute(sql, params))[0],
    queryOne: async (sql, params) => (await conn.query(sql, params))[0][0],
  };
  secondConnection = await mysql.createConnection({ ...credentials, database });
  const db2 = {
    execute: async (sql, params) =>
      (await secondConnection.execute(sql, params))[0],
    queryOne: async (sql, params) =>
      (await secondConnection.query(sql, params))[0][0],
  };
  let time = Date.now();
  const store1 = new SharedRateStore(db, 'test', () => time),
    store2 = new SharedRateStore(db2, 'test', () => time);
  store1.init({ windowMs: 1000 });
  store2.init({ windowMs: 1000 });
  const counts = await Promise.all([
    store1.increment('client'),
    store2.increment('client'),
  ]);
  assert.equal(Math.max(...counts.map((r) => r.totalHits)), 2);
  assert.equal(
    (await new SharedRateStore(db, 'test', () => time).increment('client'))
      .totalHits,
    3,
  );
  time += 1001;
  assert.equal((await store2.increment('client')).totalHits, 1);
  const attempts = createLoginAttempts(db, () => time);
  for (let i = 0; i < 10; i++) assert.equal(await attempts.consume(1), true);
  assert.equal(await createLoginAttempts(db, () => time).consume(1), false);
  time += 15 * 60_000;
  assert.equal(await attempts.consume(1), true);
  const events: any[] = [],
    audit = createSecurityEvents({
      execute: db.execute,
      secret: randomBytes(32).toString('hex'),
      logger: { warn: (v) => events.push(v), log: (v) => events.push(v) },
    });
  await audit('admin.denied', {
    userId: 1,
    ip: '192.0.2.1',
    reason: 'permission',
    password: 'must-not-store',
  } as any);
  const event = (await conn.query('SELECT * FROM security_events'))[0][0];
  assert.equal(event.severity, 'alert');
  assert.equal(JSON.stringify(event).includes('must-not-store'), false);
  assert.equal(events[0].includes('192.0.2.1'), false);
  let inspection: any;
  try {
    child('scripts/security-production.mts', [
      '--config',
      configFile,
      '--database',
    ]);
    assert.fail('Configuração fictícia não deve ser aprovada como produção.');
  } catch (error) {
    assert.equal(error.status, 2);
    inspection = JSON.parse(error.stdout.toString());
  }
  assert.equal(inspection.configurationOnly, false);
  assert.ok(
    inspection.secrets.every(
      (field) =>
        field.unreadable === 0 &&
        field.plaintext === 0 &&
        field.legacyEncrypted === 0,
    ),
  );
  assert.equal(inspection.signals.adminDenied, true);
  assert.equal(JSON.stringify(inspection).includes('iptv-one'), false);
  console.log(
    'PASS: inspeção SQL somente de leitura autentica registros e detecta alerta administrativo no banco fictício.',
  );
  console.log(
    `PASS: MariaDB ${location[0].version}, contadores compartilhados/concorrentes, expiração e alerta administrativo persistido sem segredos.`,
  );
  const schemaDb = database + '_schema';
  await conn.query(`CREATE DATABASE \`${schemaDb}\`; USE \`${schemaDb}\``);
  await runSchemaMigrations(conn);
  await conn.query(
    "INSERT INTO users (name,username,password_hash) VALUES ('Ficticio','ficticio','unchanged-test-hash')",
  );
  await conn.query(
    "INSERT INTO assinatura_planos (nome,preco,descricao,dias_validade,ativo,ordem) VALUES ('Basico',50,'keep',30,1,1)",
  );
  const beforeStartup = (await conn.query('SELECT * FROM users'))[0];
  for (let i = 0; i < 3; i++) {
    await verifyDatabaseSchema(conn);
    await runSchemaMigrations(conn);
  }
  assert.deepEqual((await conn.query('SELECT * FROM users'))[0], beforeStartup);
  const [plans] = await conn.query(
    'SELECT nome,preco,ativo FROM assinatura_planos',
  );
  assert.equal(plans[0].nome, 'Basico');
  assert.equal(Number(plans[0].preco), 50);
  assert.equal(plans[0].ativo, 1);
  const [versions] = await conn.query('SELECT version FROM schema_migrations');
  assert.equal(versions.length, 1);
  const schemaConfig = path.join(root, 'schema.security.env');
  writeFileSync(schemaConfig, config(schemaDb), { mode: 0o600, flag: 'wx' });
  child('scripts/migrate-schema.mts', ['--config', schemaConfig]);
  child('scripts/migrate-schema.mts', ['--config', schemaConfig, '--apply']);
  const compiledCheck = execFileSync(process.execPath, ['--input-type=module', '-e',
    "if(process.env.DB_HOST!=='127.0.0.1'||!process.env.DB_NAME.startsWith('gestor_security_'))throw Error('isolated target required'); const {db}=await import('./dist/runtime/src/db/mysql.js'); const {verifyDatabaseSchema}=await import('./dist/runtime/src/db/migrations.js'); try { if(db.pool.config.connectionConfig.host!=='127.0.0.1'||db.pool.config.connectionConfig.database!==process.env.DB_NAME||String(db.pool.config.connectionConfig.port)!==process.env.DB_PORT)throw Error('isolated configuration required'); await verifyDatabaseSchema(db); console.log('compiled-schema-ok'); } finally { await db.end(); }"],
    { windowsHide:true, stdio:'pipe', env:isolatedChildEnv({GESTOR_ENV_FILE:schemaConfig,DB_NAME:schemaDb}),timeout:15000 }).toString();
  assert.ok(compiledCheck.includes('compiled-schema-ok'));
  await secondConnection.query(`USE \`${schemaDb}\``);
  const [lockRows] = await conn.query('SELECT DATABASE() AS name');
  const lockName =
    'gestor-schema-' +
    createHash('sha256').update(lockRows[0].name).digest('hex').slice(0, 40);
  await conn.query('SELECT GET_LOCK(?,0)', [lockName]);
  try {
    await assert.rejects(runSchemaMigrations(secondConnection));
  } finally {
    await conn.query('SELECT RELEASE_LOCK(?)', [lockName]);
  }
  console.log(
    'PASS: migração estrutural versionada e repetida, startup sem DML comercial, preservação de hash/plano/preço/trial e trava entre conexões.',
  );
  // Integração de webhook com transações reais, mas provedor/push/mensagem simulados.
  const paymentPool = mysql.createPool({
    ...credentials,
    database: schemaDb,
    connectionLimit: 4,
  });
  try {
    await conn.query(
      "INSERT INTO clientes (id,user_id,nome,`user`,telefone,vencimento,valor) VALUES (42,1,'Ficticio','ficticio','000','2026-11-01',25)",
    );
    await conn.query(
      "INSERT INTO pagamentos (id,user_id,cliente_id,valor,mp_payment_id,provider,external_reference,renovacao_periodos) VALUES (99,1,42,25,'pix-synthetic','mercadopago','synthetic-ref',1)",
    );
    const withTransaction = async (fn) => {
      const connection = await paymentPool.getConnection();
      try {
        await connection.beginTransaction();
        const result = await fn(connection);
        await connection.commit();
        return result;
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally {
        connection.release();
      }
    };
    let pushes = 0,
      messages = 0;
    const registrar = createPendingPaymentRegistrar({
      withTransaction,
      enviarPushParaUsuario: async () => {
        pushes++;
      },
    });
    const workflow = createPaymentWorkflow({
      queryRows: async (sql, params) =>
        (await paymentPool.query(sql, params))[0],
      withTransaction,
      webhookSecurity: () => ({
        mode: 'hmac-sha256',
        secret: 'synthetic-webhook-secret',
      }),
      configDoProvider: async (owner) => {
        assert.equal(owner, 1);
        return { credenciais: {} };
      },
      getProvider: () => ({
        consultarPagamento: async () => ({
          id: 'pix-synthetic',
          amount: 25,
          currency: 'BRL',
          externalReference: 'synthetic-ref',
          status: 'approved',
        }),
      }),
      normalizeStatus,
      registrarPagamentoPendente: registrar,
      enviarConfirmacaoPix: async () => {
        messages++;
      },
    } as any);
    const ts = String(Math.floor(Date.now() / 1000));
    const signature = createHmac('sha256', 'synthetic-webhook-secret')
      .update(`id:pix-synthetic;request-id:local-test;ts:${ts};`)
      .digest('hex');
    const request = {
      headers: {
        'x-request-id': 'local-test',
        'x-signature': `ts=${ts},v1=${signature}`,
      },
      query: { 'data.id': 'pix-synthetic' },
    };
    const results = await Promise.all(
      Array.from({ length: 8 }, () =>
        workflow.webhook(
          'mercadopago',
          { type: 'order', data: { id: 'pix-synthetic' } },
          request,
        ),
      ),
    );
    assert.ok(results.every((result) => result.status === 200));
    assert.equal(
      Number(
        (
          await conn.query(
            'SELECT COUNT(*) AS count FROM notificacoes WHERE pagamento_id=99',
          )
        )[0][0].count,
      ),
      1,
    );
    assert.equal(pushes, 1);
    assert.equal(messages, 1);
    assert.equal(
      Number(
        (await conn.query('SELECT COUNT(*) AS count FROM transacoes'))[0][0]
          .count,
      ),
      0,
    );
    console.log(
      'PASS: oito callbacks autenticados concorrentes em SQL geram uma pendência, um push simulado e uma mensagem simulada, sem débito/renovação.',
    );
  } finally {
    await paymentPool.end();
  }
} finally {
  await restored?.end().catch(() => {});
  await secondConnection?.end().catch(() => {});
  if (conn) {
    try {
      await conn.query('SHUTDOWN');
    } catch {}
    await conn.end().catch(() => {});
  }
  server.kill();
}

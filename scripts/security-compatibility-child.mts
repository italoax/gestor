// Executado somente pelo ensaio isolado, com variáveis temporárias próprias.
import assert from 'node:assert/strict';
import { queryOne, queryRows, execute, db } from '../src/db/mysql.ts';
import {
  carregarConfigsDoUsuario,
  salvarConfig,
} from '../src/services/paymentProvider.ts';
import { encryptSecret, decryptSecret } from '../src/services/crypto.ts';
import {
  revealIptvPassword,
  protectIptvPassword,
} from '../src/security/storedSecrets.ts';
import { montarMensagem } from '../src/services/whatsapp.ts';
import { createPortalWorkflow } from '../src/workflows/portal.ts';
import { createHash } from 'node:crypto';
try {
  const customer = await queryOne('SELECT * FROM clientes WHERE id = 1');
  assert.equal(
    revealIptvPassword(customer.senha, customer.user_id),
    'iptv-one',
  );
  assert.equal(montarMensagem('{senha}', customer), 'iptv-one');
  assert.throws(() => revealIptvPassword(customer.senha, 2));
  const configs = await carregarConfigsDoUsuario(1);
  assert.equal(configs[0].credenciais.access_token, 'payment-one');
  await salvarConfig(1, 'mercadopago', configs[0].credenciais, true);
  const saved = await queryOne(
    'SELECT credenciais FROM payment_provider_configs WHERE user_id = 1',
  );
  assert.ok(saved.credenciais.startsWith('gestor:v2:'));
  assert.equal(saved.credenciais.includes('payment-one'), false);
  const integration = await queryOne(
    'SELECT senha_enc FROM integracoes WHERE id = 1',
  );
  assert.equal(decryptSecret(integration.senha_enc, 1), 'integration-one');
  assert.equal(
    decryptSecret(encryptSecret('new-integration', 1), 1),
    'new-integration',
  );
  assert.equal(
    revealIptvPassword(protectIptvPassword('new-iptv', 1), 1),
    'new-iptv',
  );
  const portal = createPortalWorkflow({ queryRows, queryOne, execute } as any);
  let session: any = { cookie: {} };
  const reset = () => {
    session = {
      cookie: {},
      regenerate(callback) {
        reset();
        callback();
      },
      save(callback) {
        callback();
      },
    };
  };
  reset();
  const result = await portal.login({
    body: { login: 'customer-one', password: 'iptv-one' },
    query: {},
    get: () => '',
    locals: {},
    get session() {
      return session;
    },
    flash() {
      return [];
    },
  });
  assert.equal(result.kind, 'redirect');
  assert.equal(session.cliente?.id, 1);
  const beforeMigrationRevision = createHash('sha256')
    .update(JSON.stringify(['customer-one', 'iptv-one', 'ABCDEFGHIJKLMNOP']))
    .digest('hex');
  assert.equal(
    session.cliente.revision,
    beforeMigrationRevision,
    'A proteção em repouso não muda a credencial nem a revisão do portal.',
  );
  console.log(
    'Compatibilidade comprovada: portal, mensagens e credenciais de pagamento/integração. Nenhum serviço externo foi chamado.',
  );
} finally {
  await db.end();
}

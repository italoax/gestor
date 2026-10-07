// Abstração de provedor de pagamento. Cada um implementa a mesma interface;
// o resto do código não precisa saber de qual provedor estamos falando.
// Adicionar provedor novo = criar arquivo em services/providers/<nome>.js e
// registrar em PROVIDERS.
export const PROVIDER_NOMES = {
  mercadopago: 'Mercado Pago',
  asaas: 'Asaas',
  openpix: 'OpenPix / Woovi',
  pagbank: 'PagBank / PagSeguro',
  pagarme: 'Pagar.me',
};
// Status normalizado entre os provedores. Sempre que rolar approved, é "approved".
// Sempre que rolar rejected/cancelled/expired, é "rejected". Demais ficam "pending".
export function normalizeStatus(raw) {
  const s = String(raw || '').toLowerCase();
  if (['approved', 'received', 'confirmed', 'completed', 'paid'].includes(s))
    return 'approved';
  if (
    [
      'rejected',
      'cancelled',
      'canceled',
      'refunded',
      'charged_back',
      'expired',
      'overdue',
      'failed',
    ].includes(s)
  )
    return 'rejected';
  return 'pending';
}
import { mercadoPagoProvider } from './providers/mercadopago.js';
import { asaasProvider } from './providers/asaas.js';
import { openPixProvider } from './providers/openpix.js';
import { pagBankProvider } from './providers/pagbank.js';
import { pagarMeProvider } from './providers/pagarme.js';
import { queryRows, queryOne, execute } from '../db/mysql.js';
// Registry. Adicionar provedor = importar e colocar aqui.
// `as PaymentProvider` no pagbank/pagarme porque o `name` está tipado como `never`
// (workaround pra cada arquivo não precisar conhecer a união completa).
const PROVIDERS = {
  mercadopago: mercadoPagoProvider,
  asaas: asaasProvider,
  openpix: openPixProvider,
  pagbank: { ...pagBankProvider, name: 'pagbank' },
  pagarme: { ...pagarMeProvider, name: 'pagarme' },
};
export function getProvider(name) {
  return PROVIDERS[name] ?? null;
}
export const PROVIDER_LISTA = [
  'mercadopago',
  'asaas',
  'openpix',
  'pagbank',
  'pagarme',
];
export async function carregarConfigsDoUsuario(userId) {
  const rows = await queryRows(
    `SELECT provider, credenciais, ativo FROM payment_provider_configs WHERE user_id = :userId`,
    { userId },
  );
  return rows.map((r) => {
    let creds = {};
    try {
      creds = JSON.parse(r.credenciais || '{}');
    } catch {
      /* JSON corrompido — trata como vazio */
    }
    return { provider: r.provider, credenciais: creds, ativo: !!r.ativo };
  });
}
export async function salvarConfig(userId, provider, credenciais, ativo) {
  await execute(
    `INSERT INTO payment_provider_configs (user_id, provider, credenciais, ativo)
     VALUES (:userId, :provider, :credenciais, :ativo)
     ON DUPLICATE KEY UPDATE credenciais = VALUES(credenciais), ativo = VALUES(ativo)`,
    {
      userId,
      provider,
      credenciais: JSON.stringify(credenciais),
      ativo: ativo ? 1 : 0,
    },
  );
}
// Resolve qual provedor usar pra um link de pagamento: 1) provider_padrao do user;
// 2) único provedor ativo; 3) null (nada configurado).
export async function escolherProvedor(userId) {
  const user = await queryOne(
    `SELECT provider_padrao AS providerPadrao FROM users WHERE id = :userId LIMIT 1`,
    { userId },
  );
  const configs = await carregarConfigsDoUsuario(userId);
  const ativos = configs.filter((c) => c.ativo);
  if (!ativos.length) return null;
  if (user?.providerPadrao) {
    const escolhido = ativos.find((c) => c.provider === user.providerPadrao);
    if (escolhido) return escolhido;
  }
  return ativos[0];
}
// Busca a config de um provedor específico (usado pelo webhook, que sabe qual é).
export async function configDoProvider(userId, provider) {
  const configs = await carregarConfigsDoUsuario(userId);
  return configs.find((c) => c.provider === provider) ?? null;
}

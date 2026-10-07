import { fetchWithTimeout } from '../http.js';
// Pagar.me v5 (Stone Co). API com Basic auth — secret key como username, senha vazia.
// Doc: https://docs.pagar.me/reference/criar-pedido
// Credenciais esperadas: { secret_key: string }
const PAGARME_BASE = 'https://api.pagar.me/core/v5';
function getKey(c) {
  const k = String(c.secret_key ?? '').trim();
  if (!k) throw new Error('Secret Key do Pagar.me não configurada.');
  return k;
}
async function authed(secretKey, url, init) {
  const basicAuth = Buffer.from(`${secretKey}:`).toString('base64');
  const r = await fetchWithTimeout(url, {
    ...init,
    headers: {
      Authorization: `Basic ${basicAuth}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(init.headers || {}),
    },
  });
  const text = await r.text();
  let j;
  try {
    j = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`Pagar.me: resposta inválida HTTP ${r.status}`);
  }
  if (!r.ok || j.errors?.length) {
    const msg = j.errors?.[0]?.message || j.message || `HTTP ${r.status}`;
    throw new Error(`Pagar.me: ${msg}`);
  }
  return j;
}
// Pagar.me devolve `qr_code_url` (link pro PNG) e `qr_code` (copia e cola).
// Front quer base64, então baixamos o PNG.
async function fetchPngAsBase64(url) {
  const r = await fetchWithTimeout(url);
  if (!r.ok) throw new Error(`Falha ao baixar QR PNG: HTTP ${r.status}`);
  return Buffer.from(await r.arrayBuffer()).toString('base64');
}
export const pagarMeProvider = {
  name: 'pagarme',
  async criarPix(credenciais, params) {
    const key = getKey(credenciais);
    const valueCents = Math.round(Number(params.valor) * 100);
    const body = {
      code: params.externalReference || `ref-${Date.now()}`,
      customer: {
        name: params.payerNome || 'Cliente',
        email: params.payerEmail || 'cliente@email.com',
        type: 'individual',
      },
      items: [
        {
          description: (params.descricao || 'Renovação').slice(0, 250),
          quantity: 1,
          amount: valueCents,
        },
      ],
      payments: [
        {
          payment_method: 'pix',
          pix: { expires_in: 1800 }, // 30min
        },
      ],
    };
    const order = await authed(key, `${PAGARME_BASE}/orders`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
    const charge = order.charges?.[0];
    const lt = charge?.last_transaction;
    if (!lt?.qr_code || !lt?.qr_code_url) {
      throw new Error(
        'Pagar.me não devolveu QR PIX — confira se PIX está habilitado na conta.',
      );
    }
    const qrBase64 = await fetchPngAsBase64(lt.qr_code_url);
    return {
      id: charge?.id ?? order.id ?? '',
      status: String(charge?.status ?? 'pending'),
      qrText: lt.qr_code,
      qrBase64,
      expiresAt: lt.expires_at ?? null,
    };
  },
  async consultarPagamento(credenciais, paymentId) {
    const key = getKey(credenciais);
    // Pagar.me: paymentId é o charge_id (ch_xxx). GET /charges/:id devolve o status.
    const r = await fetchWithTimeout(
      `${PAGARME_BASE}/charges/${encodeURIComponent(paymentId)}`,
      {
        headers: {
          Authorization: `Basic ${Buffer.from(`${key}:`).toString('base64')}`,
          Accept: 'application/json',
        },
      },
    );
    const j = await r.json();
    if (!r.ok) throw new Error(`Pagar.me: ${j.message || `HTTP ${r.status}`}`);
    return {
      id: paymentId,
      status: String(j.status ?? 'unknown').toLowerCase(),
      amount: Number(j.amount ?? 0) / 100,
      pagoEm: j.paid_at ?? null,
    };
  },
};

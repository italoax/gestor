import { fetchWithTimeout } from '../http.js';
import crypto from 'node:crypto';
// Integracao com a Orders API do Mercado Pago.
// Endpoints: POST /v1/orders (criar) e GET /v1/orders/{id} (consultar).
// Credenciais esperadas: { access_token: string }
const MP_BASE = 'https://api.mercadopago.com';
function getToken(c) {
  const t = String(c.access_token ?? '').trim();
  if (!t) throw new Error('Access Token do Mercado Pago nao configurado.');
  return t;
}
// Extrai o primeiro payment com QR PIX preenchido da resposta da Order.
function pixDaOrder(order) {
  const lista = order?.transactions?.payments ?? [];
  for (const p of lista) {
    if (p?.payment_method?.qr_code && p?.payment_method?.qr_code_base64)
      return p;
  }
  return lista[0] ?? null;
}
export const mercadoPagoProvider = {
  name: 'mercadopago',
  async criarPix(credenciais, params) {
    const token = getToken(credenciais);
    // PIX com 30 dias de validade — cobre ciclo de cobranca mensal.
    const expira = new Date(Date.now() + 30 * 24 * 60 * 60000)
      .toISOString()
      .replace('Z', '-03:00');
    const valor = Number(params.valor.toFixed(2)).toFixed(2);
    const body = {
      type: 'online',
      processing_mode: 'automatic',
      total_amount: valor,
      description: (params.descricao || 'Pagamento').slice(0, 250),
      external_reference: params.externalReference,
      payer: {
        email: params.payerEmail || 'cliente@email.com',
        first_name: params.payerNome || 'Cliente',
      },
      transactions: {
        payments: [
          {
            amount: valor,
            payment_method: { id: 'pix', type: 'bank_transfer' },
            expiration_date: expira,
          },
        ],
      },
    };
    if (params.notificationUrl) body.notification_url = params.notificationUrl;
    const r = await fetchWithTimeout(`${MP_BASE}/v1/orders`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-Idempotency-Key': crypto.randomUUID(),
      },
      body: JSON.stringify(body),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(`MP: ${j.message || `HTTP ${r.status}`}`);
    const payment = pixDaOrder(j);
    const pm = payment?.payment_method;
    if (!pm?.qr_code || !pm?.qr_code_base64) {
      throw new Error(
        'Resposta da Order sem QR PIX. Confira se sua conta tem PIX habilitado.',
      );
    }
    return {
      id: String(j.id ?? ''),
      status: String(payment?.status ?? j.status ?? 'pending'),
      qrText: pm.qr_code,
      qrBase64: pm.qr_code_base64,
      expiresAt: j.date_of_expiration ?? null,
    };
  },
  async consultarPagamento(credenciais, orderId) {
    const token = getToken(credenciais);
    const r = await fetchWithTimeout(
      `${MP_BASE}/v1/orders/${encodeURIComponent(orderId)}`,
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    );
    const j = await r.json();
    if (!r.ok) throw new Error(`MP: ${j.message || `HTTP ${r.status}`}`);
    const payment = pixDaOrder(j);
    // Prefere o status do payment quando disponivel — mais granular que o da
    // order (que so distingue created/processed/expired).
    return {
      id: String(j.id ?? orderId),
      status: String(payment?.status ?? j.status ?? 'unknown'),
      amount: Number(payment?.amount ?? j.total_amount ?? 0),
      pagoEm: payment?.date_approved ?? null,
    };
  },
};

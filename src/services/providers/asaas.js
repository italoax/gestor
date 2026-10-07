import { fetchWithTimeout } from '../http.js';
// Integração Asaas: cria Customer + Payment(BILLING_TYPE=PIX) + busca QR.
// Doc: https://docs.asaas.com/
// Credenciais esperadas:
//   { access_token: string, ambiente?: "producao" | "sandbox" }
function baseUrl(ambiente) {
  return ambiente === 'sandbox'
    ? 'https://sandbox.asaas.com/api/v3'
    : 'https://api.asaas.com/v3';
}
function getCfg(c) {
  const token = String(c.access_token ?? '').trim();
  if (!token) throw new Error('Access Token do Asaas não configurado.');
  const ambiente = String(c.ambiente ?? 'producao').toLowerCase();
  return { token, base: baseUrl(ambiente) };
}
async function authedJson(token, url, init) {
  const r = await fetchWithTimeout(url, {
    ...init,
    headers: {
      access_token: token,
      'Content-Type': 'application/json',
      'User-Agent': 'gestor-iptv/1.0',
      ...(init.headers || {}),
    },
  });
  const j = await r.json();
  if (!r.ok || j.errors?.length) {
    const msg = j.errors?.[0]?.description || `HTTP ${r.status}`;
    throw new Error(`Asaas: ${msg}`);
  }
  return j;
}
// Cria/reusa um customer pra esse externalReference. Asaas só identifica
// pagador por customer — sem isso, vira "cliente avulso" e fica difícil filtrar.
async function ensureCustomer(token, base, params) {
  // Tenta achar customer existente pelo externalReference. Asaas suporta o filtro.
  const extRef = params.externalReference || '';
  if (extRef) {
    const found = await authedJson(
      token,
      `${base}/customers?externalReference=${encodeURIComponent(extRef)}`,
      { method: 'GET' },
    );
    const id = found.data?.[0]?.id;
    if (id) return id;
  }
  const created = await authedJson(token, `${base}/customers`, {
    method: 'POST',
    body: JSON.stringify({
      name: params.payerNome || 'Cliente',
      email: params.payerEmail,
      externalReference: extRef || undefined,
      notificationDisabled: true, // Não queremos que o Asaas mande email pro cliente final.
    }),
  });
  if (!created.id) throw new Error('Asaas não devolveu customer ID.');
  return created.id;
}
export const asaasProvider = {
  name: 'asaas',
  async criarPix(credenciais, params) {
    const { token, base } = getCfg(credenciais);
    const customerId = await ensureCustomer(token, base, params);
    // Vencimento do PIX: 1 dia. Asaas exige dueDate em "YYYY-MM-DD".
    const venc = new Date(Date.now() + 24 * 60 * 60000);
    const dueDate = venc.toISOString().slice(0, 10);
    const payment = await authedJson(token, `${base}/payments`, {
      method: 'POST',
      body: JSON.stringify({
        customer: customerId,
        billingType: 'PIX',
        value: Number(params.valor.toFixed(2)),
        dueDate,
        description: params.descricao || 'Renovação de plano',
        externalReference: params.externalReference,
      }),
    });
    if (!payment.id) throw new Error('Asaas não devolveu payment ID.');
    const qr = await authedJson(
      token,
      `${base}/payments/${payment.id}/pixQrCode`,
      {
        method: 'GET',
      },
    );
    if (!qr.payload || !qr.encodedImage) {
      throw new Error(
        'Asaas não devolveu o QR PIX (verifique se a chave PIX está cadastrada na conta).',
      );
    }
    return {
      id: payment.id,
      status: String(payment.status ?? 'PENDING'),
      qrText: qr.payload,
      qrBase64: qr.encodedImage,
      expiresAt: qr.expirationDate ?? null,
    };
  },
  async consultarPagamento(credenciais, paymentId) {
    const { token, base } = getCfg(credenciais);
    const j = await authedJson(
      token,
      `${base}/payments/${encodeURIComponent(paymentId)}`,
      {
        method: 'GET',
      },
    );
    return {
      id: String(j.id ?? paymentId),
      status: String(j.status ?? 'unknown').toLowerCase(),
      amount: Number(j.value ?? 0),
      pagoEm: j.paymentDate || j.confirmedDate || j.clientPaymentDate || null,
    };
  },
};

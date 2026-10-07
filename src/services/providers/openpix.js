import { fetchWithTimeout } from '../http.js';
import crypto from 'node:crypto';
// Integração OpenPix / Woovi. PIX-only, simples.
// Doc: https://developers.openpix.com.br/
// Credenciais esperadas: { app_id: string }
const OPENPIX_BASE = 'https://api.openpix.com.br';
function getToken(c) {
  const t = String(c.app_id ?? c.access_token ?? '').trim();
  if (!t) throw new Error('AppID do OpenPix não configurado.');
  return t;
}
async function authed(token, url, init) {
  const r = await fetchWithTimeout(url, {
    ...init,
    headers: {
      Authorization: token,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });
  const j = await r.json();
  if (!r.ok || j.error)
    throw new Error(`OpenPix: ${j.error || `HTTP ${r.status}`}`);
  return j;
}
// Converte URL do QR PNG pra base64. O front espera base64 pra exibir
// como data:image/png;base64,..., uniformizando com os outros provedores.
async function fetchAsBase64(url) {
  const r = await fetchWithTimeout(url);
  if (!r.ok) throw new Error(`Falha ao baixar QR PNG: HTTP ${r.status}`);
  const buf = Buffer.from(await r.arrayBuffer());
  return buf.toString('base64');
}
export const openPixProvider = {
  name: 'openpix',
  async criarPix(credenciais, params) {
    const token = getToken(credenciais);
    // correlationID é o nosso ID — OpenPix permite consultar por ele depois.
    const correlationID = params.externalReference || crypto.randomUUID();
    // value em CENTAVOS (não em reais).
    const value = Math.round(Number(params.valor) * 100);
    const body = {
      correlationID,
      value,
      comment: params.descricao || 'Renovação de plano',
      customer: params.payerNome
        ? { name: params.payerNome, email: params.payerEmail }
        : undefined,
    };
    const j = await authed(token, `${OPENPIX_BASE}/api/v1/charge`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
    const c = j.charge;
    if (!c?.brCode || !c?.qrCodeImage)
      throw new Error('OpenPix não devolveu QR.');
    const qrBase64 = await fetchAsBase64(c.qrCodeImage);
    return {
      id: correlationID, // usamos nosso correlationID como id do pagamento
      status: String(c.status ?? 'ACTIVE'),
      qrText: c.brCode,
      qrBase64,
      expiresAt: c.expiresDate ?? null,
    };
  },
  async consultarPagamento(credenciais, paymentId) {
    const token = getToken(credenciais);
    const j = await authed(
      token,
      `${OPENPIX_BASE}/api/v1/charge/${encodeURIComponent(paymentId)}`,
      {
        method: 'GET',
      },
    );
    const c = j.charge;
    return {
      id: paymentId,
      status: String(c?.status ?? 'unknown').toLowerCase(),
      amount: Number(c?.value ?? 0) / 100, // centavos → reais
      pagoEm: c?.paidAt ?? null,
    };
  },
};

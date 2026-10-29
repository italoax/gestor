import { cents, required, providerJson, qrImage } from './pixSupport.ts';
import { fetchWithTimeout } from '../http.ts';

export function createPushinPayProvider(fetchImpl = fetchWithTimeout) {
  const call = (credentials, path, init: RequestInit = {}) =>
    providerJson(
      `${credentials.ambiente === 'sandbox' ? 'https://api-sandbox.pushinpay.com.br' : 'https://api.pushinpay.com.br'}/api${path}`,
      {
        ...init,
        headers: {
          Authorization: `Bearer ${required(credentials, 'access_token')}`,
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
      },
      fetchImpl,
    );
  return {
    name: 'pushinpay',
    verifiedApi: true,
    async criarPix(credentials, params) {
      const result = await call(credentials, '/pix/cashIn', {
        method: 'POST',
        body: JSON.stringify({
          value: cents(params.valor, 50),
          description: params.externalReference,
          webhook_url: params.notificationUrl,
        }),
      });
      if (!result.id || !result.qr_code)
        throw new Error('PushinPay não retornou o PIX.');
      return {
        id: String(result.id).toLowerCase(),
        status: result.status,
        qrText: result.qr_code,
        qrBase64: await qrImage(result.qr_code),
        expiresAt: result.expires_at ?? null,
      };
    },
    async consultarPagamento(credentials, id) {
      const result = await call(
        credentials,
        `/transactions/${encodeURIComponent(id)}`,
      );
      return {
        id: String(result.id ?? '').toLowerCase(),
        currency: 'BRL',
        amount: Number(result.value) / 100,
        externalReference: result.description,
        status: result.status,
        pagoEm: result.status === 'paid' ? result.updated_at : null,
      };
    },
  };
}
export const pushinPayProvider = createPushinPayProvider();

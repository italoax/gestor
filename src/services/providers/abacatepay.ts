import { cents, required, providerJson, qrImage } from './pixSupport.ts';
import { fetchWithTimeout } from '../http.ts';

export function createAbacatePayProvider(fetchImpl = fetchWithTimeout) {
  const call = (credentials, path, init: RequestInit = {}) =>
    providerJson(
      `https://api.abacatepay.com/v2${path}`,
      {
        ...init,
        headers: {
          Authorization: `Bearer ${required(credentials, 'api_key')}`,
          'Content-Type': 'application/json',
        },
      },
      fetchImpl,
    );
  return {
    name: 'abacatepay',
    verifiedApi: true,
    async criarPix(credentials, params) {
      const { data } = await call(credentials, '/transparents/create', {
        method: 'POST',
        body: JSON.stringify({
          method: 'PIX',
          data: {
            amount: cents(params.valor, 100),
            description: params.descricao,
            expiresIn: 3600,
            metadata: { gestorReference: params.externalReference },
          },
        }),
      });
      if (!data?.id || !data.brCode)
        throw new Error('AbacatePay não retornou o PIX.');
      return {
        id: String(data.id),
        status: data.status,
        qrText: data.brCode,
        qrBase64: await qrImage(data.brCode),
        expiresAt: data.expiresAt,
      };
    },
    async consultarPagamento(credentials, id) {
      const { data } = await call(
        credentials,
        `/transparents/get?id=${encodeURIComponent(id)}`,
      );
      return {
        id: String(data?.id ?? ''),
        currency: 'BRL',
        amount: Number(data?.amount) / 100,
        externalReference: data?.metadata?.gestorReference,
        status: data?.status,
        pagoEm: data?.status === 'PAID' ? data.updatedAt : null,
      };
    },
  };
}
export const abacatePayProvider = createAbacatePayProvider();

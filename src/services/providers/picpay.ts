import {
  required,
  providerJson,
  cents,
  qrImage,
  oauthToken,
  referenceDigest,
} from './pixSupport.ts';
import { fetchWithTimeout } from '../http.ts';

function base(credentials) {
  const url = new URL(required(credentials, 'api_base'));
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.port ||
    !['ecommerce-api.svcp.picpay.com', 'ecommerce-api.svcp.ppay.me'].includes(
      url.hostname,
    )
  )
    throw new Error(
      'Informe a URL oficial da API PicPay fornecida no credenciamento.',
    );
  return url.origin + url.pathname.replace(/\/$/, '');
}
export function createPicPayProvider(fetchImpl = fetchWithTimeout) {
  async function call(credentials, path, init: RequestInit = {}) {
    const url = base(credentials);
    const token = await oauthToken(credentials, 'picpay', () =>
      providerJson(
        new URL('/oauth2/token', url).href,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            grant_type: 'client_credentials',
            client_id: required(credentials, 'client_id'),
            client_secret: required(credentials, 'client_secret'),
          }),
        },
        fetchImpl,
      ),
    );
    return providerJson(
      url + path,
      {
        ...init,
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      },
      fetchImpl,
    );
  }
  return {
    name: 'picpay',
    verifiedApi: true,
    payerDetails: true,
    async criarPix(credentials, params) {
      const merchantChargeId = referenceDigest(params.externalReference).slice(
        0,
        32,
      );
      const result = await call(credentials, '/charge/pix', {
        method: 'POST',
        body: JSON.stringify({
          paymentSource: 'GATEWAY',
          merchantChargeId,
          customer: {
            name: params.payerNome,
            email: params.payerEmail,
            document: params.payerDocument,
            documentType: params.payerDocument.length === 11 ? 'CPF' : 'CNPJ',
          },
          transactions: [
            { amount: cents(params.valor), pix: { expiration: 3600 } },
          ],
        }),
      });
      const transaction = result.transactions?.find(
        (item) => item.paymentType === 'PIX',
      );
      const qrText = transaction?.pix?.qrCode;
      if (result.merchantChargeId !== merchantChargeId || !qrText)
        throw new Error('PicPay não retornou a cobrança PIX esperada.');
      return {
        id: merchantChargeId,
        status: result.chargeStatus,
        qrText,
        qrBase64: await qrImage(qrText),
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
      };
    },
    async consultarPagamento(credentials, id) {
      const result = await call(
        credentials,
        `/charge/${encodeURIComponent(id)}`,
      );
      return {
        id: String(result.merchantChargeId ?? ''),
        currency: 'BRL',
        amount: Number(result.originalAmount ?? result.amount) / 100,
        referenceDigest: String(result.merchantChargeId ?? ''),
        status:
          Number(result.refundedAmount) > 0 ? 'refunded' : result.chargeStatus,
        pagoEm:
          result.transactions?.find((item) => item.paymentType === 'PIX')
            ?.updatedAt ?? null,
      };
    },
  };
}
export const picPayProvider = createPicPayProvider();

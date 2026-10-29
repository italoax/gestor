import { required, providerJson, cents } from './pixSupport.ts';
import { fetchWithTimeout } from '../http.ts';

export function createStripeProvider(fetchImpl = fetchWithTimeout) {
  const call = (credentials, path, init: RequestInit = {}) =>
    providerJson(
      `https://api.stripe.com/v1${path}`,
      {
        ...init,
        headers: {
          Authorization: `Bearer ${required(credentials, 'secret_key')}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      },
      fetchImpl,
    );
  return {
    name: 'stripe',
    verifiedApi: true,
    checkout: true,
    async criarPix(credentials, params) {
      const result = await call(credentials, '/checkout/sessions', {
        method: 'POST',
        body: new URLSearchParams({
          mode: 'payment',
          'payment_method_types[0]': 'pix',
          'line_items[0][price_data][currency]': 'brl',
          'line_items[0][price_data][unit_amount]': String(cents(params.valor)),
          'line_items[0][price_data][product_data][name]': String(
            params.descricao || 'Renovação',
          ).slice(0, 250),
          'line_items[0][quantity]': '1',
          'metadata[gestorReference]': params.externalReference,
          'payment_intent_data[metadata][gestorReference]':
            params.externalReference,
          success_url: params.returnUrl,
          cancel_url: params.returnUrl,
        }).toString(),
      });
      const url = new URL(result.url || 'https://invalid.local');
      if (
        !result.id ||
        url.protocol !== 'https:' ||
        url.hostname !== 'checkout.stripe.com'
      )
        throw new Error('Stripe não retornou um checkout válido.');
      return {
        id: String(result.id),
        status: 'pending',
        checkoutUrl: url.href,
        qrText: '',
        qrBase64: '',
        expiresAt: new Date(Number(result.expires_at) * 1000).toISOString(),
      };
    },
    async consultarPagamento(credentials, id) {
      const result = await call(
        credentials,
        `/checkout/sessions/${encodeURIComponent(id)}?expand[0]=payment_intent`,
      );
      return {
        id: String(result.id ?? ''),
        currency: String(result.currency || '').toUpperCase(),
        amount: Number(result.amount_total) / 100,
        externalReference: result.metadata?.gestorReference,
        status:
          result.payment_status === 'paid'
            ? 'approved'
            : result.status === 'expired' ||
                result.payment_intent?.status === 'canceled' ||
                (result.payment_intent?.status === 'requires_payment_method' &&
                  result.payment_intent?.last_payment_error)
              ? 'expired'
              : 'pending',
        pagoEm: null,
      };
    },
  };
}
export const stripeProvider = createStripeProvider();

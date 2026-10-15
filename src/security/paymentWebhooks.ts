import {
  createHmac,
  createHash,
  timingSafeEqual,
  verify,
  createPublicKey,
} from 'node:crypto';
import { readFileSync } from 'node:fs';

export interface WebhookRequest {
  headers?: Record<string, string | string[] | undefined>;
  query?: Record<string, unknown>;
  rawBody?: Buffer;
}
export interface WebhookSecurity {
  mode:
    'hmac-sha256' | 'token' | 'rsa-sha256' | 'legacy-sha256' | 'ecdsa-sha256';
  secret?: string;
  publicKey?: string;
  timestampToleranceMs?: number;
}
export function webhookSecurityFor(
  owner: number,
  provider: string,
): WebhookSecurity | undefined {
  const file = process.env.WEBHOOK_SECURITY_FILE;
  if (!file) return undefined;
  // Nenhum segredo é persistido em credenciais existentes ou enviado ao frontend.
  return JSON.parse(readFileSync(file, 'utf8'))?.[String(owner)]?.[provider];
}
function equal(a: string, b: string) {
  const x = Buffer.from(a),
    y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
function header(request: WebhookRequest, name: string) {
  const value = request.headers?.[name];
  return typeof value === 'string' && value.length <= 8192 ? value : '';
}
export function authenticateWebhook(
  provider: string,
  body,
  request: WebhookRequest,
  config: WebhookSecurity,
  now = Date.now(),
) {
  try {
    if (!config) return false;
    if (
      provider === 'mercadopago' &&
      config.mode === 'hmac-sha256' &&
      config.secret
    ) {
      const signature = header(request, 'x-signature');
      const parts = signature.split(',').map((part) => part.trim().split('='));
      if (parts.length !== 2 || new Set(parts.map(([key]) => key)).size !== 2)
        return false;
      const values = Object.fromEntries(parts),
        ts = values.ts,
        digest = values.v1;
      const requestId = header(request, 'x-request-id');
      const id = request.query?.['data.id'];
      if (
        typeof id !== 'string' ||
        !/^[a-zA-Z0-9_-]{1,200}$/.test(id) ||
        String(body?.data?.id) !== id ||
        !/^[a-zA-Z0-9_-]{1,200}$/.test(requestId)
      )
        return false;
      if (
        !/^\d{10,13}$/.test(ts || '') ||
        !/^[a-f0-9]{64}$/i.test(digest || '')
      )
        return false;
      const time = Number(ts) * (ts.length <= 10 ? 1000 : 1);
      // O contrato não garante nova assinatura em toda retentativa. A janela é
      // opcional; duplicatas são inofensivas pelo controle transacional persistido.
      if (
        config.timestampToleranceMs !== undefined &&
        (!Number.isSafeInteger(config.timestampToleranceMs) ||
          config.timestampToleranceMs <= 0 ||
          Math.abs(now - time) > config.timestampToleranceMs)
      )
        return false;
      const expected = createHmac('sha256', config.secret)
        .update(`id:${id.toLowerCase()};request-id:${requestId};ts:${ts};`)
        .digest('hex');
      return equal(expected, digest.toLowerCase());
    }
    if (provider === 'asaas' && config.mode === 'token' && config.secret)
      return equal(config.secret, header(request, 'asaas-access-token'));
    const raw = request.rawBody;
    if (!Buffer.isBuffer(raw)) return false;
    if (
      provider === 'pagbank' &&
      config.mode === 'legacy-sha256' &&
      config.secret
    ) {
      const digest = header(request, 'x-authenticity-token');
      return (
        /^[a-f0-9]{64}$/i.test(digest) &&
        equal(
          createHash('sha256')
            .update(config.secret + '-')
            .update(raw)
            .digest('hex'),
          digest.toLowerCase(),
        )
      );
    }
    if (
      (provider === 'openpix' && config.mode === 'rsa-sha256') ||
      (provider === 'pagbank' && config.mode === 'ecdsa-sha256')
    ) {
      const key = createPublicKey(config.publicKey);
      if (key.asymmetricKeyType !== (provider === 'openpix' ? 'rsa' : 'ec'))
        return false;
      const signature = header(
        request,
        provider === 'openpix' ? 'x-webhook-signature' : 'x-payload-signature',
      );
      return signature
        .split(',')
        .some(
          (value) =>
            /^[a-zA-Z0-9+/]+={0,2}$/.test(value.trim()) &&
            verify('sha256', raw, key, Buffer.from(value.trim(), 'base64')),
        );
    }
    // Pagar.me v5: contrato de autenticação não confirmado; nenhum fallback inventado.
    return false;
  } catch {
    return false;
  }
}

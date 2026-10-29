import QRCode from 'qrcode';
import { createHash } from 'node:crypto';
import { fetchWithTimeout } from '../http.ts';

export function cents(value: unknown, minimum = 1) {
  const amount = Math.round(Number(value) * 100);
  if (!Number.isSafeInteger(amount) || amount < minimum)
    throw new Error('Valor inválido para este provedor.');
  return amount;
}
export function required(credentials, name: string) {
  const value = String(credentials[name] ?? '').trim();
  if (!value) throw new Error('Credenciais do provedor incompletas.');
  return value;
}
export async function qrImage(text: string) {
  if (!text || text.length > 10000)
    throw new Error('O provedor não retornou um código PIX válido.');
  return (await QRCode.toDataURL(text, { margin: 1, width: 320 })).split(
    ',',
  )[1];
}
export async function providerJson(
  url: string,
  init: RequestInit = {},
  fetchImpl = fetchWithTimeout,
) {
  const response = await fetchImpl(url, { ...init, redirect: 'error' });
  const json = await response.json().catch(() => null);
  if (!response.ok || !json || json.error || json.success === false)
    throw new Error(
      `Não foi possível consultar o provedor (HTTP ${response.status}).`,
    );
  return json;
}
export const referenceDigest = (value: string) =>
  createHash('sha256').update(value).digest('hex');

// OAuth tokens are private, bounded and shared by concurrent calls for the same credential.
const tokens = new Map<string, { expires: number; promise: Promise<string> }>();
export function oauthToken(
  credentials,
  scope: string,
  load: () => Promise<any>,
) {
  const key = referenceDigest(JSON.stringify([credentials, scope]));
  const cached = tokens.get(key);
  if (cached && cached.expires > Date.now()) return cached.promise;
  if (tokens.size >= 128) tokens.delete(tokens.keys().next().value!);
  const entry = {
    expires: Date.now() + 60000,
    promise: undefined as unknown as Promise<string>,
  };
  entry.promise = load().then((result) => {
    if (!result.access_token)
      throw new Error('O provedor não retornou a autorização.');
    entry.expires =
      Date.now() +
      Math.max(
        1000,
        Math.min(3600000, (Number(result.expires_in) || 120) * 1000 - 60000),
      );
    return String(result.access_token);
  });
  tokens.set(key, entry);
  return entry.promise;
}

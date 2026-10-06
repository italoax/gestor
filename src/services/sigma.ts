// Cliente da API do painel Sigma (ex.: dashgen.net), montado a partir das
// chamadas reais que o painel faz:
//   - Login:   POST {origin}/api/auth/login          -> { token }  (Bearer Sanctum)
//   - Renovar: POST {origin}/api/customers/{id}/renew  body: { package_id, connections, ... }
//
// ⚠️ CLOUDFLARE: o painel fica atrás do Cloudflare com desafio de bot. Chamadas
// servidor-a-servidor (do gestor na Hostinger) podem tomar 403 com a página
// "Just a moment...". Nesse caso NÃO tem como passar sem o provedor liberar
// (whitelist) o IP do servidor. Detectamos esse caso e devolvemos erro claro,
// em vez de um "falhou" genérico — pra você saber que é o Cloudflare, não a senha.

import { publicHttpsText } from "./publicNetwork.js";

export interface SigmaCreds {
  apiUrl: string;   // URL do painel (ex.: https://dashgen.net ou https://dashgen.net/#/customers)
  username: string;
  password: string; // texto puro (decripte com decryptSecret ANTES de chamar)
}

export interface SigmaResult<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
  cloudflareBlocked?: boolean;
}

interface FetchInit {
  method: string;
  headers?: Record<string, string>;
  body?: string;
}

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36";

// Normaliza a URL do painel pra base da API.
// https://dashgen.net/#/customers -> https://dashgen.net/api
export function sigmaApiBase(apiUrl: string): string {
  try {
    const u = new URL(apiUrl);
    return `${u.protocol}//${u.host}/api`;
  } catch {
    return String(apiUrl).replace(/\/#.*$/, "").replace(/\/+$/, "") + "/api";
  }
}

function isCloudflareChallenge(contentType: string, body: string): boolean {
  const ct = contentType.toLowerCase();
  if (!ct.includes("text/html")) return false;
  return (
    body.includes("Just a moment") ||
    body.includes("challenges.cloudflare.com") ||
    body.includes("cf-browser-verification") ||
    body.includes("cf_chl_")
  );
}

async function sigmaFetch(url: string, init: FetchInit): Promise<{ status: number; contentType: string; text: string }> {
  return publicHttpsText(url, {
    method: init.method,
    headers: { Accept: "application/json", "User-Agent": BROWSER_UA, ...(init.headers ?? {}) },
    body: init.body,
  });
}

// Faz login e retorna o token Bearer.
export async function sigmaLogin(creds: SigmaCreds): Promise<SigmaResult<string>> {
  const url = `${sigmaApiBase(creds.apiUrl)}/auth/login`;
  try {
    // ASSUNÇÃO (a confirmar no 1º teste real): login por email+password (padrão
    // Laravel). Se o painel usar "username", trocar a chave aqui.
    const body = JSON.stringify({ email: creds.username, password: creds.password });
    const { status, contentType, text } = await sigmaFetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });
    if (isCloudflareChallenge(contentType, text)) {
      return { ok: false, cloudflareBlocked: true, error: "Bloqueado pelo Cloudflare do painel — peça ao provedor para liberar (whitelist) o IP do seu servidor." };
    }
    if (status < 200 || status >= 300) {
      return { ok: false, error: `Login no painel falhou (HTTP ${status}).` };
    }
    let json: Record<string, unknown> = {};
    try { json = JSON.parse(text) as Record<string, unknown>; } catch { return { ok: false, error: "Resposta do login não é JSON." }; }
    const data = (json.data ?? {}) as Record<string, unknown>;
    const token = (json.token ?? json.access_token ?? data.token ?? data.access_token ?? data.accessToken) as string | undefined;
    if (!token) return { ok: false, error: "Login OK, mas não encontrei o token na resposta." };
    return { ok: true, data: String(token) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// Renova um cliente no painel. `customerId` e `packageId` são os IDs DO SIGMA
// (ex.: 8K1xPrQJ1v e bQELo0Dgro), não os do gestor.
export async function sigmaRenew(params: {
  apiUrl: string;
  token: string;
  customerId: string;
  packageId: string;
  connections?: number;
}): Promise<SigmaResult> {
  const url = `${sigmaApiBase(params.apiUrl)}/customers/${encodeURIComponent(params.customerId)}/renew`;
  try {
    const body = JSON.stringify({
      package_id: params.packageId,
      connections: params.connections ?? 1,
      reference: "",
      create_manual_customer_order: false,
      manual_payment_total: null,
    });
    const { status, contentType, text } = await sigmaFetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${params.token}` },
      body,
    });
    if (isCloudflareChallenge(contentType, text)) {
      return { ok: false, cloudflareBlocked: true, error: "Bloqueado pelo Cloudflare do painel (whitelist do IP do servidor necessário)." };
    }
    if (status < 200 || status >= 300) {
      return { ok: false, error: `Renovação no painel falhou (HTTP ${status}). ${text.slice(0, 200)}` };
    }
    let json: unknown = null;
    try { json = JSON.parse(text); } catch { /* pode não retornar corpo JSON */ }
    return { ok: true, data: json };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// Conveniência: loga e renova em sequência. Use com a senha JÁ decriptada.
export async function sigmaLoginAndRenew(
  creds: SigmaCreds,
  customerId: string,
  packageId: string,
  connections = 1,
): Promise<SigmaResult> {
  const login = await sigmaLogin(creds);
  if (!login.ok || !login.data) return { ok: false, error: login.error, cloudflareBlocked: login.cloudflareBlocked };
  return sigmaRenew({ apiUrl: creds.apiUrl, token: login.data, customerId, packageId, connections });
}

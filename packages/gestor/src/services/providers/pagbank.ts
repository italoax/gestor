import type { PaymentProvider, PixParams, PixResult, StatusResult } from "../paymentProvider.js";

// PagBank / PagSeguro Connect — API REST, auth via Bearer token.
// Doc: https://developer.pagbank.com.br/reference/criar-pedido
// Credenciais esperadas: { access_token: string, ambiente?: "producao" | "sandbox" }

function baseUrl(ambiente: string) {
  return ambiente === "sandbox"
    ? "https://sandbox.api.pagseguro.com"
    : "https://api.pagseguro.com";
}

function getCfg(c: Record<string, unknown>): { token: string; base: string } {
  const token = String(c.access_token ?? "").trim();
  if (!token) throw new Error("Access Token do PagBank não configurado.");
  const ambiente = String(c.ambiente ?? "producao").toLowerCase();
  return { token, base: baseUrl(ambiente) };
}

interface PagBankQrCode {
  id?: string;
  text?: string;
  links?: Array<{ rel: string; href: string; media: string; type: string }>;
  expiration_date?: string;
}

interface PagBankCharge {
  id?: string;
  status?: string; // AUTHORIZED, PAID, IN_ANALYSIS, DECLINED, CANCELED, REFUNDED, etc
  paid_at?: string;
  amount?: { value: number };
}

interface PagBankOrder {
  id?: string;
  qr_codes?: PagBankQrCode[];
  charges?: PagBankCharge[];
  error_messages?: Array<{ description: string }>;
}

async function authed<T>(token: string, url: string, init: RequestInit): Promise<T> {
  const r = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(init.headers || {}),
    },
  });
  const text = await r.text();
  let j: T & { error_messages?: Array<{ description: string }> };
  try { j = text ? JSON.parse(text) : ({} as never); } catch { throw new Error(`PagBank: resposta inválida HTTP ${r.status}`); }
  if (!r.ok || j.error_messages?.length) {
    const msg = j.error_messages?.[0]?.description || `HTTP ${r.status}`;
    throw new Error(`PagBank: ${msg}`);
  }
  return j;
}

// Baixa o PNG do QR (PagBank devolve um link) e converte pra base64 pra
// alinhar com os outros provedores (front espera base64 inline).
async function fetchPngAsBase64(url: string): Promise<string> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Falha ao baixar QR PNG: HTTP ${r.status}`);
  return Buffer.from(await r.arrayBuffer()).toString("base64");
}

export const pagBankProvider: PaymentProvider = {
  name: "pagbank" as never, // tipado abaixo na lista

  async criarPix(credenciais, params: PixParams): Promise<PixResult> {
    const { token, base } = getCfg(credenciais);
    // PagBank usa centavos no value.
    const valueCents = Math.round(Number(params.valor) * 100);
    // Expiração do QR: 30min.
    const expira = new Date(Date.now() + 30 * 60_000).toISOString();

    const body = {
      reference_id: params.externalReference || `ref-${Date.now()}`,
      customer: {
        name: params.payerNome || "Cliente",
        email: params.payerEmail || "cliente@email.com",
      },
      items: [{
        name: (params.descricao || "Renovação").slice(0, 100),
        quantity: 1,
        unit_amount: valueCents,
      }],
      qr_codes: [{
        amount: { value: valueCents },
        expiration_date: expira,
      }],
      notification_urls: params.notificationUrl ? [params.notificationUrl] : undefined,
    };

    const order = await authed<PagBankOrder>(token, `${base}/orders`, {
      method: "POST", body: JSON.stringify(body),
    });
    const qr = order.qr_codes?.[0];
    if (!qr?.text || !qr?.id) throw new Error("PagBank não devolveu QR PIX.");
    const pngLink = qr.links?.find((l) => l.rel === "QRCODE.PNG")?.href;
    if (!pngLink) throw new Error("PagBank não devolveu link do QR PNG.");
    const qrBase64 = await fetchPngAsBase64(pngLink);
    return {
      id: order.id ?? qr.id,
      status: String(order.charges?.[0]?.status ?? "WAITING"),
      qrText: qr.text,
      qrBase64,
      expiresAt: qr.expiration_date ?? null,
    };
  },

  async consultarPagamento(credenciais, paymentId): Promise<StatusResult> {
    const { token, base } = getCfg(credenciais);
    const order = await authed<PagBankOrder>(token, `${base}/orders/${encodeURIComponent(paymentId)}`, {
      method: "GET",
    });
    const charge = order.charges?.[0];
    return {
      id: paymentId,
      status: String(charge?.status ?? "unknown").toLowerCase(),
      amount: Number(charge?.amount?.value ?? 0) / 100,
      pagoEm: charge?.paid_at ?? null,
    };
  },
};

import type { PaymentProvider, PixParams, PixResult, StatusResult } from "../paymentProvider.js";

// Integração Asaas: cria Customer + Payment(BILLING_TYPE=PIX) + busca QR.
// Doc: https://docs.asaas.com/
// Credenciais esperadas:
//   { access_token: string, ambiente?: "producao" | "sandbox" }

function baseUrl(ambiente: string) {
  return ambiente === "sandbox"
    ? "https://sandbox.asaas.com/api/v3"
    : "https://api.asaas.com/v3";
}

function getCfg(c: Record<string, unknown>): { token: string; base: string } {
  const token = String(c.access_token ?? "").trim();
  if (!token) throw new Error("Access Token do Asaas não configurado.");
  const ambiente = String(c.ambiente ?? "producao").toLowerCase();
  return { token, base: baseUrl(ambiente) };
}

interface AsaasCustomer { id?: string; errors?: Array<{ description: string }>; }
interface AsaasPayment {
  id?: string; status?: string; value?: number; clientPaymentDate?: string;
  paymentDate?: string; confirmedDate?: string; dueDate?: string;
  errors?: Array<{ description: string }>;
}
interface AsaasPixQr { encodedImage?: string; payload?: string; expirationDate?: string; errors?: Array<{ description: string }>; }

async function authedJson<T>(token: string, url: string, init: RequestInit): Promise<T> {
  const r = await fetch(url, {
    ...init,
    headers: {
      access_token: token,
      "Content-Type": "application/json",
      "User-Agent": "gestor-iptv/1.0",
      ...(init.headers || {}),
    },
  });
  const j = await r.json() as T & { errors?: Array<{ description: string }> };
  if (!r.ok || (j as { errors?: unknown[] }).errors?.length) {
    const msg = j.errors?.[0]?.description || `HTTP ${r.status}`;
    throw new Error(`Asaas: ${msg}`);
  }
  return j;
}

// Cria/reusa um customer pra esse externalReference. Asaas só identifica
// pagador por customer — sem isso, vira "cliente avulso" e fica difícil filtrar.
async function ensureCustomer(token: string, base: string, params: PixParams): Promise<string> {
  // Tenta achar customer existente pelo externalReference. Asaas suporta o filtro.
  const extRef = params.externalReference || "";
  if (extRef) {
    const found = await authedJson<{ data?: Array<{ id?: string }> }>(token,
      `${base}/customers?externalReference=${encodeURIComponent(extRef)}`,
      { method: "GET" });
    const id = found.data?.[0]?.id;
    if (id) return id;
  }
  const created = await authedJson<AsaasCustomer>(token, `${base}/customers`, {
    method: "POST",
    body: JSON.stringify({
      name: params.payerNome || "Cliente",
      email: params.payerEmail,
      externalReference: extRef || undefined,
      notificationDisabled: true, // Não queremos que o Asaas mande email pro cliente final.
    }),
  });
  if (!created.id) throw new Error("Asaas não devolveu customer ID.");
  return created.id;
}

export const asaasProvider: PaymentProvider = {
  name: "asaas",

  async criarPix(credenciais, params): Promise<PixResult> {
    const { token, base } = getCfg(credenciais);
    const customerId = await ensureCustomer(token, base, params);

    // Vencimento do PIX: 1 dia. Asaas exige dueDate em "YYYY-MM-DD".
    const venc = new Date(Date.now() + 24 * 60 * 60_000);
    const dueDate = venc.toISOString().slice(0, 10);

    const payment = await authedJson<AsaasPayment>(token, `${base}/payments`, {
      method: "POST",
      body: JSON.stringify({
        customer: customerId,
        billingType: "PIX",
        value: Number(params.valor.toFixed(2)),
        dueDate,
        description: params.descricao || "Renovação de plano",
        externalReference: params.externalReference,
      }),
    });
    if (!payment.id) throw new Error("Asaas não devolveu payment ID.");

    const qr = await authedJson<AsaasPixQr>(token, `${base}/payments/${payment.id}/pixQrCode`, {
      method: "GET",
    });
    if (!qr.payload || !qr.encodedImage) {
      throw new Error("Asaas não devolveu o QR PIX (verifique se a chave PIX está cadastrada na conta).");
    }
    return {
      id: payment.id,
      status: String(payment.status ?? "PENDING"),
      qrText: qr.payload,
      qrBase64: qr.encodedImage,
      expiresAt: qr.expirationDate ?? null,
    };
  },

  async consultarPagamento(credenciais, paymentId): Promise<StatusResult> {
    const { token, base } = getCfg(credenciais);
    const j = await authedJson<AsaasPayment>(token, `${base}/payments/${encodeURIComponent(paymentId)}`, {
      method: "GET",
    });
    return {
      id: String(j.id ?? paymentId),
      status: String(j.status ?? "unknown").toLowerCase(),
      amount: Number(j.value ?? 0),
      pagoEm: j.paymentDate || j.confirmedDate || j.clientPaymentDate || null,
    };
  },
};

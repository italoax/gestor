// Abstração de provedor de pagamento. Cada um implementa a mesma interface;
// o resto do código não precisa saber de qual provedor estamos falando.
// Adicionar provedor novo = criar arquivo em services/providers/<nome>.ts e
// registrar em PROVIDERS.

export type ProviderName = "mercadopago" | "asaas" | "openpix" | "pagbank" | "pagarme";

export const PROVIDER_NOMES: Record<ProviderName, string> = {
  mercadopago: "Mercado Pago",
  asaas: "Asaas",
  openpix: "OpenPix / Woovi",
  pagbank: "PagBank / PagSeguro",
  pagarme: "Pagar.me",
};

export interface PixResult {
  id: string;            // ID do pagamento no provedor (usado depois pra consultar)
  status: string;        // pending / approved / rejected (normalizado, ver normalizeStatus)
  qrText: string;        // Copia e cola PIX
  qrBase64: string;      // PNG do QR Code em base64 (sem prefixo data:)
  expiresAt: string | null;
}

export interface StatusResult {
  id: string;
  status: string;
  amount: number;
  pagoEm: string | null;
}

export interface PixParams {
  valor: number;
  descricao: string;
  payerNome?: string;
  payerEmail?: string;
  notificationUrl?: string;  // Webhook do gestor
  externalReference?: string; // ID interno pra correlacionar
}

// Cada provedor exporta isso.
export interface PaymentProvider {
  name: ProviderName;
  criarPix(credenciais: Record<string, unknown>, params: PixParams): Promise<PixResult>;
  consultarPagamento(credenciais: Record<string, unknown>, paymentId: string): Promise<StatusResult>;
}

// Status normalizado entre os provedores. Sempre que rolar approved, é "approved".
// Sempre que rolar rejected/cancelled/expired, é "rejected". Demais ficam "pending".
export function normalizeStatus(raw: string): "approved" | "rejected" | "pending" {
  const s = String(raw || "").toLowerCase();
  if (["approved", "received", "confirmed", "completed", "paid"].includes(s)) return "approved";
  if (["rejected", "cancelled", "canceled", "refunded", "charged_back", "expired", "overdue", "failed"].includes(s)) return "rejected";
  return "pending";
}

import { mercadoPagoProvider } from "./providers/mercadopago.js";
import { asaasProvider } from "./providers/asaas.js";
import { openPixProvider } from "./providers/openpix.js";
import { pagBankProvider } from "./providers/pagbank.js";
import { pagarMeProvider } from "./providers/pagarme.js";
import { queryRows, queryOne, execute } from "../db/mysql.js";
import type { RowDataPacket } from "mysql2";

// Registry. Adicionar provedor = importar e colocar aqui.
// `as PaymentProvider` no pagbank/pagarme porque o `name` está tipado como `never`
// (workaround pra cada arquivo não precisar conhecer a união completa).
const PROVIDERS: Record<ProviderName, PaymentProvider> = {
  mercadopago: mercadoPagoProvider,
  asaas: asaasProvider,
  openpix: openPixProvider,
  pagbank: { ...pagBankProvider, name: "pagbank" } as PaymentProvider,
  pagarme: { ...pagarMeProvider, name: "pagarme" } as PaymentProvider,
};

export function getProvider(name: string): PaymentProvider | null {
  return (PROVIDERS as Record<string, PaymentProvider>)[name] ?? null;
}

export const PROVIDER_LISTA: ProviderName[] = ["mercadopago", "asaas", "openpix", "pagbank", "pagarme"];

interface ConfigRow extends RowDataPacket {
  provider: string;
  credenciais: string;
  ativo: number;
}

export interface ProviderConfig {
  provider: ProviderName;
  credenciais: Record<string, unknown>;
  ativo: boolean;
}

export async function carregarConfigsDoUsuario(userId: number): Promise<ProviderConfig[]> {
  const rows = await queryRows<ConfigRow>(
    `SELECT provider, credenciais, ativo FROM payment_provider_configs WHERE user_id = :userId`,
    { userId },
  );
  return rows.map((r) => {
    let creds: Record<string, unknown> = {};
    try { creds = JSON.parse(r.credenciais || "{}"); } catch { /* JSON corrompido — trata como vazio */ }
    return { provider: r.provider as ProviderName, credenciais: creds, ativo: !!r.ativo };
  });
}

export async function salvarConfig(userId: number, provider: ProviderName, credenciais: Record<string, unknown>, ativo: boolean) {
  await execute(
    `INSERT INTO payment_provider_configs (user_id, provider, credenciais, ativo)
     VALUES (:userId, :provider, :credenciais, :ativo)
     ON DUPLICATE KEY UPDATE credenciais = VALUES(credenciais), ativo = VALUES(ativo)`,
    { userId, provider, credenciais: JSON.stringify(credenciais), ativo: ativo ? 1 : 0 },
  );
}

// Resolve qual provedor usar pra um link de pagamento: 1) provider_padrao do user;
// 2) único provedor ativo; 3) null (nada configurado).
export async function escolherProvedor(userId: number): Promise<ProviderConfig | null> {
  const user = await queryOne<RowDataPacket & { providerPadrao: string | null }>(
    `SELECT provider_padrao AS providerPadrao FROM users WHERE id = :userId LIMIT 1`,
    { userId },
  );
  const configs = await carregarConfigsDoUsuario(userId);
  const ativos = configs.filter((c) => c.ativo);
  if (!ativos.length) return null;
  if (user?.providerPadrao) {
    const escolhido = ativos.find((c) => c.provider === user.providerPadrao);
    if (escolhido) return escolhido;
  }
  return ativos[0];
}

// Busca a config de um provedor específico (usado pelo webhook, que sabe qual é).
export async function configDoProvider(userId: number, provider: ProviderName): Promise<ProviderConfig | null> {
  const configs = await carregarConfigsDoUsuario(userId);
  return configs.find((c) => c.provider === provider) ?? null;
}

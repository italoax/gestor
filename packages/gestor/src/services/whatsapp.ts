import { env } from "../config/env.js";
import { normalizeBrazilPhone } from "../shared/index.js";
import { enviarAudioWppConnect, enviarMidiaWppConnect, enviarTextoWppConnect } from "./wppconnect.js";

export interface ClienteMensagem {
  nome?: string | null;
  telefone?: string | null;
  vencimento?: string | Date | null;
  valor?: number | string | null;
  plano?: string | null;
  servidor?: string | null;
  [key: string]: unknown;
}

export interface WhatsappResult {
  ok: boolean;
  status?: number;
  response?: unknown;
  messageId?: string;
  error?: string;
}

export interface MensagemModelo {
  mensagem?: string | null;
  mediaTipo?: string | null;
  mediaPath?: string | null;
}

function replaceSession(path: string, sessao: string) {
  const session = encodeURIComponent(sessao || env.whatsapp.sessionNameDefault || "default");
  // Aceita variações comuns digitadas no painel: {session}, \\{session\\}, :session e [session].
  return path
    .replace(/\\\{/g, "{")
    .replace(/\\\}/g, "}")
    .replace(/\{\s*session\s*\}/gi, session)
    .replace(/:session\b/gi, session)
    .replace(/\[\s*session\s*\]/gi, session);
}

function traduzirErroWhatsapp(error: unknown) {
  const message = String(error instanceof Error ? error.message : error ?? "").trim();
  if (!message) return "";
  if (/fetch failed|ECONNREFUSED|ENOTFOUND|ETIMEDOUT|timeout|network/i.test(message)) {
    return "Não foi possível conectar à API do WhatsApp.";
  }
  if (/unauthorized|forbidden|invalid token|token/i.test(message)) {
    return "Token da API do WhatsApp inválido ou ausente.";
  }
  if (/not found|Cannot GET|Cannot POST/i.test(message)) {
    return "Endpoint da API do WhatsApp não encontrado.";
  }
  if (/QR refs attempts ended/i.test(message)) {
    return "O QR Code expirou. Gere um novo QR Code e tente novamente.";
  }
  return message;
}

async function jsonRequest(url: string, payload?: unknown, method = "POST", headers: Record<string, string> = {}): Promise<WhatsappResult> {
  try {
    const response = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json", ...headers },
      body: method === "GET" ? undefined : JSON.stringify(payload ?? {}),
    });
    const text = await response.text();
    let data: unknown = text;
    try { data = text ? JSON.parse(text) : null; } catch { /* keep text */ }
    if (!response.ok) {
      const json = typeof data === "object" && data !== null ? data as Record<string, unknown> : {};
      return { ok: false, status: response.status, response: data, error: traduzirErroWhatsapp(json.error ?? json.lastError) || `Erro HTTP ${response.status}` };
    }
    const json = typeof data === "object" && data !== null ? data as Record<string, unknown> : null;
    const messages = Array.isArray(json?.messages) ? json.messages as Array<Record<string, unknown>> : [];
    const messageId = String(messages[0]?.id ?? (json?.key as Record<string, unknown> | undefined)?.id ?? "");
    return { ok: true, status: response.status, response: data, messageId };
  } catch (error) {
    return { ok: false, error: traduzirErroWhatsapp(error) };
  }
}

export function normalizarTelefone(telefone: string) {
  return normalizeBrazilPhone(telefone, env.whatsapp.defaultCountry);
}

export function montarMensagem(template: string, cliente: ClienteMensagem) {
  const vencimento = cliente.vencimento instanceof Date
    ? cliente.vencimento.toLocaleDateString("pt-BR", { timeZone: "UTC" })
    : String(cliente.vencimento ?? "");
  const valor = Number(cliente.valor ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const horaSp = Number(new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", hour12: false }).format(new Date()));
  const saudacao = horaSp < 12 ? "Bom dia" : horaSp < 18 ? "Boa tarde" : "Boa noite";
  const nomeCompleto = String(cliente.nome ?? "").trim();
  const tags: Record<string, string> = {
    nome: nomeCompleto,
    nome_completo: nomeCompleto,
    primeiro_nome: nomeCompleto.split(/\s+/)[0] ?? "",
    cliente: nomeCompleto,
    saudacao,
    senha: String((cliente as Record<string, unknown>).senha ?? ""),
    vencimento,
    valor,
    plano: String(cliente.plano ?? ""),
    usuario: String(cliente.user ?? ""),
    user: String(cliente.user ?? ""),
    telefone: String(cliente.telefone ?? ""),
    servidor: String(cliente.servidor ?? ""),
  };
  return template
    .replace(/\{([^}]+)\}/g, (_, key: string) => {
      const normalizedKey = key.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
      return tags[normalizedKey] ?? "";
    })
    .replace(/\r\n/g, "\n");
}

export function resolverUrlMidia(caminho: string) {
  const trimmed = caminho.trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `${env.appUrl.replace(/\/$/, "")}/${trimmed.replace(/^\//, "")}`;
}

function sessionUrl(pathTemplate: string, sessao: string) {
  if (!env.whatsapp.sessionApiUrl) return "";
  const path = replaceSession(pathTemplate, sessao);
  return `${env.whatsapp.sessionApiUrl}${path.startsWith("/") ? path : `/${path}`}`;
}

async function enviarCloud(to: string, payload: Record<string, unknown>) {
  if (!env.whatsapp.accessToken || !env.whatsapp.phoneNumberId) {
    return { ok: false, error: "Configuração WA_ACCESS_TOKEN/WA_PHONE_NUMBER_ID ausente." };
  }
  const url = `https://graph.facebook.com/${env.whatsapp.apiVersion}/${env.whatsapp.phoneNumberId}/messages`;
  return jsonRequest(url, { messaging_product: "whatsapp", to, ...payload }, "POST", {
    Authorization: `Bearer ${env.whatsapp.accessToken}`,
  });
}

function sessionHeaders(token?: string): Record<string, string> {
  const resolvedToken = (token ?? env.whatsapp.sessionApiToken).trim();
  return resolvedToken ? { Authorization: `Bearer ${resolvedToken}`, token: resolvedToken } : {};
}

function isSessionApiDriver() {
  return ["session", "session-api", "session_api", "csession-api", "csession_api"].includes(env.whatsapp.driver);
}

export async function enviarTexto(sessao: string, telefone: string, mensagem: string, token?: string): Promise<WhatsappResult> {
  const to = normalizarTelefone(telefone);
  if (env.whatsapp.driver === "wppconnect") {
    return enviarTextoWppConnect(to, mensagem);
  }
  if (isSessionApiDriver()) {
    const url = sessionUrl(env.whatsapp.sessionSendTextPath, sessao || env.whatsapp.sessionNameDefault);
    if (!url) return { ok: false, error: "WA_SESSION_API_URL ausente." };
    return jsonRequest(url, { session: sessao || env.whatsapp.sessionNameDefault, number: to, body: mensagem }, "POST", sessionHeaders(token));
  }
  return enviarCloud(to, { type: "text", text: { body: mensagem } });
}

export async function enviarMidia(sessao: string, telefone: string, urlMidia: string, tipo: string, caption = "", token?: string): Promise<WhatsappResult> {
  const to = normalizarTelefone(telefone);
  const urlPublica = resolverUrlMidia(urlMidia);
  if (env.whatsapp.driver === "wppconnect") {
    return enviarMidiaWppConnect(to, urlPublica, tipo, caption);
  }
  if (isSessionApiDriver()) {
    const url = sessionUrl(env.whatsapp.sessionSendMediaPath, sessao || env.whatsapp.sessionNameDefault);
    if (!url) return { ok: false, error: "WA_SESSION_API_URL ausente." };
    return jsonRequest(url, { session: sessao || env.whatsapp.sessionNameDefault, number: to, mediaUrl: urlPublica, caption, type: tipo }, "POST", sessionHeaders(token));
  }
  const mediaType = tipo === "video" ? "video" : tipo === "document" ? "document" : "image";
  return enviarCloud(to, { type: mediaType, [mediaType]: { link: urlPublica, caption } });
}

export async function enviarAudio(sessao: string, telefone: string, urlAudio: string, token?: string): Promise<WhatsappResult> {
  const to = normalizarTelefone(telefone);
  const urlPublica = resolverUrlMidia(urlAudio);
  if (env.whatsapp.driver === "wppconnect") {
    return enviarAudioWppConnect(to, urlPublica);
  }
  if (isSessionApiDriver()) {
    const url = sessionUrl(env.whatsapp.sessionSendAudioPath, sessao || env.whatsapp.sessionNameDefault);
    if (!url) return { ok: false, error: "WA_SESSION_API_URL ausente." };
    return jsonRequest(url, { session: sessao || env.whatsapp.sessionNameDefault, number: to, mediaUrl: urlPublica }, "POST", sessionHeaders(token));
  }
  return enviarCloud(to, { type: "audio", audio: { link: urlPublica } });
}

export async function enviarMensagemModelo(sessao: string, cliente: ClienteMensagem, modelo: MensagemModelo, token?: string): Promise<WhatsappResult> {
  const texto = montarMensagem(modelo.mensagem || "", cliente);
  const telefone = String(cliente.telefone ?? "");
  const mediaPath = String(modelo.mediaPath ?? "").trim();
  const mediaTipo = String(modelo.mediaTipo ?? "").trim().toLowerCase();

  if (mediaPath) {
    if (mediaTipo === "audio") {
      return enviarAudio(sessao, telefone, mediaPath, token);
    }
    return enviarMidia(sessao, telefone, mediaPath, mediaTipo || "image", texto, token);
  }

  return enviarTexto(sessao, telefone, texto, token);
}


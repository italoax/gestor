import { Router } from "express";
import { env } from "../config/env.js";
import { getWppConnectState, resetWppConnectSession, startWppConnect } from "../services/wppconnect.js";

export const whatsappRouter = Router();

type WhatsappState = {
  session: string;
  status: string;
  qrCode?: string;
  qr?: string;
  lastError?: string;
  connected?: boolean;
  debug?: Record<string, unknown>;
};

function isSessionApiDriver() {
  return ["session", "session-api", "session_api", "csession-api", "csession_api"].includes(env.whatsapp.driver);
}

function defaultSession() {
  return env.whatsapp.sessionNameDefault || env.whatsapp.wppconnectSession || "default";
}

function sessionApiUrl(pathTemplate: string) {
  if (!env.whatsapp.sessionApiUrl) return "";
  const session = encodeURIComponent(defaultSession());
  // Aceita variações comuns digitadas no painel: {session}, \{session\}, :session e [session].
  const path = pathTemplate
    .replace(/\\\{/g, "{")
    .replace(/\\\}/g, "}")
    .replace(/\{\s*session\s*\}/gi, session)
    .replace(/:session\b/gi, session)
    .replace(/\[\s*session\s*\]/gi, session);
  return `${env.whatsapp.sessionApiUrl}${path.startsWith("/") ? path : `/${path}`}`;
}

function safeUrlForDisplay(url: string) {
  return url.replace(/[?&](token|apikey|api_key|access_token)=[^&]+/gi, "$1=***");
}

function traduzirErroWhatsapp(error: unknown) {
  const message = String(error instanceof Error ? error.message : error ?? "").trim();
  if (!message) return "";

  if (/QR refs attempts ended/i.test(message)) {
    return "O QR Code expirou. Clique em Gerar QR Code novamente e leia o QR assim que ele aparecer.";
  }
  if (/fetch failed|ECONNREFUSED|ENOTFOUND|ETIMEDOUT|timeout|network/i.test(message)) {
    return "Não foi possível conectar à API do WhatsApp. Confira se o app WhatsApp API está online e tente novamente.";
  }
  if (/unauthorized|forbidden|invalid token|token/i.test(message)) {
    return "Token da API do WhatsApp inválido ou ausente. Confira WA_SESSION_API_TOKEN na Hostinger.";
  }
  if (/not found|Cannot GET|Cannot POST/i.test(message)) {
    return "Endpoint da API do WhatsApp não encontrado. Confira as rotas WA_SESSION_* configuradas na Hostinger.";
  }
  if (/session.*not.*found|no session/i.test(message)) {
    return "Sessão do WhatsApp não encontrada. Clique em Gerar QR Code para criar uma nova sessão.";
  }
  if (/already.*connected|connected/i.test(message)) {
    return "Sessão do WhatsApp já está conectada.";
  }

  return message;
}

function sessionApiHeaders() {
  const token = env.whatsapp.sessionApiToken.trim();
  return token ? { Authorization: `Bearer ${token}`, token } : {};
}

function normalizeSessionState(data: unknown): WhatsappState {
  const json = typeof data === "object" && data !== null ? data as Record<string, unknown> : {};
  const rawStatus = String(json.status ?? json.state ?? (json.connected ? "conectado" : "desconectado")).toLowerCase();
  const status = ["connected", "open", "islogged", "authenticated", "ready", "conectado"].includes(rawStatus)
    ? "conectado"
    : ["qr", "qrcode", "scan", "pairing"].includes(rawStatus)
      ? "qr"
      : ["starting", "loading", "initializing", "iniciando"].includes(rawStatus)
        ? "iniciando"
        : ["error", "erro", "failed"].includes(rawStatus)
          ? "erro"
          : rawStatus;
  const qrValue = json.qrImage ?? json.qrCode ?? json.qrcode ?? json.qr ?? json.base64 ?? json.image ?? json.data;
  const qrText = typeof qrValue === "string" ? qrValue : "";
  const qrCode = qrText ? (qrText.startsWith("data:image") ? qrText : qrText.startsWith("/9j") || qrText.startsWith("iVBOR") ? `data:image/png;base64,${qrText}` : qrText) : undefined;
  const hasUsableQr = Boolean(qrCode);
  return {
    session: String(json.session ?? defaultSession()),
    // Algumas APIs Baileys retornam status "erro" e lastError mesmo já trazendo qrImage.
    // Se há QR válido, a tela deve mostrar somente o QR aguardando leitura.
    status: hasUsableQr && status !== "conectado" ? "qr" : status,
    qrCode,
    qr: typeof json.qr === "string" ? json.qr : undefined,
    lastError: hasUsableQr && status !== "conectado" ? undefined : traduzirErroWhatsapp(json.lastError ?? json.error),
    connected: Boolean(json.connected || status === "conectado"),
  };
}

async function requestSessionApi(pathTemplate: string, method: "GET" | "POST"): Promise<WhatsappState> {
  const url = sessionApiUrl(pathTemplate);
  const debug = {
    pathTemplate,
    url: url ? safeUrlForDisplay(url) : "",
    method,
  };
  if (!url) {
    return {
      session: defaultSession(),
      status: "erro",
      lastError: "WA_SESSION_API_URL ausente.",
      debug,
    } satisfies WhatsappState;
  }

  try {
    const response = await fetch(url, {
      method,
      headers: sessionApiHeaders(),
    });
    const text = await response.text();
    let data: unknown = text;
    try { data = text ? JSON.parse(text) : {}; } catch { /* mantém texto */ }
    if (!response.ok) {
      const json = typeof data === "object" && data !== null ? data as Record<string, unknown> : {};
      const apiError = traduzirErroWhatsapp(json.error ?? json.lastError);
      return {
        session: defaultSession(),
        status: "erro",
        lastError: apiError || `Erro HTTP ${response.status} ao acessar ${safeUrlForDisplay(url)}`,
        debug: { ...debug, httpStatus: response.status, bodyPreview: typeof data === "string" ? data.slice(0, 180) : json },
      } satisfies WhatsappState;
    }
    const normalized = normalizeSessionState(data);
    return {
      ...normalized,
      debug: { ...debug, httpStatus: response.status },
    };
  } catch (error) {
    return {
      session: defaultSession(),
      status: "erro",
      lastError: `${traduzirErroWhatsapp(error)} em ${safeUrlForDisplay(url)}`,
      debug,
    } satisfies WhatsappState;
  }
}

async function getSessionApiStateWithQr() {
  const state = await requestSessionApi(env.whatsapp.sessionStatusPath, "GET");
  if (state.connected || state.qrCode) return state;

  // Mesmo se o status falhar com 404/erro, tenta buscar o QR em endpoint separado.
  // Isso evita bloquear a tela quando a API já tem qrImage em /session/qr/{session}.
  const qrState = await requestSessionApi(env.whatsapp.sessionQrPath, "GET");
  if (qrState.qrCode) {
    return {
      ...state,
      status: "qr",
      qrCode: qrState.qrCode,
      qr: qrState.qr,
      lastError: undefined,
    } satisfies WhatsappState;
  }

  if (state.status === "erro") return state;
  return state;
}

async function getWhatsappState() {
  if (isSessionApiDriver()) {
    return getSessionApiStateWithQr();
  }
  return getWppConnectState();
}

function hideQrUntilRequested(state: WhatsappState, showQr: boolean): WhatsappState {
  if (showQr || state.connected || state.status === "conectado") return state;
  if (!state.qrCode && state.status !== "qr") return state;
  return {
    ...state,
    status: "desconectado",
    qrCode: undefined,
    qr: undefined,
    lastError: undefined,
  };
}

whatsappRouter.get("/whatsapp", async (req, res) => {
  const showQr = Boolean(req.session.whatsappShowQr);
  res.render("pages/whatsapp", {
    title: "WhatsApp",
    state: hideQrUntilRequested(await getWhatsappState(), showQr),
    driver: env.whatsapp.driver,
    sessionApi: isSessionApiDriver(),
  });
});

whatsappRouter.post("/whatsapp", async (req, res) => {
  const action = String(req.body.action ?? "");
  try {
    if (isSessionApiDriver()) {
      if (action === "start") {
        req.session.whatsappShowQr = true;
        await requestSessionApi(env.whatsapp.sessionStartPath, "POST");
      } else if (action === "restart_qr") {
        req.session.whatsappShowQr = true;
        await requestSessionApi(env.whatsapp.sessionRestartPath, "POST");
        await requestSessionApi(env.whatsapp.sessionStartPath, "POST");
      } else if (action === "stop") {
        req.session.whatsappShowQr = false;
        await requestSessionApi(env.whatsapp.sessionRestartPath, "POST");
      }
    } else if (env.whatsapp.driver !== "wppconnect") {
      req.flash("info", "Driver de WhatsApp atual: " + env.whatsapp.driver);
    } else if (action === "start") {
      req.session.whatsappShowQr = true;
      const currentState = getWppConnectState();
      if (["qr", "iniciando"].includes(currentState.status)) {
        await resetWppConnectSession();
      }
      void startWppConnect().catch((error) => console.error("Erro ao iniciar WPPConnect:", error));
    } else if (action === "restart_qr") {
      req.session.whatsappShowQr = true;
      await resetWppConnectSession();
      void startWppConnect().catch((error) => console.error("Erro ao reiniciar WPPConnect:", error));
    } else if (action === "stop") {
      req.session.whatsappShowQr = false;
      await resetWppConnectSession();
    }
  } catch (error) {
    req.flash("error", traduzirErroWhatsapp(error));
  }
  res.redirect("/whatsapp");
});

whatsappRouter.get("/whatsapp/status", async (req, res) => {
  const showQr = Boolean(req.session.whatsappShowQr);
  const state = hideQrUntilRequested(await getWhatsappState(), showQr);
  res.json({
    ...state,
    build: "qrcode-fix-v6-show-qr-after-click",
    config: isSessionApiDriver() ? {
      driver: env.whatsapp.driver,
      session: defaultSession(),
      apiUrl: env.whatsapp.sessionApiUrl,
      statusPath: env.whatsapp.sessionStatusPath,
      qrPath: env.whatsapp.sessionQrPath,
      startPath: env.whatsapp.sessionStartPath,
      restartPath: env.whatsapp.sessionRestartPath,
    } : undefined,
  });
});

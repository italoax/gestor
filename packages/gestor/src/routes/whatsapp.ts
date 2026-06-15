import { Router } from "express";
import { env } from "../config/env.js";
import { execute, queryOne, queryRows } from "../db/mysql.js";
import { appTodayIso } from "../services/dates.js";
import { ensureCobrancasEnviosTable } from "../services/cobrancasCron.js";
import { getWppConnectState } from "../services/wppconnect.js";
import type { RowDataPacket } from "mysql2";

export const whatsappRouter = Router();

interface DeviceRow extends RowDataPacket { id: number; nome: string; sessao: string; bloqueioChamadas: number; principal: number; }

type WhatsappState = {
  session: string; status: string; qrCode?: string; qr?: string; pairingCode?: string;
  lastError?: string; connected?: boolean;
};

function isSessionApiDriver() {
  return ["session", "session-api", "session_api", "csession-api", "csession_api"].includes(env.whatsapp.driver);
}

function sessionApiUrl(pathTemplate: string, session: string) {
  if (!env.whatsapp.sessionApiUrl) return "";
  const s = encodeURIComponent(session);
  const path = pathTemplate
    .replace(/\\\{/g, "{").replace(/\\\}/g, "}")
    .replace(/\{\s*session\s*\}/gi, s).replace(/:session\b/gi, s).replace(/\[\s*session\s*\]/gi, s);
  return `${env.whatsapp.sessionApiUrl}${path.startsWith("/") ? path : `/${path}`}`;
}

function sessionApiHeaders() {
  const token = env.whatsapp.sessionApiToken.trim();
  return token ? { Authorization: `Bearer ${token}`, token } : {};
}

function traduzirErroWhatsapp(error: unknown) {
  const message = String(error instanceof Error ? error.message : error ?? "").trim();
  if (!message) return "";
  if (/QR refs attempts ended/i.test(message)) return "O QR Code expirou. Gere um novo e leia assim que aparecer.";
  if (/fetch failed|ECONNREFUSED|ENOTFOUND|ETIMEDOUT|timeout|network|abort/i.test(message)) return "Não foi possível conectar à API do WhatsApp.";
  if (/unauthorized|forbidden|invalid token|token/i.test(message)) return "Token da API do WhatsApp inválido ou ausente.";
  if (/not found|Cannot GET|Cannot POST/i.test(message)) return "Endpoint da API do WhatsApp não encontrado.";
  if (/session.*not.*found|no session/i.test(message)) return "Sessão não encontrada. Clique em Conectar para criar.";
  return message;
}

function normalizeSessionState(data: unknown, session: string): WhatsappState {
  const json = typeof data === "object" && data !== null ? data as Record<string, unknown> : {};
  const rawStatus = String(json.status ?? json.state ?? (json.connected ? "conectado" : "desconectado")).toLowerCase();
  const status = ["connected", "open", "islogged", "authenticated", "ready", "conectado"].includes(rawStatus) ? "conectado"
    : ["qr", "qrcode", "scan", "pairing"].includes(rawStatus) ? "qr"
    : ["starting", "loading", "initializing", "iniciando"].includes(rawStatus) ? "iniciando"
    : ["error", "erro", "failed"].includes(rawStatus) ? "erro" : rawStatus;
  const qrValue = json.qrImage ?? json.qrCode ?? json.qrcode ?? json.qr ?? json.base64 ?? json.image ?? json.data;
  const qrText = typeof qrValue === "string" ? qrValue : "";
  const qrCode = qrText ? (qrText.startsWith("data:image") ? qrText : qrText.startsWith("/9j") || qrText.startsWith("iVBOR") ? `data:image/png;base64,${qrText}` : qrText) : undefined;
  const pairingValue = json.pairingCode ?? json.pairing_code ?? json.code;
  const pairingCode = typeof pairingValue === "string" && pairingValue.trim() ? pairingValue.trim() : undefined;
  const connected = Boolean(json.connected || status === "conectado");
  const hasUsableQr = Boolean(qrCode) && !pairingCode;
  const hasPairing = Boolean(pairingCode) && !connected;
  return {
    session: String(json.session ?? session),
    status: hasPairing ? "pairing" : hasUsableQr && status !== "conectado" ? "qr" : status,
    qrCode: hasPairing ? undefined : qrCode,
    pairingCode: hasPairing ? pairingCode : undefined,
    lastError: hasPairing || (hasUsableQr && status !== "conectado") ? undefined : traduzirErroWhatsapp(json.lastError ?? json.error),
    connected,
  };
}

async function requestSessionApi(pathTemplate: string, method: "GET" | "POST", session: string, body?: Record<string, unknown>): Promise<WhatsappState> {
  const url = sessionApiUrl(pathTemplate, session);
  if (!url) return { session, status: "erro", lastError: "WA_SESSION_API_URL ausente." };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 9000);
  try {
    const response = await fetch(url, {
      method, signal: ctrl.signal,
      headers: body ? { "Content-Type": "application/json", ...sessionApiHeaders() } : sessionApiHeaders(),
      body: body ? JSON.stringify(body) : undefined,
    });
    const txt = await response.text();
    let data: unknown = txt;
    try { data = txt ? JSON.parse(txt) : {}; } catch { /* mantém texto */ }
    if (!response.ok) {
      const j = typeof data === "object" && data !== null ? data as Record<string, unknown> : {};
      return { session, status: "erro", lastError: traduzirErroWhatsapp(j.error ?? j.lastError) || `Erro HTTP ${response.status}` };
    }
    return normalizeSessionState(data, session);
  } catch (error) {
    return { session, status: "erro", lastError: traduzirErroWhatsapp(error) };
  } finally {
    clearTimeout(timer);
  }
}

async function getDeviceState(session: string): Promise<WhatsappState> {
  if (!isSessionApiDriver()) return getWppConnectState() as WhatsappState;
  const state = await requestSessionApi(env.whatsapp.sessionStatusPath, "GET", session);
  if (state.connected || state.qrCode || state.pairingCode) return state;
  const qrState = await requestSessionApi(env.whatsapp.sessionQrPath, "GET", session);
  if (qrState.qrCode) return { ...state, status: "qr", qrCode: qrState.qrCode, lastError: undefined };
  return state;
}

function gerarSessao(nome: string) {
  const semAcento = String(nome).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const base = semAcento.replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 24) || "dispositivo";
  return `${base}-${Math.random().toString(36).slice(2, 7)}`;
}

async function listarDevices(userId: number) {
  return queryRows<DeviceRow>(
    "SELECT id, nome, sessao, bloqueio_chamadas AS bloqueioChamadas, principal FROM whatsapp_devices WHERE user_id = :userId ORDER BY principal DESC, id ASC",
    { userId },
  );
}

async function ensureDispositivoPrincipal(userId: number) {
  const rows = await queryRows<RowDataPacket & { total: number }>("SELECT COUNT(*) AS total FROM whatsapp_devices WHERE user_id = :userId", { userId });
  if (Number(rows[0]?.total ?? 0) > 0) return;
  await execute(
    "INSERT INTO whatsapp_devices (user_id, nome, sessao, principal) VALUES (:userId, 'Principal', :sessao, 1)",
    { userId, sessao: env.whatsapp.sessionNameDefault || "default" },
  );
}

async function carregarDevice(userId: number, id: number) {
  return queryOne<DeviceRow>(
    "SELECT id, nome, sessao, bloqueio_chamadas AS bloqueioChamadas, principal FROM whatsapp_devices WHERE id = :id AND user_id = :userId LIMIT 1",
    { id, userId },
  );
}

whatsappRouter.get("/whatsapp", async (req, res, next) => {
  try {
    const userId = req.session.user!.id;
    await ensureCobrancasEnviosTable();
    await ensureDispositivoPrincipal(userId);
    const today = appTodayIso();
    const [devices, envios] = await Promise.all([
      listarDevices(userId),
      queryRows<RowDataPacket & { enviados: number; erros: number }>(
        `SELECT COALESCE(SUM(ce.status='enviado'),0) AS enviados, COALESCE(SUM(ce.status='erro'),0) AS erros
           FROM cobrancas_envios ce JOIN cobrancas c ON c.id = ce.cobranca_id
          WHERE c.user_id = :userId AND ce.data_envio = :today`,
        { userId, today },
      ),
    ]);
    const enviados = Number(envios[0]?.enviados ?? 0);
    const erros = Number(envios[0]?.erros ?? 0);
    const stats = {
      total: devices.length,
      mensagensHoje: enviados,
      entrega: enviados + erros > 0 ? Math.round((enviados / (enviados + erros)) * 100) : 0,
    };
    res.render("pages/whatsapp", {
      title: "WhatsApp", subtitle: "Gerencie múltiplos dispositivos WhatsApp para envio de mensagens",
      devices, stats, sessionApi: isSessionApiDriver(), driver: env.whatsapp.driver,
    });
  } catch (error) { next(error); }
});

// CRUD de dispositivos (form normal)
whatsappRouter.post("/whatsapp", async (req, res, next) => {
  try {
    const userId = req.session.user!.id;
    const action = String(req.body.action ?? "");
    const id = Number(req.body.id);
    if (action === "add_device") {
      const nome = String(req.body.nome ?? "").trim();
      if (!nome) { req.flash("error", "Informe o nome do dispositivo."); return res.redirect("/whatsapp"); }
      await execute("INSERT INTO whatsapp_devices (user_id, nome, sessao) VALUES (:userId, :nome, :sessao)", { userId, nome, sessao: gerarSessao(nome) });
      req.flash("success", "Dispositivo criado com sucesso.");
    } else if (action === "delete_device") {
      await execute("DELETE FROM whatsapp_devices WHERE id = :id AND user_id = :userId", { id, userId });
      req.flash("success", "Dispositivo removido.");
    } else if (action === "toggle_bloqueio") {
      await execute("UPDATE whatsapp_devices SET bloqueio_chamadas = IF(bloqueio_chamadas = 1, 0, 1) WHERE id = :id AND user_id = :userId", { id, userId });
    }
    return res.redirect("/whatsapp");
  } catch (error) { next(error); }
});

// Status de um dispositivo (ou do principal, p/ o indicador do topo). Usado em polling.
whatsappRouter.get("/whatsapp/status", async (req, res, next) => {
  try {
    const userId = req.session.user!.id;
    const id = Number(req.query.device);
    const device = id ? await carregarDevice(userId, id) : (await listarDevices(userId))[0];
    if (!device) return res.json({ status: "desconectado", connected: false });
    const state = await getDeviceState(device.sessao);
    return res.json({ ...state, deviceId: device.id });
  } catch (error) { next(error); }
});

// Conectar (gera QR), parear pelo número, ou desconectar — AJAX JSON.
whatsappRouter.post("/whatsapp/device/:id/:op", async (req, res, next) => {
  try {
    const userId = req.session.user!.id;
    const device = await carregarDevice(userId, Number(req.params.id));
    if (!device) return res.status(404).json({ status: "erro", lastError: "Dispositivo não encontrado." });
    const op = String(req.params.op);
    if (!isSessionApiDriver()) return res.json({ status: "erro", lastError: "Driver de WhatsApp não é session-api." });

    if (op === "connect") {
      await requestSessionApi(env.whatsapp.sessionStartPath, "POST", device.sessao);
      return res.json(await getDeviceState(device.sessao));
    }
    if (op === "pair") {
      const phone = String(req.body.phone ?? req.body.number ?? "").replace(/\D+/g, "");
      if (!phone) return res.json({ status: "erro", lastError: "Informe o número com DDI e DDD (ex: 5531999999999)." });
      const state = await requestSessionApi(env.whatsapp.sessionPairPath, "POST", device.sessao, { number: phone });
      return res.json(state);
    }
    if (op === "disconnect") {
      await requestSessionApi(env.whatsapp.sessionRestartPath, "POST", device.sessao);
      return res.json({ status: "desconectado", connected: false });
    }
    return res.status(400).json({ status: "erro", lastError: "Operação inválida." });
  } catch (error) { next(error); }
});

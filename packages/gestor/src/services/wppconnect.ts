import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import path from "node:path";
import { env } from "../config/env.js";

type WppClient = {
  sendText: (to: string, content: string, options?: Record<string, unknown>) => Promise<unknown>;
  sendMessageOptions?: (to: string, content: string, options?: Record<string, unknown>) => Promise<unknown>;
  sendImage?: (to: string, file: string, filename?: string, caption?: string) => Promise<unknown>;
  sendFile?: (to: string, file: string, filename?: string, caption?: string) => Promise<unknown>;
  sendPtt?: (to: string, file: string) => Promise<unknown>;
  checkNumberStatus?: (contactId: string) => Promise<{
    id?: { _serialized?: string };
    canReceiveMessage?: boolean;
    numberExists?: boolean;
    status?: number;
  }>;
  getNumberProfile?: (contactId: string) => Promise<{
    id?: { _serialized?: string };
    canReceiveMessage?: boolean;
    numberExists?: boolean;
    status?: number;
  }>;
  isConnected?: () => Promise<boolean> | boolean;
  close?: () => Promise<boolean | void> | boolean | void;
};

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

function traduzirErroWppConnect(error: unknown) {
  const message = errorMessage(error);
  if (/already running|userDataDir|stop the running browser/i.test(message)) {
    return "O WhatsApp já está aberto em outra tentativa de conexão. Clique em Gerar QR Code novamente ou aguarde alguns segundos.";
  }
  if (/Failed to launch the browser process|Failed to launch|browser process/i.test(message)) {
    return "Não foi possível abrir o navegador interno do WhatsApp. Verifique se o Chrome está instalado no WSL e tente novamente.";
  }
  if (/Auto Close Called|Not logged|Failed to read the QRCode/i.test(message)) {
    return "O QR Code expirou ou não foi lido. Gere um novo QR Code e tente novamente.";
  }
  if (/Page Closed|browserClose|serverClose/i.test(message)) {
    return "A conexão do WhatsApp foi fechada. Gere um novo QR Code para conectar novamente.";
  }
  if (/No LID for user|lid/i.test(message)) {
    return "Não foi possível localizar esse número no WhatsApp. Confira o telefone e tente novamente.";
  }
  if (/WhatsApp ainda não está conectado/i.test(message)) {
    return "WhatsApp ainda não conectado. Leia o QR Code antes de enviar mensagens.";
  }
  if (/Cannot find package.*@wppconnect-team\/wppconnect|ERR_MODULE_NOT_FOUND/i.test(message)) {
    return "WPPConnect não está instalado porque foi removido das dependências para eliminar vulnerabilidades do npm audit. Use WA_DRIVER=cloud ou WA_DRIVER=session em produção, ou reinstale WPPConnect por sua conta e risco.";
  }
  return message || "Erro ao conectar com o WhatsApp. Tente novamente.";
}

type WppStatus = "desconectado" | "iniciando" | "qr" | "conectado" | "erro";

let client: WppClient | null = null;
let starting: Promise<WppClient> | null = null;
let status: WppStatus = "desconectado";
let qrCode = "";
let lastError = "";
let lastStatus = "";
let startRunId = 0;

function sessionName() {
  return env.whatsapp.wppconnectSession || env.whatsapp.sessionNameDefault || "default";
}

function tokenSessionPath() {
  return path.resolve(process.cwd(), env.whatsapp.wppconnectTokensDir, sessionName());
}

function resolveBrowserPath() {
  if (env.whatsapp.wppconnectBrowserPath) return env.whatsapp.wppconnectBrowserPath;

  const linuxChromePaths = [
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium-browser",
    "/usr/bin/chromium",
  ];

  return linuxChromePaths.find((path) => existsSync(path)) || undefined;
}

function browserArgs() {
  return [
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--disable-dev-shm-usage",
    "--disable-gpu",
    "--disable-web-security",
    "--disable-features=IsolateOrigins,site-per-process",
  ];
}

function toWppNumber(telefone: string) {
  const trimmed = telefone.trim();
  if (trimmed.includes("@")) return trimmed;
  const digits = trimmed.replace(/\D+/g, "");
  return `${digits}@c.us`;
}

function phoneDigits(telefone: string) {
  return telefone.replace(/\D+/g, "");
}

function unique<T>(items: T[]) {
  return Array.from(new Set(items.filter(Boolean)));
}

function recipientCandidates(telefone: string) {
  const digits = phoneDigits(telefone);
  const candidates = [toWppNumber(telefone)];

  // Algumas contas brasileiras antigas aparecem no WhatsApp sem o 9º dígito.
  // Se o envio com DDI+DDD+9+número falhar com erro de LID, tentamos também a forma sem o 9.
  if (digits.startsWith("55") && digits.length === 13 && digits[4] === "9") {
    candidates.push(`${digits.slice(0, 4)}${digits.slice(5)}@c.us`);
  }

  return unique(candidates);
}

async function checkRecipient(activeClient: WppClient, contactId: string) {
  const check = activeClient.checkNumberStatus || activeClient.getNumberProfile;
  if (!check) return contactId;

  const profile = await check.call(activeClient, contactId);
  if (profile.numberExists === false || profile.canReceiveMessage === false) {
    return "";
  }

  return profile.id?._serialized || contactId;
}

async function resolveRecipientCandidates(activeClient: WppClient, telefone: string) {
  const candidates = recipientCandidates(telefone);
  const resolved: string[] = [];
  let checkedAny = false;

  for (const candidate of candidates) {
    try {
      const contactId = await checkRecipient(activeClient, candidate);
      checkedAny = true;
      if (contactId) resolved.push(contactId, candidate);
    } catch {
      // Continua para o próximo formato possível do telefone.
    }
  }

  if (resolved.length > 0) return unique(resolved);
  if (!checkedAny) return candidates;

  throw new Error(`Número sem WhatsApp ou indisponível para receber mensagem: ${telefone}`);
}

function isNoLidError(error: unknown) {
  return /No LID for user|lid/i.test(errorMessage(error));
}

async function sendTextResolved(activeClient: WppClient, to: string, mensagem: string) {
  try {
    return await activeClient.sendText(to, mensagem, { createChat: true });
  } catch (error) {
    if (isNoLidError(error) && activeClient.sendMessageOptions) {
      return activeClient.sendMessageOptions(to, mensagem, { createChat: true });
    }
    throw error;
  }
}

function resolverUrlMidiaWpp(caminho: string) {
  const trimmed = caminho.trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `${env.appUrl.replace(/\/$/, "")}/${trimmed.replace(/^\//, "")}`;
}

function fileNameFromUrl(url: string, fallback: string) {
  const clean = url.split("?")[0];
  const name = clean.split("/").filter(Boolean).pop();
  return name || fallback;
}

async function isClientConnected(activeClient: WppClient) {
  try {
    return Boolean(await Promise.resolve(activeClient.isConnected?.()));
  } catch {
    return false;
  }
}

export function getWppConnectState() {
  return { status, qrCode, lastError, lastStatus, session: sessionName(), hasClient: Boolean(client) };
}

export async function startWppConnect() {
  if (client) return client;
  if (starting) return starting;

  const runId = ++startRunId;
  status = "iniciando";
  lastError = "";

  starting = (async () => {
    let browserPath: string | undefined;
    try {
      const packageName = "@wppconnect-team/wppconnect";
      const wppconnect = await import(packageName);
      browserPath = resolveBrowserPath();
      const created = await wppconnect.create({
        session: sessionName(),
        catchQR: (base64Qrimg: string) => {
          if (runId !== startRunId) return;
          qrCode = base64Qrimg;
          status = "qr";
        },
        statusFind: (currentStatus: string) => {
          if (runId !== startRunId) return;
          lastStatus = currentStatus;
          if (["isLogged", "qrReadSuccess", "inChat"].includes(currentStatus)) {
            status = "conectado";
            qrCode = "";
          }
          if (currentStatus === "notLogged" && qrCode) {
            status = "qr";
          }
          if (["browserClose", "desconnectedMobile", "serverClose"].includes(currentStatus)) {
            status = "desconectado";
            qrCode = "";
          }
        },
        headless: env.whatsapp.wppconnectHeadless,
        useChrome: false,
        folderNameToken: env.whatsapp.wppconnectTokensDir,
        logQR: false,
        autoClose: 0,
        waitForLogin: false,
        disableWelcome: true,
        browserArgs: browserArgs(),
        puppeteerOptions: {
          executablePath: browserPath,
        },
      });
      const createdClient = created as unknown as WppClient;
      if (runId !== startRunId) {
        await createdClient.close?.();
        throw new Error("Inicialização WPPConnect substituída por um novo QR Code.");
      }
      client = createdClient;
      const connected = await isClientConnected(client);
      if (connected) {
        status = "conectado";
        qrCode = "";
      } else if (!qrCode) {
        status = "iniciando";
      }
      return client;
    } catch (error) {
      if (runId !== startRunId) throw error;
      status = "erro";
      const rawErrorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : "";
      
      console.error("❌ ERRO ao iniciar WPPConnect:", {
        mensagem: rawErrorMessage,
        browserPath,
        stack: errorStack,
      });
      
      lastError = traduzirErroWppConnect(error);
      client = null;
      throw error;
    } finally {
      if (runId === startRunId) starting = null;
    }
  })();

  return starting;
}

async function getClient() {
  if (!client) await startWppConnect();
  let activeClient = client;
  if (!activeClient || !(await isClientConnected(activeClient))) {
    client = null;
    await startWppConnect();
    activeClient = client;
  }
  if (!activeClient || status !== "conectado") {
    throw new Error("WhatsApp ainda não está conectado. Leia o QR Code antes de enviar mensagens.");
  }
  return activeClient;
}

export async function stopWppConnect() {
  startRunId += 1;
  if (client?.close) await client.close();
  client = null;
  starting = null;
  status = "desconectado";
  qrCode = "";
}

export async function resetWppConnectSession() {
  await stopWppConnect();
  await rm(tokenSessionPath(), { recursive: true, force: true });
  lastError = "";
  lastStatus = "";
  status = "desconectado";
  qrCode = "";
}

export async function enviarTextoWppConnect(telefone: string, mensagem: string) {
  try {
    const activeClient = await getClient();
    const candidates = await resolveRecipientCandidates(activeClient, telefone);
    let lastError = "";

    for (const to of candidates) {
      try {
        const response = await sendTextResolved(activeClient, to, mensagem);
        return { ok: true, response };
      } catch (error) {
        lastError = traduzirErroWppConnect(error);
        if (!isNoLidError(error)) break;
      }
    }

    return { ok: false, error: lastError || "Não foi possível resolver o contato no WhatsApp." };
  } catch (error) {
    return { ok: false, error: traduzirErroWppConnect(error) };
  }
}

export async function enviarMidiaWppConnect(telefone: string, caminho: string, tipo: string, caption = "") {
  try {
    const activeClient = await getClient();
    const url = resolverUrlMidiaWpp(caminho);
    const [to] = await resolveRecipientCandidates(activeClient, telefone);
    const filename = fileNameFromUrl(url, "arquivo");

    if (tipo === "image" && activeClient.sendImage) {
      const response = await activeClient.sendImage(to, url, filename, caption);
      return { ok: true, response };
    }

    if (activeClient.sendFile) {
      const response = await activeClient.sendFile(to, url, filename, caption);
      return { ok: true, response };
    }

    return { ok: false, error: "Cliente WPPConnect não suporta envio de mídia nesta instalação." };
  } catch (error) {
    return { ok: false, error: traduzirErroWppConnect(error) };
  }
}

export async function enviarAudioWppConnect(telefone: string, caminho: string) {
  try {
    const activeClient = await getClient();
    const url = resolverUrlMidiaWpp(caminho);
    const [to] = await resolveRecipientCandidates(activeClient, telefone);
    if (activeClient.sendPtt) {
      const response = await activeClient.sendPtt(to, url);
      return { ok: true, response };
    }
    if (activeClient.sendFile) {
      const response = await activeClient.sendFile(to, url, fileNameFromUrl(url, "audio"), "");
      return { ok: true, response };
    }
    return { ok: false, error: "Cliente WPPConnect não suporta envio de áudio nesta instalação." };
  } catch (error) {
    return { ok: false, error: traduzirErroWppConnect(error) };
  }
}

export function startWppConnectIfConfigured() {
  if (env.whatsapp.driver === "wppconnect" && env.whatsapp.wppconnectAutoStart) {
    void startWppConnect().catch((error) => {
      console.error("Erro ao iniciar WPPConnect:", error);
    });
  }
}

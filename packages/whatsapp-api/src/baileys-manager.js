import fs from "node:fs";
import path from "node:path";
import qrcode from "qrcode";
import mime from "mime-types";
import pino from "pino";
import {
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeWASocket,
  useMultiFileAuthState,
} from "@whiskeysockets/baileys";
import { normalizeBrazilPhone, resolveSessionName, toJid } from "./utils.js";

const logger = pino({ level: process.env.LOG_LEVEL || "silent" });

export class BaileysSessionManager {
  constructor(options = {}) {
    this.sessionsDir = options.sessionsDir || path.resolve(process.cwd(), "sessions");
    this.defaultCountry = options.defaultCountry || "55";
    this.defaultSession = options.defaultSession || "default";
    this.sessions = new Map();
  }

  // Reconecta no boot todas as sessões que já têm credenciais salvas em disco,
  // para sobreviver a reinícios do servidor sem precisar reler o QR Code.
  async restoreSessions() {
    let names = [];
    try {
      names = fs.readdirSync(this.sessionsDir, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .filter((name) => fs.existsSync(path.join(this.sessionsDir, name, "creds.json")));
    } catch {
      return [];
    }
    for (const name of names) {
      // Não bloqueia o boot; se uma falhar, o reconnect automático assume.
      this.start(name).catch(() => {});
    }
    return names;
  }

  getState(sessionName) {
    const session = this.getOrCreateState(sessionName);
    return {
      session: session.name,
      status: session.status,
      qr: session.qr,
      qrImage: session.qrImage,
      pairingCode: session.pairingCode || "",
      lastError: session.lastError,
      connected: session.status === "conectado",
      rejectCalls: Boolean(session.rejectCalls),
    };
  }

  async start(sessionName) {
    const session = this.getOrCreateState(sessionName);
    if (session.socket && session.status === "conectado") return this.getState(session.name);
    if (session.starting) {
      await session.starting;
      return this.getState(session.name);
    }

    if (session.reconnectTimer) {
      clearTimeout(session.reconnectTimer);
      session.reconnectTimer = null;
    }
    session.reconnectAttempts = 0;
    session.status = "iniciando";
    session.lastError = "";

    session.starting = this.createSocket(session)
      .catch((error) => {
        session.status = "erro";
        session.lastError = error instanceof Error ? error.message : String(error);
        throw error;
      })
      .finally(() => {
        session.starting = null;
      });

    await session.starting;
    return this.getState(session.name);
  }

  async restart(sessionName) {
    await this.stop(sessionName);
    return this.start(sessionName);
  }

  // Desconecta o aparelho (logout) e apaga as credenciais, liberando a
  // vinculação de outro celular. Diferente de stop(), não reconecta sozinho.
  async logout(sessionName) {
    const session = this.getOrCreateState(sessionName);
    try {
      await session.socket?.logout?.();
    } catch {
      // Sessão já caída — segue para encerrar e limpar mesmo assim.
    }
    await this.stop(sessionName);
    this.clearCredentials(session);
    return this.getState(session.name);
  }

  // Conecta vinculando por CÓDIGO de 8 dígitos (sem QR Code), útil quando o
  // usuário tem só um celular e não consegue escanear o QR na própria tela.
  async startPairing(sessionName, phoneNumber) {
    const number = normalizeBrazilPhone(phoneNumber, this.defaultCountry);
    if (!number || number.length < 10) {
      throw new Error("Informe um número de telefone válido com DDD (ex.: 11999998888).");
    }
    await this.stop(sessionName);
    const session = this.getOrCreateState(sessionName);
    session.usePairingCode = true;
    session.pairingNumber = number;
    session.pairingCode = "";
    session.reconnectAttempts = 0;
    session.status = "iniciando";
    session.lastError = "";

    session.starting = this.createSocket(session)
      .catch((error) => {
        session.status = "erro";
        session.lastError = error instanceof Error ? error.message : String(error);
        throw error;
      })
      .finally(() => {
        session.starting = null;
      });

    await session.starting;
    return this.getState(session.name);
  }

  async stop(sessionName) {
    const session = this.getOrCreateState(sessionName);
    if (session.reconnectTimer) {
      clearTimeout(session.reconnectTimer);
      session.reconnectTimer = null;
    }
    session.reconnectAttempts = 0;
    try {
      session.socket?.end?.(undefined);
      session.socket?.ws?.close?.();
    } catch {
      // Ignora erros ao encerrar conexão antiga.
    }
    session.socket = null;
    session.starting = null;
    session.status = "desconectado";
    session.qr = "";
    session.qrImage = "";
    session.usePairingCode = false;
    session.pairingNumber = "";
    session.pairingCode = "";
    return this.getState(session.name);
  }

  async sendText(sessionName, number, body) {
    const socket = await this.requireConnectedSocket(sessionName);
    const jid = await this.resolveJid(socket, number);
    const response = await socket.sendMessage(jid, { text: String(body || "") });
    return { ok: true, response, messageId: response?.key?.id || "" };
  }

  async sendMedia(sessionName, number, mediaUrl, caption = "", kind = "image", fileName = "") {
    const socket = await this.requireConnectedSocket(sessionName);
    const { buffer, contentType } = await downloadBuffer(mediaUrl);
    const mimetype = contentType || mime.lookup(String(mediaUrl).split("?")[0]) || "application/octet-stream";
    const jid = await this.resolveJid(socket, number);
    const payload = buildMediaPayload(kind, buffer, mimetype, caption, fileName);
    // Documentos PDF: embute a miniatura da 1ª página para a prévia aparecer no celular.
    if (payload.document && String(mimetype).toLowerCase().includes("pdf")) {
      const thumb = await gerarThumbnailPdf(buffer);
      if (thumb) payload.jpegThumbnail = thumb;
    }
    const response = await socket.sendMessage(jid, payload);
    return { ok: true, response, messageId: response?.key?.id || "" };
  }

  // Confirma que o número tem WhatsApp e devolve o JID canônico retornado pelo
  // próprio WhatsApp (resolve, por ex., o 9º dígito de números brasileiros antigos).
  async resolveJid(socket, number) {
    const jid = toJid(number, this.defaultCountry);
    if (jid.endsWith("@g.us")) return jid; // grupos não passam por onWhatsApp
    try {
      const results = await socket.onWhatsApp(jid);
      const hit = Array.isArray(results) ? results.find((item) => item?.exists) : null;
      if (hit?.jid) return hit.jid;
      if (Array.isArray(results) && results.length > 0) {
        throw new Error(`Número sem WhatsApp: ${number}`);
      }
    } catch (error) {
      // Se a checagem em si falhar (rede/sessão), segue com o JID montado.
      if (error instanceof Error && error.message.startsWith("Número sem WhatsApp")) throw error;
    }
    return jid;
  }

  getOrCreateState(sessionName) {
    const name = resolveSessionName(sessionName, this.defaultSession);
    if (!this.sessions.has(name)) {
      this.sessions.set(name, {
        name,
        socket: null,
        starting: null,
        status: "desconectado",
        qr: "",
        qrImage: "",
        lastError: "",
        reconnectTimer: null,
        reconnectAttempts: 0,
        usePairingCode: false,
        pairingNumber: "",
        pairingCode: "",
        rejectCalls: this.loadRejectCalls(name),
      });
    }
    return this.sessions.get(name);
  }

  // Persiste em disco se a sessão deve recusar chamadas, para sobreviver a reinícios.
  rejectCallsFile(sessionName) {
    return path.join(this.sessionsDir, sessionName, "bloqueio.json");
  }

  loadRejectCalls(sessionName) {
    try {
      const raw = fs.readFileSync(this.rejectCallsFile(sessionName), "utf8");
      return Boolean(JSON.parse(raw)?.rejectCalls);
    } catch { return false; }
  }

  saveRejectCalls(sessionName, value) {
    try {
      fs.mkdirSync(path.join(this.sessionsDir, sessionName), { recursive: true });
      fs.writeFileSync(this.rejectCallsFile(sessionName), JSON.stringify({ rejectCalls: Boolean(value) }));
    } catch {
      // Se não conseguir gravar, ainda mantém em memória — sumirá no próximo restart.
    }
  }

  setRejectCalls(sessionName, value) {
    const session = this.getOrCreateState(sessionName);
    session.rejectCalls = Boolean(value);
    this.saveRejectCalls(session.name, session.rejectCalls);
    return session.rejectCalls;
  }

  async requireConnectedSocket(sessionName) {
    const session = this.getOrCreateState(sessionName);
    if (!session.socket || session.status !== "conectado") {
      throw new Error("WhatsApp não conectado. Gere o QR Code, leia no celular e tente novamente.");
    }
    return session.socket;
  }

  async createSocket(session) {
    fs.mkdirSync(this.sessionsDir, { recursive: true });
    const sessionDir = path.join(this.sessionsDir, session.name);
    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
    const { version } = await fetchLatestBaileysVersion();

    const socket = makeWASocket({
      version,
      auth: state,
      printQRInTerminal: false,
      browser: ["Gestor WhatsApp API", "Chrome", "1.0.0"],
      logger,
    });

    session.socket = socket;
    socket.ev.on("creds.update", saveCreds);

    // Recusa chamadas de voz/vídeo enquanto bloqueio_chamadas estiver ativo.
    // Só age em "offer" (chamada chegando) — ignora ringing/accept/timeout/reject.
    socket.ev.on("call", async (events) => {
      if (!session.rejectCalls) return;
      for (const ev of events || []) {
        if (ev?.status !== "offer" || !ev?.id || !ev?.from) continue;
        try { await socket.rejectCall(ev.id, ev.from); } catch { /* ignora falhas pontuais */ }
      }
    });

    socket.ev.on("connection.update", async (update) => {
      const { connection, lastDisconnect, qr } = update;

      // No modo de pareamento por código, ignoramos o QR (mostramos só o código).
      if (qr && !session.usePairingCode) {
        session.qr = qr;
        session.qrImage = await qrcode.toDataURL(qr);
        session.status = "qr";
      }

      if (connection === "open") {
        session.status = "conectado";
        session.qr = "";
        session.qrImage = "";
        session.lastError = "";
        session.reconnectAttempts = 0;
        session.usePairingCode = false;
        session.pairingNumber = "";
        session.pairingCode = "";
      }

      if (connection === "close") {
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const loggedOut = statusCode === DisconnectReason.loggedOut;
        session.socket = null;
        session.lastError = lastDisconnect?.error?.message || "Conexão fechada.";

        if (loggedOut) {
          // Sessão encerrada no celular: credenciais salvas ficam inválidas.
          // Apaga a pasta para o próximo start gerar um QR Code novo.
          session.status = "desconectado";
          session.qr = "";
          session.qrImage = "";
          this.clearCredentials(session);
        } else {
          // Quedas transitórias (515 restart, 428, 408...): reconecta sozinho.
          session.status = "reconectando";
          this.scheduleReconnect(session);
        }
      }
    });

    // Pareamento por código: se pedido e ainda não registrado, solicita o código
    // de 8 dígitos para o número informado (sem QR).
    if (session.usePairingCode && session.pairingNumber && !state.creds.registered) {
      try {
        await new Promise((resolve) => setTimeout(resolve, 1500));
        const code = await socket.requestPairingCode(session.pairingNumber);
        session.pairingCode = code;
        session.status = "pairing";
      } catch (error) {
        session.lastError = errorMessage(error);
      }
    }

    return socket;
  }

  // Reconecta com backoff exponencial (2s, 4s, 8s... até 30s), sem dar overlap
  // com um start manual nem com outro reconnect em andamento.
  scheduleReconnect(session) {
    if (session.reconnectTimer || session.starting) return;
    const attempt = (session.reconnectAttempts || 0) + 1;
    session.reconnectAttempts = attempt;
    const delay = Math.min(30_000, 2_000 * 2 ** (attempt - 1));
    session.reconnectTimer = setTimeout(() => {
      session.reconnectTimer = null;
      if (session.starting || (session.socket && session.status === "conectado")) return;
      session.starting = this.createSocket(session)
        .catch((error) => {
          session.status = "erro";
          session.lastError = error instanceof Error ? error.message : String(error);
          this.scheduleReconnect(session);
        })
        .finally(() => {
          session.starting = null;
        });
    }, delay);
  }

  clearCredentials(session) {
    try {
      fs.rmSync(path.join(this.sessionsDir, session.name), { recursive: true, force: true });
    } catch {
      // Ignora se a pasta não existir ou estiver em uso.
    }
  }
}

export async function downloadBuffer(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Falha ao baixar mídia: HTTP ${response.status}`);
  const arrayBuffer = await response.arrayBuffer();
  return {
    buffer: Buffer.from(arrayBuffer),
    contentType: response.headers.get("content-type") || "",
  };
}

// Carrega a mupdf (WASM) só uma vez. Import dinâmico: se a lib não estiver
// disponível, o erro fica contido aqui e o envio segue sem miniatura.
let _mupdfPromise = null;
function carregarMupdf() {
  if (!_mupdfPromise) _mupdfPromise = import("mupdf");
  return _mupdfPromise;
}

/**
 * Gera uma miniatura JPEG (base64) da 1ª página de um PDF, para o WhatsApp mostrar
 * a prévia do documento no celular. Defensivo: qualquer falha retorna "" e o
 * envio continua normalmente, só sem a prévia.
 */
export async function gerarThumbnailPdf(pdfBuffer) {
  try {
    const mupdf = await carregarMupdf();
    const doc = mupdf.Document.openDocument(pdfBuffer, "application/pdf");
    if (doc.countPages() < 1) return "";
    const page = doc.loadPage(0);
    const bounds = page.getBounds();
    const largura = Math.max(1, bounds[2] - bounds[0]);
    const escala = Math.min(2, 400 / largura); // alvo ~400px de largura
    const pix = page.toPixmap(mupdf.Matrix.scale(escala, escala), mupdf.ColorSpace.DeviceRGB, false);
    const jpeg = pix.asJPEG(70);
    return Buffer.from(jpeg).toString("base64");
  } catch (error) {
    logger.warn({ err: error?.message }, "falha ao gerar miniatura do PDF");
    return "";
  }
}

export function buildMediaPayload(kind, buffer, mimetype, caption = "", fileName = "") {
  const normalized = String(kind || "image").toLowerCase();
  if (normalized === "audio") return { audio: buffer, mimetype, ptt: true };
  if (normalized === "video") return { video: buffer, mimetype, caption };
  if (normalized === "document") return { document: buffer, mimetype, fileName: fileName || "arquivo", caption };
  return { image: buffer, mimetype, caption };
}

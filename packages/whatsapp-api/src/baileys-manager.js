import fs from "node:fs";
import path from "node:path";
import qrcode from "qrcode";
import mime from "mime-types";
import pino from "pino";
import {
  DisconnectReason,
  fetchLatestBaileysVersion,
  generateWAMessage,
  generateMessageIDV2,
  makeWASocket,
  jidNormalizedUser,
  useMultiFileAuthState,
} from "@whiskeysockets/baileys";
import { normalizeBrazilPhone, resolveSessionName, toJid } from "./utils.js";

const logger = pino({ level: process.env.LOG_LEVEL || "silent" });

// Nome legivel de cada statusCode de desconexao do Baileys, pra o log dizer
// "440 connectionReplaced" em vez de so um numero. Montado invertendo o enum
// DisconnectReason (resiliente se a lib trocar os valores numa atualizacao).
const DISCONNECT_REASON_NAMES = Object.fromEntries(
  Object.entries(DisconnectReason).map(([nome, codigo]) => [codigo, nome]),
);
function nomeMotivoDesconexao(statusCode) {
  return DISCONNECT_REASON_NAMES[statusCode]
    || (statusCode === 405 ? "connectionFailure" : "desconhecido");
}

// Rejeita chamada usando a API nativa do Baileys quando disponivel; caso a
// versao em uso nao exponha rejectCall, monta o stanza manualmente. Isso
// torna o bloqueio resiliente a mudancas internas da lib.
async function rejectCallSafe(socket, callId, callFrom) {
  if (typeof socket?.rejectCall === "function") {
    return socket.rejectCall(callId, callFrom);
  }
  const me = socket?.user?.id || socket?.authState?.creds?.me?.id;
  if (!me) throw new Error("Sessao sem usuario autenticado");
  if (typeof socket?.sendNode !== "function") throw new Error("sendNode indisponivel");
  return socket.sendNode({
    tag: "call",
    attrs: { from: me, to: callFrom },
    content: [{ tag: "reject", attrs: { "call-id": callId, "call-creator": callFrom, count: "0" } }],
  });
}

// Cache de JID resolvido por onWhatsApp(). 24h pra positivos, 1h pra negativos.
// Compartilhado entre todas as sessões — chave inclui o id do usuário do socket
// pra evitar colisão se outra sessão consultar o mesmo número.
const jidCache = new Map();
const JID_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

// Guarda as ultimas mensagens (enviadas/recebidas) por id, por sessao. Serve pro
// getMessage do Baileys responder a "retry receipts": quando o aparelho do
// destinatario nao consegue descriptografar, ele pede reenvio; sem a mensagem
// original guardada, ela fica eternamente como "Aguardando mensagem" no WhatsApp
// dele. Cap de tamanho (LRU simples) pra nao vazar memoria.
const MSG_STORE_MAX = 1500;
function rememberMessage(session, id, message) {
  if (!session || !id || !message) return;
  const store = session.msgStore || (session.msgStore = new Map());
  if (store.has(id)) store.delete(id); // reordena pro fim (mais recente)
  store.set(id, message);
  if (store.size > MSG_STORE_MAX) {
    const oldest = store.keys().next().value;
    store.delete(oldest);
  }
}

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
    // Número conectado (JID do aparelho, ex.: "5531999998888:7@s.whatsapp.net").
    // Pega só os dígitos antes de ":" ou "@".
    const rawJid = session.socket?.user?.id || "";
    const number = rawJid ? rawJid.split(/[:@]/)[0].replace(/\D+/g, "") : "";
    return {
      session: session.name,
      status: session.status,
      qr: session.qr,
      qrImage: session.qrImage,
      pairingCode: session.pairingCode || "",
      lastError: session.lastError,
      connected: session.status === "conectado",
      number,
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
    // Apaga creds antigas no disco. Sem isso, se a sessão já tinha sido pareada
    // antes, useMultiFileAuthState carrega state.creds.registered === true e o
    // bloco do requestPairingCode (em createSocket) é pulado — resposta volta sem
    // pairingCode e o painel fica preso em "Conectando...".
    this.clearCredentials(session);
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
    const session = this.getOrCreateState(sessionName);
    const jid = await this.resolveJid(socket, number);
    await simularDigitacao(socket, jid, String(body || ""));
    const response = await socket.sendMessage(jid, { text: String(body || "") });
    rememberMessage(session, response?.key?.id, response?.message);
    return { ok: true, response, messageId: response?.key?.id || "" };
  }

  // Publica um Status (story) do WhatsApp. Tipo:
  //   - "text":  { text, backgroundColor?, font? }
  //   - "image": { mediaUrl, caption? }
  //   - "video": { mediaUrl, caption? }
  // statusJidList: lista de JIDs que verão o status. Se vazio, envia pra todos
  // os contatos conhecidos da sessão.
  async sendStatus(sessionName, type, payload, statusJidList) {
    const socket = await this.requireConnectedSocket(sessionName);
    const session = this.getOrCreateState(sessionName);
    const normalized = String(type || "text").toLowerCase();

    let message;
    if (normalized === "text") {
      const texto = String(payload?.text || "");
      if (!texto.trim()) throw new Error("Texto do status é obrigatório.");
      message = {
        text: texto,
        ...(payload?.backgroundColor ? { backgroundColor: String(payload.backgroundColor) } : {}),
        ...(payload?.font != null ? { font: Number(payload.font) } : {}),
      };
    } else if (normalized === "image" || normalized === "video") {
      if (!payload?.mediaUrl) throw new Error("URL da mídia é obrigatória.");
      const { buffer, contentType } = await downloadBuffer(String(payload.mediaUrl));
      const mimetype = contentType || mime.lookup(String(payload.mediaUrl).split("?")[0]) ||
        (normalized === "video" ? "video/mp4" : "image/jpeg");
      message = normalized === "video"
        ? { video: buffer, mimetype, caption: String(payload.caption || "") }
        : { image: buffer, mimetype, caption: String(payload.caption || "") };
    } else {
      throw new Error(`Tipo de status inválido: ${type}. Use "text", "image" ou "video".`);
    }

    // Lista de quem verá. Se não informada, usa todos os contatos válidos da sessão.
    const normalizeRecipient = (jid) => {
      const raw = String(jid || "");
      return /^\d+(?::\d+)?@(s\.whatsapp\.net|lid)$/.test(raw) ? jidNormalizedUser(raw) : "";
    };
    const knownContacts = [...(session.statusContacts || [])];
    const supplied = Array.isArray(statusJidList) && statusJidList.length ? statusJidList : knownContacts;
    let destinatarios = [...new Set(supplied.map(normalizeRecipient).filter(Boolean))];
    const selfJid = normalizeRecipient(socket.user?.id);
    const selfLid = normalizeRecipient(socket.user?.lid);
    if (!destinatarios.some(jid => jid !== selfJid && jid !== selfLid)) {
      throw new Error("Os contatos do WhatsApp ainda não foram sincronizados. Reconecte o dispositivo e aguarde a sincronização antes de publicar status.");
    }
    // LID accounts must resolve phone aliases BEFORE device enumeration.
    // A mixed audience can produce empty device lists and ack 479.
    let skippedRecipientCount = 0;
    if (selfLid) {
      const phoneRecipients = destinatarios.filter(jid => jid.endsWith('@s.whatsapp.net') && jid !== selfJid);
      const mapped = new Map();
      const resolver = socket.signalRepository?.lidMapping;
      if (phoneRecipients.length && !resolver?.getLIDsForPNs) {
        throw new Error("API WhatsApp sem suporte para resolver os contatos do status.");
      }
      // Bound USync requests for large contact lists.
      for (let i = 0; i < phoneRecipients.length; i += 100) {
        const pairs = await resolver.getLIDsForPNs(phoneRecipients.slice(i, i + 100));
        for (const pair of pairs || []) {
          const lid = normalizeRecipient(pair.lid);
          if (lid.endsWith('@lid')) mapped.set(normalizeRecipient(pair.pn), lid);
        }
      }
      const unresolved = phoneRecipients.filter(jid => !mapped.has(jid));
      skippedRecipientCount = unresolved.length;
      // Keep unresolved contacts in the store: later publications can resolve
      // them again. Never relay PN aliases into an LID audience.
      destinatarios = [...new Set(destinatarios.map(jid =>
        jid === selfJid ? selfLid : jid.endsWith('@lid') ? jid : mapped.get(jid)
      ).filter(Boolean).concat(selfLid))];
      if (!destinatarios.some(jid => jid !== selfLid)) {
        throw new Error(`Não foi possível sincronizar ${unresolved.length} contato(s) para o status. Nenhum destinatário disponível além da própria conta.`);
      }
      if (skippedRecipientCount) logger.warn({ session: sessionName, skippedRecipientCount }, 'Status audience excludes unresolved contacts');
    } else {
      if (destinatarios.some(jid => jid.endsWith('@lid'))) {
        throw new Error("A identidade do WhatsApp ainda precisa ser sincronizada. Reconecte o dispositivo.");
      }
      if (selfJid && !destinatarios.includes(selfJid)) destinatarios.push(selfJid);
    }

    const response = await generateWAMessage("status@broadcast", message, {
      userJid: socket.user.id, upload: socket.waUploadToServer, logger,
      messageId: generateMessageIDV2(socket.user.id),
      ...(normalized === "text" ? { backgroundColor: payload?.backgroundColor || "#075E54", font: Number(payload?.font ?? 1) } : {}),
    });
    rememberMessage(session, response.key.id, response.message);
    // Register before relay: the ack can arrive before sending returns.
    const confirmation = socket.waitForMessage(response.key.id, 120_000)
      .then(node => ({ node }), error => ({ error }));
    await socket.relayMessage("status@broadcast", response.message, {
      messageId: response.key.id, statusJidList: destinatarios,
    });
    const { node, error } = await confirmation;
    if (error || !node || node.tag !== "ack" || node.attrs?.class !== "message") {
      throw new Error("O WhatsApp não confirmou a publicação. Confira Meu status no celular antes de tentar novamente.");
    }
    if (node.attrs?.error) throw new Error(`O WhatsApp recusou a publicação do status (código ${node.attrs.error}).`);
    return { ok: true, messageId: response.key.id, recipientCount: destinatarios.length, skippedRecipientCount, confirmed: true };
  }

  async sendMedia(sessionName, number, mediaUrl, caption = "", kind = "image", fileName = "") {
    const socket = await this.requireConnectedSocket(sessionName);
    const session = this.getOrCreateState(sessionName);
    const { buffer, contentType } = await downloadBuffer(mediaUrl);
    const mimetype = contentType || mime.lookup(String(mediaUrl).split("?")[0]) || "application/octet-stream";
    const jid = await this.resolveJid(socket, number);
    const payload = buildMediaPayload(kind, buffer, mimetype, caption, fileName);
    // Documentos PDF: embute a miniatura da 1ª página para a prévia aparecer no celular.
    if (payload.document && String(mimetype).toLowerCase().includes("pdf")) {
      const thumb = await gerarThumbnailPdf(buffer);
      if (thumb) payload.jpegThumbnail = thumb;
    }
    await simularDigitacao(socket, jid, caption || "");
    const response = await socket.sendMessage(jid, payload);
    rememberMessage(session, response?.key?.id, response?.message);
    return { ok: true, response, messageId: response?.key?.id || "" };
  }

  // Confirma que o número tem WhatsApp e devolve o JID canônico retornado pelo
  // próprio WhatsApp (resolve, por ex., o 9º dígito de números brasileiros antigos).
  // Cache 24h por sessão+número: cliente que recebe 4 msgs/mês não dispara 4
  // chamadas onWhatsApp ao WA (cada chamada pode contar contra rate limits).
  async resolveJid(socket, number) {
    const jid = toJid(number, this.defaultCountry);
    if (jid.endsWith("@g.us")) return jid; // grupos não passam por onWhatsApp

    const cacheKey = `${socket.user?.id || "session"}:${jid}`;
    const cached = jidCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      if (cached.naoExiste) throw new Error(`Número sem WhatsApp: ${number}`);
      return cached.jid;
    }

    try {
      const results = await socket.onWhatsApp(jid);
      const hit = Array.isArray(results) ? results.find((item) => item?.exists) : null;
      if (hit?.jid) {
        jidCache.set(cacheKey, { jid: hit.jid, naoExiste: false, expiresAt: Date.now() + JID_CACHE_TTL_MS });
        return hit.jid;
      }
      if (Array.isArray(results) && results.length > 0) {
        // Negativa também vai pro cache (TTL menor: 1h) — número pode passar a
        // ter WhatsApp depois, não queremos negar pra sempre.
        jidCache.set(cacheKey, { jid, naoExiste: true, expiresAt: Date.now() + 60 * 60 * 1000 });
        throw new Error(`Número sem WhatsApp: ${number}`);
      }
    } catch (error) {
      // Se a checagem em si falhar (rede/sessão), segue com o JID montado.
      if (error instanceof Error && error.message.startsWith("Número sem WhatsApp")) throw error;
    }
    return jid;
  }

  // Checa em lote se cada número tem WhatsApp (via onWhatsApp), reaproveitando o
  // jidCache do resolveJid. Retorna [{ number, exists, jid, incerto? }].
  // incerto=true quando a checagem em si falhou (rede/sessão) — nesses casos NÃO
  // afirmamos que o número não existe, para não descartá-lo por engano.
  async checkNumbers(sessionName, numbers) {
    const socket = await this.requireConnectedSocket(sessionName);
    const lista = Array.isArray(numbers) ? numbers : [];
    const out = [];
    for (const raw of lista) {
      const number = normalizeBrazilPhone(raw, this.defaultCountry);
      if (!number || number.length < 10) {
        out.push({ number: String(raw || ""), exists: false, jid: "" });
        continue;
      }
      const jid = toJid(number, this.defaultCountry);
      const cacheKey = `${socket.user?.id || "session"}:${jid}`;
      const cached = jidCache.get(cacheKey);
      if (cached && cached.expiresAt > Date.now()) {
        out.push({ number, exists: !cached.naoExiste, jid: cached.naoExiste ? "" : cached.jid });
        continue;
      }
      try {
        const results = await socket.onWhatsApp(jid);
        const hit = Array.isArray(results) ? results.find((item) => item?.exists) : null;
        if (hit?.jid) {
          jidCache.set(cacheKey, { jid: hit.jid, naoExiste: false, expiresAt: Date.now() + JID_CACHE_TTL_MS });
          out.push({ number, exists: true, jid: hit.jid });
        } else {
          jidCache.set(cacheKey, { jid, naoExiste: true, expiresAt: Date.now() + 60 * 60 * 1000 });
          out.push({ number, exists: false, jid: "" });
        }
      } catch {
        out.push({ number, exists: true, jid, incerto: true });
      }
    }
    return out;
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
        statusContacts: this.loadStatusContacts(name),
      });
    }
    return this.sessions.get(name);
  }

  // Persiste em disco se a sessão deve recusar chamadas, para sobreviver a reinícios.
  loadStatusContacts(sessionName) {
    try {
      const contacts = JSON.parse(fs.readFileSync(path.join(this.sessionsDir, sessionName, "status-contacts.json"), "utf8"));
      return new Set(Array.isArray(contacts) ? contacts : []);
    } catch { return new Set(); }
  }

  rememberStatusContacts(session, contacts) {
    const known = session.statusContacts || (session.statusContacts = new Set());
    const previousSize = known.size;
    for (const contact of contacts || []) {
      const raw = String(contact.phoneNumber || contact.id || "");
      if (/^\d+(?::\d+)?@(s\.whatsapp\.net|lid)$/.test(raw)) known.add(jidNormalizedUser(raw));
    }
    if (known.size === previousSize) return;
    try {
      fs.mkdirSync(path.join(this.sessionsDir, session.name), { recursive: true });
      fs.writeFileSync(path.join(this.sessionsDir, session.name, "status-contacts.json"), JSON.stringify([...known]));
    } catch (error) {
      logger.warn({ err: error?.message, session: session.name }, "Falha ao salvar contatos de status");
    }
  }

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
    logger.info({ session: session.name, rejectCalls: session.rejectCalls }, "Bloqueio de chamadas atualizado");
    return session.rejectCalls;
  }

  async requireConnectedSocket(sessionName) {
    const session = this.getOrCreateState(sessionName);
    if (session.socket && session.status === "conectado") return session.socket;

    // Estados transientes (reconectando/iniciando/pairing-em-andamento): espera
    // até 10s a sessao estabilizar antes de jogar erro. Resolve o cenario classico
    // de "primeiro envio apos reconexao" — o socket ja existe, mas ainda nao
    // terminou o handshake. Sem essa espera, o cron/disparo manual perde a
    // primeira mensagem do lote toda vez que ha uma reconexao recente.
    const podeEstabilizar = (s) => s === "reconectando" || s === "iniciando" || s === "pairing";
    if (session.socket && podeEstabilizar(session.status)) {
      const inicio = Date.now();
      while (Date.now() - inicio < 10_000) {
        await new Promise((r) => setTimeout(r, 500));
        if (session.socket && session.status === "conectado") return session.socket;
        if (!session.socket || session.status === "desconectado" || session.status === "erro") break;
      }
    }
    throw new Error("WhatsApp não conectado. Gere o QR Code, leia no celular e tente novamente.");
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
      browser: ["IXTV Gestor", "Chrome", "1.0.0"],
      // Não força "online" ao conectar — quem olha o chip vê "visto por último",
      // comportamento de chip humano que abre o app só pra mandar mensagem.
      markOnlineOnConnect: false,
      // Gera a prévia rica de links (card com imagem do site) nas mensagens de
      // texto que contêm uma URL — usa a OG image/título do site. Requer a lib
      // link-preview-js instalada (dependência declarada). "true" sobe a imagem
      // em alta qualidade (card grande, como no WhatsApp normal).
      generateHighQualityLinkPreview: true,
      logger,
      // Responde aos "retry receipts": quando o aparelho do destinatario nao
      // consegue descriptografar e pede reenvio, o Baileys busca a mensagem
      // original aqui pra re-encriptar e reenviar. SEM isso, a mensagem fica
      // eternamente como "Aguardando mensagem. Essa acao pode levar alguns
      // instantes." no WhatsApp do cliente.
      getMessage: async (key) => {
        const stored = session.msgStore && key?.id ? session.msgStore.get(key.id) : null;
        return stored || undefined;
      },
    });

    session.msgStore = session.msgStore || new Map();
    session.socket = socket;
    socket.ev.on("creds.update", saveCreds);
    socket.ev.on("messaging-history.set", ({ contacts }) => this.rememberStatusContacts(session, contacts));
    socket.ev.on("contacts.upsert", contacts => this.rememberStatusContacts(session, contacts));
    socket.ev.on("contacts.update", contacts => this.rememberStatusContacts(session, contacts));

    // Memoriza toda mensagem (enviada e recebida) por id, pra o getMessage acima
    // conseguir reenviar quando o destinatario pedir retry (falha de descripto).
    socket.ev.on("messages.upsert", ({ messages }) => {
      for (const m of messages || []) {
        if (m?.key?.id && m.message) rememberMessage(session, m.key.id, m.message);
      }
    });

    // Recusa chamadas de voz/vídeo enquanto bloqueio_chamadas estiver ativo.
    // Rejeita em qualquer status nao-terminal: algumas versoes do Baileys
    // emitem so "ringing" antes de "offer", outras o contrario — bloqueando
    // so em "offer" perdiamos chamadas. Status terminais (accept/reject/
    // timeout) sao ignorados pra evitar reenvio em loop.
    socket.ev.on("call", async (events) => {
      if (!session.rejectCalls) return;
      for (const ev of events || []) {
        if (!ev?.id || !ev?.from) continue;
        if (ev.status === "accept" || ev.status === "reject" || ev.status === "timeout") continue;
        try {
          await rejectCallSafe(socket, ev.id, ev.from);
          logger.info({ session: session.name, callId: ev.id, from: ev.from, status: ev.status }, "Chamada rejeitada");
        } catch (err) {
          logger.warn({ err: err?.message || String(err), session: session.name, callId: ev.id, from: ev.from }, "Falha ao rejeitar chamada");
        }
      }
    });

    // Não marca mensagens como lidas automaticamente — usuário prefere abrir
    // o WhatsApp no celular e ver o que é novo (indicador de não-lida intacto).

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
        // "Connection Failure" (405): o WhatsApp RECUSOU a conexão. Durante o
        // pareamento isso é quase sempre excesso de tentativas (rate limit).
        const recusado = statusCode === 405;
        // 440 (connectionReplaced): a MESMA sessão foi aberta em outro lugar —
        // outra instância do serviço lendo a mesma pasta ./sessions, ou WhatsApp
        // Web com este número. Reconectar aqui só faz as duas instâncias brigarem
        // em loop (cada reconexão derruba a outra), então NÃO reconecta.
        const substituido = statusCode === DisconnectReason.connectionReplaced;
        const emPareamento = session.usePairingCode; // ainda não abriu a conexão
        session.socket = null;
        session.lastError = lastDisconnect?.error?.message || "Conexão fechada.";

        // Loga SEMPRE o motivo (número + nome) pra dar pra diagnosticar depois
        // "por que o WhatsApp caiu" olhando o log da Hostinger (LOG_LEVEL=info).
        logger.warn(
          { session: session.name, statusCode, motivo: nomeMotivoDesconexao(statusCode), erro: session.lastError },
          "Conexão do WhatsApp fechada",
        );

        if (loggedOut) {
          // Sessão encerrada no celular: credenciais salvas ficam inválidas.
          // Apaga a pasta para o próximo start gerar um QR Code novo.
          session.status = "desconectado";
          session.qr = "";
          session.qrImage = "";
          this.clearCredentials(session);
        } else if (recusado && emPareamento) {
          // NÃO reconectar em loop: cada reconexão pede um novo código e piora o
          // bloqueio. Para, limpa o estado de pareamento e orienta o usuário.
          session.status = "erro";
          session.usePairingCode = false;
          session.pairingNumber = "";
          session.pairingCode = "";
          session.lastError =
            "O WhatsApp recusou a conexão (excesso de tentativas). Aguarde 10-15 minutos antes de tentar de novo e, se possível, use o QR Code em vez do código.";
          this.clearCredentials(session);
        } else if (substituido) {
          // Conflito de instâncias: parar aqui evita o loop de reconexão. NÃO
          // apaga credenciais (a sessão ainda é válida — só está sendo usada em
          // dois lugares); o usuário fecha a outra conexão e clica em Reconectar.
          session.status = "erro";
          session.lastError =
            "A sessão foi aberta em outro lugar (outra instância do serviço ou WhatsApp Web com este número). Feche a outra conexão e clique em Reconectar. Se você não abriu em lugar nenhum, um processo antigo do serviço pode ter ficado rodando depois de um deploy.";
        } else {
          // Quedas transitórias (515 restart, 428, 408...): reconecta sozinho.
          session.status = "reconectando";
          this.scheduleReconnect(session);
        }
      }
    });

    // Pareamento por código: se pedido e ainda não registrado, solicita o código
    // de 8 dígitos para o número informado (sem QR).
    // O requestPairingCode falha se chamado cedo demais (socket ainda abrindo),
    // então tentamos algumas vezes com intervalo crescente antes de desistir.
    if (session.usePairingCode && session.pairingNumber && !state.creds.registered) {
      // No máximo 2 tentativas: cada requestPairingCode é uma solicitação real ao
      // WhatsApp; pedir muitas em sequência também contribui para o rate limit.
      let code = "";
      let ultimoErro = null;
      for (let tentativa = 1; tentativa <= 2 && !code; tentativa++) {
        try {
          await new Promise((resolve) => setTimeout(resolve, tentativa === 1 ? 3000 : 4000));
          if (state.creds.registered) break; // pareou nesse meio-tempo (ex.: QR lido)
          code = await socket.requestPairingCode(session.pairingNumber);
        } catch (error) {
          ultimoErro = error;
        }
      }
      if (code) {
        session.pairingCode = code;
        session.status = "pairing";
        session.lastError = "";
      } else {
        session.status = "erro";
        session.lastError = ultimoErro
          ? `Não foi possível gerar o código: ${errorMessage(ultimoErro)}`
          : "Não foi possível gerar o código de pareamento. Tente novamente.";
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
    session.statusContacts = new Set();
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

// Simula digitação antes do envio. Duração proporcional ao tamanho do texto,
// limitada entre 800ms e 3500ms. Mídia sem caption ainda mostra "digitando"
// um pouquinho — é como o WhatsApp normal faz quando você vai mandar foto.
// Qualquer falha é silenciosa: presence é cosmético, não pode bloquear o envio.
export async function simularDigitacao(socket, jid, texto) {
  try {
    const tamanho = String(texto || "").length;
    const durMs = Math.min(3500, Math.max(800, 250 + tamanho * 35));
    await socket.sendPresenceUpdate("composing", jid);
    await new Promise((resolve) => setTimeout(resolve, durMs));
    await socket.sendPresenceUpdate("paused", jid);
  } catch {
    // presence falhou — segue o envio normalmente.
  }
}

export function buildMediaPayload(kind, buffer, mimetype, caption = "", fileName = "") {
  const normalized = String(kind || "image").toLowerCase();
  if (normalized === "audio") return { audio: buffer, mimetype, ptt: true };
  if (normalized === "video") return { video: buffer, mimetype, caption };
  if (normalized === "document") return { document: buffer, mimetype, fileName: fileName || "arquivo", caption };
  return { image: buffer, mimetype, caption };
}

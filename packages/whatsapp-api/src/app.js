import express from "express";
import { requireToken } from "./auth.js";

export function createApp({ manager, apiToken }) {
  const app = express();

  // 8mb cobre imagem/áudio/doc do WhatsApp (limites do próprio WA: imagem 16mb,
  // áudio 16mb, mas o caminho normal é < 8mb). Antes 20mb permitia DoS trivial.
  app.use(express.json({ limit: "8mb" }));
  app.use(express.urlencoded({ extended: true, limit: "8mb" }));

  // Health check — minimalista, não revela nome de serviço. Scanner que bata
  // aqui sem token só vê "ok:true" e não consegue identificar o que está rodando.
  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.use(requireToken(apiToken));

  app.get("/session/status/:session", (req, res) => {
    res.json({ ok: true, ...manager.getState(req.params.session) });
  });

  app.get("/session/qr/:session", (req, res) => {
    res.json({ ok: true, ...manager.getState(req.params.session) });
  });

  app.post("/session/start/:session", async (req, res) => {
    try {
      const state = await manager.start(req.params.session);
      res.json({ ok: true, ...state });
    } catch (error) {
      res.status(500).json({ ok: false, error: errorMessage(error) });
    }
  });

  app.post("/session/restart/:session", async (req, res) => {
    try {
      const state = await manager.restart(req.params.session);
      res.json({ ok: true, ...state });
    } catch (error) {
      res.status(500).json({ ok: false, error: errorMessage(error) });
    }
  });

  // Desconecta o aparelho (logout) e libera a vinculação de outro número.
  app.post("/session/logout/:session", async (req, res) => {
    try {
      const state = await manager.logout(req.params.session);
      res.json({ ok: true, ...state });
    } catch (error) {
      res.status(500).json({ ok: false, error: errorMessage(error) });
    }
  });

  // Vincula por CÓDIGO de 8 dígitos (sem QR). Recebe o número de telefone.
  app.post("/session/pair/:session", async (req, res) => {
    try {
      const number = req.body.number || req.body.phone || req.body.telefone || req.body.phoneNumber;
      if (!number) return res.status(400).json({ ok: false, error: "Informe o número de telefone com DDD." });
      const state = await manager.startPairing(req.params.session, number);
      res.json({ ok: true, ...state });
    } catch (error) {
      res.status(500).json({ ok: false, error: errorMessage(error) });
    }
  });

  // Liga/desliga rejeição automática de chamadas para esta sessão.
  // Aceita { enabled: boolean } no corpo (também tolera "1"/"true").
  app.post("/session/calls-block/:session", (req, res) => {
    try {
      const v = req.body?.enabled ?? req.body?.value ?? req.body?.bloqueio;
      const enabled = v === true || v === 1 || v === "1" || v === "true" || v === "on";
      const result = manager.setRejectCalls(req.params.session, enabled);
      res.json({ ok: true, session: req.params.session, rejectCalls: result });
    } catch (error) {
      res.status(500).json({ ok: false, error: errorMessage(error) });
    }
  });

  // Checa em lote se cada número tem WhatsApp (usado pelo painel antes de disparar).
  app.post("/api/numbers/check", async (req, res) => {
    try {
      const session = req.body.session || req.body.sessao || req.body.sessionName;
      const numbers = Array.isArray(req.body.numbers)
        ? req.body.numbers
        : (Array.isArray(req.body.numeros) ? req.body.numeros : []);
      if (!numbers.length) return res.status(400).json({ ok: false, error: "Informe a lista de numbers." });
      const results = await manager.checkNumbers(session, numbers);
      res.json({ ok: true, results });
    } catch (error) {
      res.status(500).json({ ok: false, error: errorMessage(error) });
    }
  });

  app.post("/api/messages/send", async (req, res) => {
    try {
      const session = req.body.session || req.body.sessao || req.body.sessionName;
      const number = req.body.number || req.body.to || req.body.telefone;
      const body = req.body.body || req.body.text || req.body.mensagem;
      if (!number || !body) return res.status(400).json({ ok: false, error: "number e body são obrigatórios." });
      const result = await manager.sendText(session, number, body);
      res.json(result);
    } catch (error) {
      res.status(500).json({ ok: false, error: errorMessage(error) });
    }
  });

  app.post("/api/messages/send/media", async (req, res) => {
    try {
      const session = req.body.session || req.body.sessao || req.body.sessionName;
      const number = req.body.number || req.body.to || req.body.telefone;
      const mediaUrl = req.body.mediaUrl || req.body.url || req.body.media;
      const caption = req.body.caption || req.body.body || "";
      const kind = req.body.type || req.body.kind || "image";
      const fileName = req.body.fileName || req.body.filename || "";
      if (!number || !mediaUrl) return res.status(400).json({ ok: false, error: "number e mediaUrl são obrigatórios." });
      const result = await manager.sendMedia(session, number, mediaUrl, caption, kind, fileName);
      res.json(result);
    } catch (error) {
      res.status(500).json({ ok: false, error: errorMessage(error) });
    }
  });

  // Publica um Status (story) — texto com cor de fundo, imagem ou vídeo.
  app.post("/api/status/send", async (req, res) => {
    try {
      const session = req.body.session || req.body.sessao || req.body.sessionName;
      const type = req.body.type || req.body.tipo || "text";
      const payload = {
        text: req.body.text ?? req.body.body ?? req.body.mensagem,
        backgroundColor: req.body.backgroundColor ?? req.body.bg ?? req.body.cor,
        font: req.body.font,
        mediaUrl: req.body.mediaUrl ?? req.body.url ?? req.body.media,
        caption: req.body.caption ?? req.body.legenda ?? "",
      };
      const statusJidList = Array.isArray(req.body.recipients) ? req.body.recipients : undefined;
      const result = await manager.sendStatus(session, type, payload, statusJidList);
      res.json(result);
    } catch (error) {
      res.status(500).json({ ok: false, error: errorMessage(error) });
    }
  });

  app.post("/api/messages/send/audio-forward", async (req, res) => {
    try {
      const session = req.body.session || req.body.sessao || req.body.sessionName;
      const number = req.body.number || req.body.to || req.body.telefone;
      const mediaUrl = req.body.mediaUrl || req.body.url || req.body.media;
      if (!number || !mediaUrl) return res.status(400).json({ ok: false, error: "number e mediaUrl são obrigatórios." });
      const result = await manager.sendMedia(session, number, mediaUrl, "", "audio");
      res.json(result);
    } catch (error) {
      res.status(500).json({ ok: false, error: errorMessage(error) });
    }
  });

  return app;
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

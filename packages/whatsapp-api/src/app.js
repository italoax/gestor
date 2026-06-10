import express from "express";
import { requireToken } from "./auth.js";

export function createApp({ manager, apiToken }) {
  const app = express();

  app.use(express.json({ limit: "20mb" }));
  app.use(express.urlencoded({ extended: true, limit: "20mb" }));

  app.get("/health", (_req, res) => {
    res.json({ ok: true, service: "gestor-whatsapp-api" });
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
      if (!number || !mediaUrl) return res.status(400).json({ ok: false, error: "number e mediaUrl são obrigatórios." });
      const result = await manager.sendMedia(session, number, mediaUrl, caption, kind);
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

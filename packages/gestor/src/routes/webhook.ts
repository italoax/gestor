import crypto from "node:crypto";
import { Router, type Request } from "express";
import { execute } from "../db/mysql.js";
import { env } from "../config/env.js";

export const webhookRouter = Router();

// Confere o cabeçalho X-Hub-Signature-256 que a Meta envia (HMAC-SHA256 do corpo
// bruto com o WA_APP_SECRET). Sem o segredo configurado, mantém o comportamento
// antigo para não quebrar ambientes de desenvolvimento.
function assinaturaValida(req: Request) {
  const secret = env.whatsapp.appSecret;
  if (!secret) return true;
  const header = String(req.headers["x-hub-signature-256"] ?? "");
  const raw = (req as Request & { rawBody?: Buffer }).rawBody;
  if (!header || !raw) return false;
  const esperado = `sha256=${crypto.createHmac("sha256", secret).update(raw).digest("hex")}`;
  const recebido = Buffer.from(header);
  const calculado = Buffer.from(esperado);
  return recebido.length === calculado.length && crypto.timingSafeEqual(recebido, calculado);
}

webhookRouter.get("/webhook/whatsapp", (req, res) => {
  const mode = String(req.query["hub.mode"] ?? "");
  const token = String(req.query["hub.verify_token"] ?? "");
  const challenge = String(req.query["hub.challenge"] ?? "");
  if (mode === "subscribe" && token === env.whatsapp.verifyToken) return res.status(200).send(challenge);
  return res.sendStatus(403);
});

webhookRouter.post("/webhook/whatsapp", async (req, res, next) => {
  try {
    if (!assinaturaValida(req)) return res.sendStatus(403);
    await execute(
      `INSERT INTO whatsapp_webhook_events (payload, created_at) VALUES (:payload, NOW())`,
      { payload: JSON.stringify(req.body ?? {}) },
    ).catch(() => undefined);
    res.sendStatus(200);
  } catch (error) { next(error); }
});

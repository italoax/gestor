import dotenv from "dotenv";
import path from "node:path";
import { createApp } from "./app.js";
import { BaileysSessionManager } from "./baileys-manager.js";

dotenv.config();

const port = Number(process.env.PORT || 3001);
const manager = new BaileysSessionManager({
  sessionsDir: path.resolve(process.cwd(), process.env.SESSIONS_DIR || "sessions"),
  defaultCountry: process.env.WA_DEFAULT_COUNTRY || "55",
  defaultSession: process.env.SESSION_NAME || process.env.WA_SESSION_NAME_DEFAULT || "default",
});

const app = createApp({
  manager,
  apiToken: process.env.API_TOKEN || process.env.WA_SESSION_API_TOKEN || "",
});

app.listen(port, () => {
  console.log(`Gestor WhatsApp API rodando em http://localhost:${port}`);
  manager.restoreSessions()
    .then((names) => { if (names.length) console.log(`Sessões restauradas no boot: ${names.join(", ")}`); })
    .catch(() => {});
});

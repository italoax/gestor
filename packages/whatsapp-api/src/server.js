import dotenv from "dotenv";
import path from "node:path";
import { createApp } from "./app.js";
import { BaileysSessionManager } from "./baileys-manager.js";

dotenv.config();

// Silencia o ruido da libsignal-node (dep interna do Baileys). Ela usa
// console.log direto — nao passa pelo pino do Baileys — e cospe o dump inteiro
// do estado criptografico da sessao Signal em cada rotacao de chave / novo
// device do contato. E housekeeping normal do protocolo E2E, nao erro.
// Filtramos apenas as linhas obvias; qualquer outro log continua passando.
const RUIDO_LIBSIGNAL = [
  /^Closing session:/,
  /^Closing open session in favor of incoming prekey bundle/,
  /^Deleting session closed at/,
  /^Deleting old closed session/,
];
const consoleLogOriginal = console.log.bind(console);
console.log = (...args) => {
  if (typeof args[0] === "string" && RUIDO_LIBSIGNAL.some((re) => re.test(args[0]))) return;
  consoleLogOriginal(...args);
};

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

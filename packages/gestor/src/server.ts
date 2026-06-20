import "./types.js";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import session from "express-session";
import flash from "connect-flash";
import helmet from "helmet";
import morgan from "morgan";
import expressLayouts from "express-ejs-layouts";
import { env } from "./config/env.js";
import { db } from "./db/mysql.js";
import { sessionStore } from "./db/sessionStore.js";
import { ensureDatabaseSchema } from "./db/schema.js";
import { exposeLocals, requireAuth } from "./middleware/auth.js";
import { authRouter } from "./routes/auth.js";
import { dashboardRouter } from "./routes/dashboard.js";
import { clientesRouter } from "./routes/clientes.js";
import { crudRouter } from "./routes/simpleCrud.js";
import { accountRouter } from "./routes/account.js";
import { webhookRouter } from "./routes/webhook.js";
import { whatsappRouter } from "./routes/whatsapp.js";
import { placeholderRouter } from "./routes/placeholder.js";
import { dispositivosRouter } from "./routes/dispositivos.js";
import { aplicativosRouter } from "./routes/aplicativos.js";
import { transacoesRouter } from "./routes/transacoes.js";
import { automacaoRouter } from "./routes/automacao.js";
import { executarCobrancasAutomaticas, startCobrancasCron } from "./services/cobrancasCron.js";
import { badgeStatusByVencimento, formatDateBr, formatDateInput, formatMoney, statusByVencimento } from "./services/format.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");
const app = express();

// Hostinger/Cloudflare terminam o HTTPS antes do Node.
// Sem trust proxy, o express-session não envia cookie `secure` em produção,
// então o login redireciona para /dashboard mas a sessão não fica salva.
app.set("trust proxy", 1);

app.set("view engine", "ejs");
app.set("views", path.join(root, "src/views"));
app.set("layout", "layouts/main");
app.use(expressLayouts);

app.use(helmet({ contentSecurityPolicy: false }));
app.use(morgan("dev"));
app.use(express.urlencoded({ extended: true }));
app.use(express.json({ verify: (req, _res, buf) => { (req as express.Request & { rawBody?: Buffer }).rawBody = buf; } }));
app.use(express.static(path.join(root, "public")));
app.use(session({ store: sessionStore, secret: env.sessionSecret, resave: false, saveUninitialized: false, cookie: { httpOnly: true, sameSite: "lax", secure: env.nodeEnv === "production" } }));
app.use(flash());
app.use(exposeLocals);
app.use((_, res, next) => {
  res.locals.formatMoney = formatMoney;
  res.locals.formatDateBr = formatDateBr;
  res.locals.formatDateInput = formatDateInput;
  res.locals.badgeStatusByVencimento = badgeStatusByVencimento;
  res.locals.statusByVencimento = statusByVencimento;
  next();
});

app.get("/", (_req, res) => {
  res.redirect("/login");
});

// Endpoint público (protegido por token) para um cron externo (Hostinger Cron Job
// ou cron-job.org) acordar o processo e disparar a execução das cobranças.
// Em shared hosting o processo Node hiberna sem tráfego — o setInterval interno só
// roda se alguém estiver acessando o site. Pingar essa rota a cada minuto resolve.
let cronRunning = false;
app.get("/__cron/cobrancas", async (req, res) => {
  // Validação timing-safe do token — bate o tamanho primeiro pra não vazar info.
  const received = String(req.query.token ?? req.headers["x-cron-token"] ?? "");
  const expected = env.cronToken;
  if (!expected) return res.status(401).json({ ok: false, error: "CRON_TOKEN não configurado." });
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return res.status(401).json({ ok: false, error: "Token inválido." });
  }
  // Se um tick anterior ainda está rodando (envios espaçados por delay), retorna
  // imediatamente em vez de empilhar execuções simultâneas que duplicariam envios.
  if (cronRunning) return res.json({ ok: true, skipped: true, reason: "ja rodando" });
  cronRunning = true;
  const start = Date.now();
  try {
    await executarCobrancasAutomaticas();
    res.json({ ok: true, durationMs: Date.now() - start });
  } catch (error) {
    res.status(500).json({ ok: false, error: error instanceof Error ? error.message : String(error) });
  } finally {
    cronRunning = false;
  }
});

app.use(webhookRouter);
app.use(authRouter);
app.use(requireAuth, dashboardRouter, clientesRouter, crudRouter, accountRouter, whatsappRouter, transacoesRouter, automacaoRouter, dispositivosRouter, aplicativosRouter, placeholderRouter);

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  // Mostra a mensagem do erro pro usuário em prod também — sem stack, só o que veio
  // do banco/integração. Antes ficava só "Erro interno" e impossível diagnosticar.
  const message = err instanceof Error ? err.message : String(err);
  const payload = env.nodeEnv === "development" ? err : { message };
  res.status(500).render("pages/error", { title: "Erro", error: payload });
});

process.on("SIGINT", async () => { await db.end(); process.exit(0); });

async function startServer() {
  await ensureDatabaseSchema();
  app.listen(env.port, () => {
    startCobrancasCron();
    console.log(`Gestor Node rodando em http://localhost:${env.port}`);
  });
}

startServer().catch((error) => {
  console.error("Erro ao iniciar o Gestor Node:", error);
  process.exit(1);
});

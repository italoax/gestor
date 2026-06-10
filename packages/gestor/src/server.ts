import "./types.js";
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
import { cobrancasRouter } from "./routes/cobrancas.js";
import { accountRouter } from "./routes/account.js";
import { webhookRouter } from "./routes/webhook.js";
import { whatsappRouter } from "./routes/whatsapp.js";
import { startCobrancasCron } from "./services/cobrancasCron.js";
import { startWppConnectIfConfigured } from "./services/wppconnect.js";
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

app.use(webhookRouter);
app.use(authRouter);
app.use(requireAuth, dashboardRouter, clientesRouter, crudRouter, cobrancasRouter, accountRouter, whatsappRouter);

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).render("pages/error", { title: "Erro", error: env.nodeEnv === "development" ? err : null });
});

process.on("SIGINT", async () => { await db.end(); process.exit(0); });

async function startServer() {
  await ensureDatabaseSchema();
  app.listen(env.port, () => {
    startCobrancasCron();
    startWppConnectIfConfigured();
    console.log(`Gestor Node rodando em http://localhost:${env.port}`);
  });
}

startServer().catch((error) => {
  console.error("Erro ao iniciar o Gestor Node:", error);
  process.exit(1);
});

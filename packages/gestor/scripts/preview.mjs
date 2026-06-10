// Servidor de PREVIEW (somente desenvolvimento). Não usa banco: renderiza as
// views reais com dados fictícios e tem cadastro/login em memória, para testar
// o fluxo de criação de conta e ajustar o layout mobile.
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import session from "express-session";
import expressLayouts from "express-ejs-layouts";
import bcrypt from "bcryptjs";
import {
  formatMoney, formatDateBr, formatDateInput,
  statusByVencimento, badgeStatusByVencimento,
} from "../dist/services/format.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const app = express();

app.set("view engine", "ejs");
app.set("views", path.join(root, "src/views"));
app.set("layout", "layouts/main");
app.use(expressLayouts);
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(root, "public")));
app.use(session({ secret: "preview", resave: false, saveUninitialized: false }));

// --- flash mínimo ---
function flash(req, type, msg) {
  req.session.flash = req.session.flash || { success: [], error: [] };
  req.session.flash[type].push(msg);
}
app.use((req, res, next) => {
  const f = req.session.flash || { success: [], error: [] };
  req.session.flash = { success: [], error: [] };
  res.locals.user = req.session.user || null;
  res.locals.currentPath = req.path;
  res.locals.success = f.success;
  res.locals.error = f.error;
  res.locals.formatMoney = formatMoney;
  res.locals.formatDateBr = formatDateBr;
  res.locals.formatDateInput = formatDateInput;
  res.locals.statusByVencimento = statusByVencimento;
  res.locals.badgeStatusByVencimento = badgeStatusByVencimento;
  next();
});

// --- usuários em memória (mesma validação da rota real) ---
const users = [];
(async () => { users.push({ id: 1, name: "Italo Demo", username: "italo", email: "italo@demo.com", passwordHash: await bcrypt.hash("123456", 12) }); })();

app.get("/", (_req, res) => res.redirect("/login"));
app.get("/login", (req, res) => req.session.user ? res.redirect("/dashboard") : res.render("pages/login", { title: "Login" }));
app.get("/register", (_req, res) => res.render("pages/register", { title: "Criar conta" }));

app.post("/register", async (req, res) => {
  const name = String(req.body.name ?? "").trim();
  const username = String(req.body.username ?? "").trim();
  const email = String(req.body.email ?? "").trim();
  const password = String(req.body.password ?? "");
  const passwordConfirm = String(req.body.password_confirm ?? "");
  if (!name || !username || !email || !password) { flash(req, "error", "Preencha nome, usuário, email e senha."); return res.redirect("/register"); }
  if (!/^[a-zA-Z0-9_.-]{3,30}$/.test(username)) { flash(req, "error", "Usuário inválido."); return res.redirect("/register"); }
  if (password.length < 6 || password !== passwordConfirm) { flash(req, "error", "Senha inválida ou confirmação diferente."); return res.redirect("/register"); }
  if (users.find(u => u.username === username || u.email === email)) { flash(req, "error", "Usuário ou email já cadastrado."); return res.redirect("/register"); }
  const passwordHash = await bcrypt.hash(password, 12);
  const user = { id: users.length + 1, name, username, email, passwordHash };
  users.push(user);
  req.session.user = { id: user.id, name, username, email };
  flash(req, "success", "Conta criada com sucesso (preview).");
  res.redirect("/dashboard");
});

app.post("/login", async (req, res) => {
  const username = String(req.body.username ?? "").trim();
  const password = String(req.body.password ?? "");
  const user = users.find(u => u.username === username);
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) { flash(req, "error", "Usuário ou senha inválidos."); return res.redirect("/login"); }
  req.session.user = { id: user.id, name: user.name, username: user.username, email: user.email };
  res.redirect("/dashboard");
});
app.post("/logout", (req, res) => req.session.destroy(() => res.redirect("/login")));

// --- guarda das páginas internas ---
function requireUser(req, res, next) { if (!req.session.user) return res.redirect("/login"); next(); }

// --- dados fictícios ---
const planos = [
  { id: 1, nome: "Mensal", clientes: 18, tipo: "Mês", periodo: 1, observacao: "Plano padrão", creditoGastos: 1 },
  { id: 2, nome: "Trimestral", clientes: 6, tipo: "Mês", periodo: 3, observacao: "", creditoGastos: 3 },
];
const servidores = [
  { id: 1, nome: "Servidor BR-1", clientesTotal: 20, clientesAtivos: 17, clientesInativos: 3, testesTotal: 4, testesAtivos: 2, testesInativos: 2, creditos: 120, valorCred: 1.5, sessao: "default", integracao: "Sigma" },
  { id: 2, nome: "Servidor BR-2", clientesTotal: 8, clientesAtivos: 6, clientesInativos: 2, testesTotal: 0, testesAtivos: 0, testesInativos: 0, creditos: 40, valorCred: 1.2, sessao: "default", integracao: "Koffice" },
];
const mensagens = [
  { id: 1, titulo: "Cobrança padrão", mensagem: "Olá {nome}, seu plano {plano} vence em {vencimento}. Valor: {valor}.", mediaTipo: null, mediaPath: null },
  { id: 2, titulo: "Boas-vindas", mensagem: "Bem-vindo {nome}!", mediaTipo: null, mediaPath: null },
];
const clientes = [
  { id: 1, nome: "João da Silva Santos", user: "joaosilva", telefone: "+55 11999998888", vencimento: "2026-06-20", plano: "Mensal", valor: 35, status: "Ativo", servidor: "Servidor BR-1", telas: 2, creditosGastos: 1 },
  { id: 2, nome: "Maria Souza", user: "mariasouza", telefone: "+55 21988887777", vencimento: "2026-06-10", plano: "Mensal", valor: 35, status: "Ativo", servidor: "Servidor BR-1", telas: 1, creditosGastos: 1 },
  { id: 3, nome: "Carlos Pereira", user: "carlosp", telefone: "+55 31977776666", vencimento: "2026-06-05", plano: "Trimestral", valor: 90, status: "Ativo", servidor: "Servidor BR-2", telas: 3, creditosGastos: 3 },
  { id: 4, nome: "Ana Costa", user: "anacosta", telefone: "+55 41966665555", vencimento: "2026-05-28", plano: "Mensal", valor: 35, status: "Inativo", servidor: "Servidor BR-2", telas: 1, creditosGastos: 1 },
];
const cobrancas = [
  { id: 1, titulo: "Aviso 3 dias antes", tipo: "Vencimento", tipoPeriodo: "Dias", periodo: 3, status: "Ativo", automatica: 1, mensagemTitulo: "Cobrança padrão", mensagemId: 1, horaEnvio: "09:00:00", horaEnvioCurta: "09:00", diasSemana: "1,2,3,4,5", diasSemanaLista: ["Seg", "Ter", "Qua", "Qui", "Sex"], recebedores: [{ id: 1, nome: "João da Silva Santos" }, { id: 2, nome: "Maria Souza" }] },
  { id: 2, titulo: "Vencidos", tipo: "Vencidos", tipoPeriodo: "Dias", periodo: 1, status: "Inativo", automatica: 0, mensagemTitulo: "Cobrança padrão", mensagemId: 1, horaEnvio: "10:00:00", horaEnvioCurta: "10:00", diasSemana: "", diasSemanaLista: [], recebedores: [{ id: 3, nome: "Carlos Pereira" }] },
];

app.get("/dashboard", requireUser, (_req, res) => {
  res.render("pages/dashboard", {
    title: "Dashboard",
    stats: { clientesTotal: 42, ativos: 35, vencidos: 5, vencemHoje: 2, vencem7: 8, planos: 2, servidores: 2, receitaPrevista: 1470, faturamentoMes: 980, custoMes: 300, lucroMes: 680, totalPago: 980 },
    vencidosPercent: 12, ativosPercent: 83, lucroPercent: 69,
    proximos: clientes.slice(0, 3).map((c, i) => ({ ...c, dias: i })),
    atrasados: [{ nome: "Ana Costa", plano: "Mensal", valor: 35, dias: -4 }],
    porServidor: [{ servidor: "Servidor BR-1", total: 20, valor: 700, percent: 70 }, { servidor: "Servidor BR-2", total: 8, valor: 320, percent: 32 }],
  });
});
app.get("/clientes", requireUser, (_req, res) => res.render("pages/clientes", { title: "Clientes", clientes, planos, servidores, mensagens }));
app.get("/cobrancas", requireUser, (_req, res) => res.render("pages/cobrancas", { title: "Cobranças", cobrancas, mensagens }));
app.get("/planos", requireUser, (_req, res) => res.render("pages/planos", { title: "Planos", planos }));
app.get("/servidores", requireUser, (_req, res) => res.render("pages/servidores", { title: "Servidores", servidores }));
app.get("/mensagens", requireUser, (_req, res) => res.render("pages/mensagens", { title: "Mensagens", mensagens }));
app.get("/minha-conta", requireUser, (req, res) => res.render("pages/minha-conta", { title: "Minha Conta", account: { ...req.session.user } }));
app.get("/whatsapp", requireUser, (req, res) => {
  const pair = req.query.pair ? { status: "pairing", pairingCode: "ABCD-1234" } : {};
  res.render("pages/whatsapp", { title: "WhatsApp", state: { session: "default", status: "desconectado", connected: false, lastError: "", ...pair }, driver: "session-api", sessionApi: true });
});

app.use((err, _req, res, _next) => { console.error("PREVIEW ERROR:", err.message); res.status(500).send(`<pre>${err.stack}</pre>`); });

const port = Number(process.env.PREVIEW_PORT || 4100);
app.listen(port, () => console.log(`PREVIEW em http://localhost:${port} (login: italo / 123456)`));

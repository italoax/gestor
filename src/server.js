import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import session from 'express-session';
import flash from 'connect-flash';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import expressLayouts from 'express-ejs-layouts';
import { env } from './config/env.js';
import { db } from './db/mysql.js';
import { createSessionStore, closeSessionStores } from './db/sessionStore.js';
import { ensureDatabaseSchema } from './db/schema.js';
import { exposeLocals, requireAuth } from './middleware/auth.js';
import { csrfMiddleware } from './middleware/csrf.js';
import { installDevReload } from './middleware/devReload.js';
import { invalidarCacheMiddleware } from './middleware/invalidarCache.js';
import { authRouter } from './routes/auth.js';
import { dashboardRouter } from './routes/dashboard.js';
import { clientesRouter } from './routes/clientes.js';
import { crudRouter } from './routes/simpleCrud.js';
import { accountRouter } from './routes/account.js';
import { whatsappRouter } from './routes/whatsapp.js';
import { placeholderRouter } from './routes/placeholder.js';
import { dispositivosRouter } from './routes/dispositivos.js';
import { aplicativosRouter } from './routes/aplicativos.js';
import { transacoesRouter } from './routes/transacoes.js';
import { automacaoRouter } from './routes/automacao.js';
import { statusRouter } from './routes/status.js';
import { pagamentoRouter } from './routes/pagamento.js';
import { integracaoPagamentoRouter } from './routes/integracaoPagamento.js';
import { integracoesRouter } from './routes/integracoes.js';
import { pushRouter } from './routes/push.js';
import { notificacoesRouter } from './routes/notificacoes.js';
import { landingRouter } from './routes/landing.js';
import { areaClienteRouter } from './routes/areaCliente.js';
import {
  executarCobrancasAutomaticas,
  startCobrancasCron,
  stopCobrancasCron,
} from './services/cobrancasCron.js';
import {
  executarAgendados,
  startStatusCron,
  stopStatusCron,
} from './services/statusCron.js';
import { rodarBackupAgendado } from './services/backup.js';
import {
  badgeStatusByVencimento,
  formatDateBr,
  formatDateInput,
  formatMoney,
  statusByVencimento,
  statusUrgency,
} from './services/format.js';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');
const app = express();
const stopDevReload =
  process.env.GESTOR_DEV_RELOAD === '1' && env.nodeEnv === 'development'
    ? installDevReload(app, root)
    : () => {};
// Hostinger/Cloudflare terminam o HTTPS antes do Node.
// Sem trust proxy, o express-session não envia cookie `secure` em produção,
// então o login redireciona para /dashboard mas a sessão não fica salva.
app.set('trust proxy', 1);
app.set('view engine', 'ejs');
app.set('views', path.join(root, 'src/views'));
app.set('layout', 'layouts/main');
app.use(expressLayouts);
// CSP pragmática: permite scripts/estilos inline (o projeto usa `style=` e algumas
// chamadas inline) mas bloqueia scripts de domínios desconhecidos. Reduz superfície
// de XSS (atacante não consegue carregar JS de evil.com) sem quebrar o painel atual.
// Em dev fica desligada pra não atrapalhar hot-reload.
app.use(
  helmet({
    contentSecurityPolicy:
      env.nodeEnv === 'production'
        ? {
            useDefaults: true,
            directives: {
              defaultSrc: ["'self'"],
              scriptSrc: [
                "'self'",
                "'unsafe-inline'",
                'https://cdn.jsdelivr.net',
              ],
              styleSrc: ["'self'", "'unsafe-inline'"],
              imgSrc: ["'self'", 'data:', 'https:'],
              connectSrc: ["'self'"],
              fontSrc: ["'self'", 'data:'],
              frameAncestors: ["'self'"],
              formAction: ["'self'"],
            },
          }
        : false,
  }),
);
// Comprime respostas com gzip — HTML/CSS/JS encolhem ~70%. Especialmente
// importante em hospedagem compartilhada com largura de banda limitada.
app.use(compression());
// URLs de acesso e pagamento contêm credenciais; registre somente metadados.
app.use(morgan(':method :status :response-time ms'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
// Cache-busting via revalidação: o express.static manda ETag automaticamente.
// `no-cache` no Cache-Control não significa "não cacheia" — significa "antes de
// usar, pergunta ao servidor se mudou". Arquivo igual → 304 (zero bytes); arquivo
// mudou → manda a versão nova. Assim editar CSS/JS reflete na hora, sem precisar
// versionar URL nem bumpar nada manualmente.
app.use(
  express.static(path.join(root, 'public'), {
    etag: true,
    lastModified: true,
    setHeaders(res) {
      res.setHeader('Cache-Control', 'no-cache');
    },
  }),
);
// Health check público pra monitor externo (UptimeRobot, etc). Inclui ping
// rápido no DB pra distinguir "Node tá vivo" de "Node + banco tá vivo".
app.get('/healthz', async (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  let dbOk = false;
  try {
    await db.query({ sql: 'SELECT 1', timeout: 5000 });
    dbOk = true;
  } catch {
    dbOk = false;
  }
  const status = dbOk ? 200 : 503;
  res.status(status).json({
    ok: dbOk,
    db: dbOk ? 'ok' : 'down',
    uptimeSec: Math.round(process.uptime()),
    version: process.env.npm_package_version || '0.1.0',
  });
});
// Nome exclusivo: cookies connect.sid de versões antigas/outros apps não
// podem substituir a sessão do painel durante o login.
const painelSession = session({
  name: 'ixstreaming.painel.sid',
  store: createSessionStore(),
  secret: env.sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: env.cookieSecure,
  },
});
const clienteSession = session({
  name: 'ixstreaming.cliente.sid',
  store: createSessionStore(),
  secret: env.sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    path: '/area-cliente',
    httpOnly: true,
    sameSite: 'lax',
    secure: env.cookieSecure,
  },
});
app.use((req, res, next) => {
  const portal =
    req.path === '/area-cliente' || req.path.startsWith('/area-cliente/');
  // Remove o cookie do painel emitido com o path do portal pela versão anterior.
  if (!portal && req.path === '/login') {
    res.clearCookie('ixstreaming.painel.sid', {
      path: '/area-cliente',
      httpOnly: true,
      sameSite: 'lax',
      secure: env.cookieSecure,
    });
  }
  return (portal ? clienteSession : painelSession)(req, res, (error) => {
    if (error) return next(error);
    // Sessões persistidas antes da correção também precisam do path correto.
    req.session.cookie.path = portal ? '/area-cliente' : '/';
    next();
  });
});
app.use(flash());
// exposeLocals ANTES do csrf: se o csrf rejeitar, ele renderiza pages/error,
// que usa o layout main.ejs e referencia `user`. Sem exposeLocals antes,
// a variável user fica undefined e dá ReferenceError no body do layout.
app.use(exposeLocals);
app.use(csrfMiddleware);
app.use((_, res, next) => {
  res.locals.formatMoney = formatMoney;
  res.locals.formatDateBr = formatDateBr;
  res.locals.formatDateInput = formatDateInput;
  res.locals.badgeStatusByVencimento = badgeStatusByVencimento;
  res.locals.statusByVencimento = statusByVencimento;
  res.locals.statusUrgency = statusUrgency;
  next();
});
// Endpoint público (protegido por token) para um cron externo (Hostinger Cron Job
// ou cron-job.org) acordar o processo e disparar a execução das cobranças.
// Em shared hosting o processo Node hiberna sem tráfego — o setInterval interno só
// roda se alguém estiver acessando o site. Pingar essa rota a cada minuto resolve.
// O lock contra execução concorrente está dentro de executarCobrancasAutomaticas().
app.get('/__cron/cobrancas', async (req, res) => {
  if (env.localMode)
    return res
      .status(403)
      .json({ ok: false, error: 'Automações desativadas no modo local.' });
  // Validação timing-safe do token — bate o tamanho primeiro pra não vazar info.
  const received = String(req.query.token ?? req.headers['x-cron-token'] ?? '');
  const expected = env.cronToken;
  if (!expected)
    return res
      .status(401)
      .json({ ok: false, error: 'CRON_TOKEN não configurado.' });
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return res.status(401).json({ ok: false, error: 'Token inválido.' });
  }
  const start = Date.now();
  try {
    const result = await executarCobrancasAutomaticas();
    if (result.skipped)
      return res.json({ ok: true, skipped: true, reason: 'ja rodando' });
    // Aproveita o mesmo tick pra publicar status agendados vencidos.
    const statusResult = await executarAgendados();
    // Backup diário independente da publicação de status.
    await rodarBackupAgendado().catch(() => {});
    res.json({
      ok: true,
      durationMs: Date.now() - start,
      statusPostados: statusResult.postados ?? 0,
    });
  } catch (error) {
    console.error('[cron] Falha na execução:', error);
    res
      .status(500)
      .json({ ok: false, error: 'Erro ao executar as automações.' });
  }
});
// pagamentoRouter contém rotas públicas (/pagar/:token e /webhook/mercadopago).
// Tem que vir antes do requireAuth pra cliente final acessar sem login.
app.use(pagamentoRouter);
app.use(landingRouter);
app.use(areaClienteRouter);
app.use(authRouter);
app.use(
  requireAuth,
  invalidarCacheMiddleware,
  dashboardRouter,
  clientesRouter,
  crudRouter,
  accountRouter,
  whatsappRouter,
  transacoesRouter,
  automacaoRouter,
  statusRouter,
  dispositivosRouter,
  aplicativosRouter,
  integracaoPagamentoRouter,
  integracoesRouter,
  pushRouter,
  notificacoesRouter,
  placeholderRouter,
);
app.use((err, _req, res, _next) => {
  // O erro completo (com stack e mensagem crua do banco/integração) SEMPRE vai
  // pro log do servidor — é lá que se diagnostica.
  console.error(err);
  if (res.headersSent) return _next(err);
  // Pro usuário: em produção, mensagem genérica. Mostrar a mensagem crua vazava
  // detalhes internos (nome de tabela/coluna num erro de MySQL, path de arquivo,
  // etc.). Em desenvolvimento, mostra tudo pra facilitar o debug local.
  const payload =
    env.nodeEnv === 'development'
      ? err
      : {
          message:
            'Ocorreu um erro ao processar sua solicitação. Recarregue a página e tente de novo; se persistir, entre em contato com o suporte.',
        };
  if (_req.get('accept')?.includes('application/json')) {
    return res
      .status(500)
      .json({ ok: false, error: payload?.message || 'Erro interno.' });
  }
  res.status(500).render('pages/error', { title: 'Erro', error: payload });
});
let httpServer = null;
let shuttingDown = false;
// Encerra o servidor de forma limpa: para de aceitar conexões novas, deixa as
// em curso terminarem (até 30s), fecha a pool do MySQL e sai. Sem isso, requests
// em curso eram abortadas a cada deploy/restart (cliente via "Erro de conexão").
async function shutdownGracefully(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[shutdown] ${signal} recebido — encerrando...`);
  const timeout = setTimeout(() => {
    console.warn('[shutdown] timeout — forçando saída');
    process.exit(1);
  }, 30000);
  try {
    stopDevReload();
    const jobs = Promise.all([stopCobrancasCron(), stopStatusCron()]);
    if (httpServer) {
      await new Promise((resolve, reject) =>
        httpServer.close((error) => (error ? reject(error) : resolve())),
      );
    }
    await jobs;
    await closeSessionStores();
    await db.end();
    clearTimeout(timeout);
    process.exit(0);
  } catch (error) {
    console.error('[shutdown] erro ao encerrar:', error);
    clearTimeout(timeout);
    process.exit(1);
  }
}
process.on('SIGINT', () => void shutdownGracefully('SIGINT'));
process.on('SIGTERM', () => void shutdownGracefully('SIGTERM'));
async function startServer() {
  if (env.localMode) {
    await db.query('SELECT 1');
    console.log(
      'Modo local: automações e migrações desativadas; sessões apenas em memória.',
    );
  } else {
    await ensureDatabaseSchema();
  }
  if (shuttingDown) return;
  httpServer = app.listen(
    {
      port: env.port,
      host: env.host ?? (env.localMode ? '127.0.0.1' : undefined),
    },
    () => {
      startCobrancasCron();
      startStatusCron();
      // Exibe a URL pública configurada, que pode diferir da porta do processo.
      const url =
        env.appUrl && env.appUrl.trim()
          ? env.appUrl
          : `http://localhost:${env.port}`;
      console.log(`Gestor Node rodando em ${url}`);
    },
  );
  httpServer.on('error', (error) => {
    console.error('Erro no servidor HTTP:', error);
    void shutdownGracefully('HTTP error');
  });
}
startServer().catch((error) => {
  console.error('Erro ao iniciar o Gestor Node:', error);
  if (error?.code === 'ER_USER_LIMIT_REACHED') {
    console.error('Limite de recursos do MySQL atingido. Aguarde a liberacao pelo provedor antes de reiniciar.');
    process.exit(78);
  }
  process.exit(1);
});

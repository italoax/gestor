import { requireAuth } from '../middleware/auth.js';
import { invalidarCacheMiddleware } from '../middleware/invalidarCache.js';
import { authRouter } from './auth.js';
import { dashboardRouter } from './dashboard.js';
import { clientesRouter } from './clientes.js';
import { crudRouter } from './simpleCrud.js';
import { accountRouter } from './account.js';
import { whatsappRouter } from './whatsapp.js';
import { placeholderRouter } from './placeholder.js';
import { dispositivosRouter } from './dispositivos.js';
import { aplicativosRouter } from './aplicativos.js';
import { transacoesRouter } from './transacoes.js';
import { automacaoRouter } from './automacao.js';
import { statusRouter } from './status.js';
import { pagamentoRouter } from './pagamento.js';
import { integracaoPagamentoRouter } from './integracaoPagamento.js';
import { integracoesRouter } from './integracoes.js';
import { pushRouter } from './push.js';
import { notificacoesRouter } from './notificacoes.js';
import { landingRouter } from './landing.js';
import { areaClienteRouter } from './areaCliente.js';

export function installRoutes(app) {
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
}

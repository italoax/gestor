import { queryRows, execute, queryOne } from '../db/mysql.js';
import { appTodayIso } from '../services/dates.js';
import { resumirAcessos } from '../services/dashboardAcessos.js';
import {
  PAIS_NOME,
  UF_NOME,
  paisFromTelefone,
  ufFromTelefone,
} from '../services/geo.js';
import bcrypt from 'bcryptjs';
import { invalidarPixConfig } from '../services/pixConfig.js';
import { toNullableString, boolField, toNumber } from '../services/format.js';
import {
  consultaDestinatariosCobranca,
  agruparAvisosCobranca,
} from '../services/cobrancaDestinatarios.js';
import {
  dispararRegraManual,
  ensureCobrancasEnviosTable,
  executarCobrancasAutomaticas,
} from '../services/cobrancasCron.js';
import {
  jaSemeou,
  marcarSemeado,
  seedMensagensPadrao,
} from '../services/catalogSeeds.js';
import { env } from '../config/env.js';
import { removerStatusExpirados } from '../services/statusRetention.js';
import { statusHistoryData } from '../services/frontendPageData.js';
import {
  carregarConfigsDoUsuario,
  salvarConfig,
  PROVIDER_LISTA,
  PROVIDER_NOMES,
  escolherProvedor,
} from '../services/paymentProvider.js';
import { encryptSecret, decryptSecret } from '../services/crypto.js';
import { sigmaLogin } from '../services/sigma.js';
import { vapidPublicKey, pushDisponivel } from '../services/push.js';
import { publicHttpsUrl } from '../services/publicNetwork.js';
import {
  contarNaoLidas,
  excluirNotificacao,
  limparTodas,
  listarNotificacoes,
  marcarLida,
  marcarTodasLidas,
  sincronizarAlertasCreditos,
} from '../services/notificacoes.js';
import { caminhoPagamento } from '../services/linkPagamentoUrl.js';
import {
  escolhasRenovacao,
  lerPlanoAdicional,
} from '../services/renovacaoOpcoes.js';
import { executarAgendados } from '../services/statusCron.js';
import { rodarBackupAgendado } from '../services/backup.js';
import { createDashboardWorkflow } from './dashboard.js';
import { createAccountWorkflow } from './account.js';
import { createTransactionsWorkflow } from './transactions.js';
import { createMessagesWorkflow } from './messages.js';
import { createAutomationWorkflow } from './automation.js';
import { createWhatsappWorkflow } from './whatsapp.js';
import { createStatusWorkflow } from './status.js';
import { createPaymentSettingsWorkflow } from './payment-settings.js';
import { createIntegrationsWorkflow } from './integrations.js';
import { createPushWorkflow } from './push.js';
import { createNotificationsWorkflow } from './notifications.js';
import { createPortalWorkflow } from './portal.js';
import { createLandingWorkflow } from './landing.js';
import { createPlaceholderWorkflow } from './placeholder.js';
import { createCronWorkflow } from './cron.js';
import { createWorkerProxyWorkflow } from './worker-proxy.js';
export function createDefaultFeatures() {
  return {
    dashboard: createDashboardWorkflow({
      queryRows,
      appTodayIso,
      resumirAcessos,
      PAIS_NOME,
      UF_NOME,
      paisFromTelefone,
      ufFromTelefone,
    }),
    account: createAccountWorkflow({
      bcrypt,
      execute,
      queryOne,
      queryRows,
      invalidarPixConfig,
      toNullableString,
    }),
    transactions: createTransactionsWorkflow({ execute, queryRows }),
    messages: createMessagesWorkflow({
      execute,
      queryOne,
      queryRows,
      boolField,
      toNullableString,
      toNumber,
    }),
    automation: createAutomationWorkflow({
      execute,
      queryOne,
      queryRows,
      consultaDestinatariosCobranca,
      agruparAvisosCobranca,
      appTodayIso,
      boolField,
      toNullableString,
      toNumber,
      dispararRegraManual,
      ensureCobrancasEnviosTable,
      jaSemeou,
      marcarSemeado,
      seedMensagensPadrao,
    }),
    whatsapp: createWhatsappWorkflow({
      env,
      execute,
      queryOne,
      queryRows,
      appTodayIso,
      ensureCobrancasEnviosTable,
    }),
    status: createStatusWorkflow({
      execute,
      queryRows,
      toNullableString,
      removerStatusExpirados,
      statusHistoryData,
    }),
    'payment-settings': createPaymentSettingsWorkflow({
      execute,
      queryOne,
      queryRows,
      env,
      carregarConfigsDoUsuario,
      salvarConfig,
      PROVIDER_LISTA,
      PROVIDER_NOMES,
    }),
    integrations: createIntegrationsWorkflow({
      execute,
      queryOne,
      queryRows,
      encryptSecret,
      decryptSecret,
      sigmaLogin,
    }),
    push: createPushWorkflow({
      execute,
      vapidPublicKey,
      pushDisponivel,
      publicHttpsUrl,
    }),
    notifications: createNotificationsWorkflow({
      contarNaoLidas,
      excluirNotificacao,
      limparTodas,
      listarNotificacoes,
      marcarLida,
      marcarTodasLidas,
      sincronizarAlertasCreditos,
    }),
    portal: createPortalWorkflow({
      execute,
      queryOne,
      queryRows,
      escolherProvedor,
      caminhoPagamento,
      escolhasRenovacao,
      lerPlanoAdicional,
    }),
    landing: createLandingWorkflow({}),
    placeholder: createPlaceholderWorkflow({}),
  };
}
export function createDefaultLocalCronWorkflow() {
  return createCronWorkflow({
    env,
    executarCobrancasAutomaticas,
    executarAgendados,
    rodarBackupAgendado,
  });
}
export function createDefaultCronWorkflow() {
  return env.workerUrl
    ? createWorkerProxyWorkflow({ env })
    : createDefaultLocalCronWorkflow();
}

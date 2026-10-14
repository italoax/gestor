import { queryRows, execute, queryOne } from '../db/mysql.ts';
import { appTodayIso } from '../services/dates.ts';
import { resumirAcessos } from '../services/dashboardAcessos.ts';
import {
  PAIS_NOME,
  UF_NOME,
  paisFromTelefone,
  ufFromTelefone,
} from '../services/geo.ts';
import bcrypt from 'bcryptjs';
import { invalidarPixConfig } from '../services/pixConfig.ts';
import { toNullableString, boolField, toNumber } from '../services/format.ts';
import {
  consultaDestinatariosCobranca,
  agruparAvisosCobranca,
} from '../services/cobrancaDestinatarios.ts';
import {
  dispararRegraManual,
  ensureCobrancasEnviosTable,
  executarCobrancasAutomaticas,
} from '../services/cobrancasCron.ts';
import {
  jaSemeou,
  marcarSemeado,
  seedMensagensPadrao,
} from '../services/catalogSeeds.ts';
import { env } from '../config/env.ts';
import { removerStatusExpirados } from '../services/statusRetention.ts';
import { statusHistoryData } from '../services/frontendPageData.ts';
import {
  carregarConfigsDoUsuario,
  salvarConfig,
  PROVIDER_LISTA,
  PROVIDER_NOMES,
  escolherProvedor,
} from '../services/paymentProvider.ts';
import { encryptSecret, decryptSecret } from '../services/crypto.ts';
import { sigmaLogin } from '../services/sigma.ts';
import { vapidPublicKey, pushDisponivel } from '../services/push.ts';
import { publicHttpsUrl } from '../services/publicNetwork.ts';
import {
  contarNaoLidas,
  excluirNotificacao,
  limparTodas,
  listarNotificacoes,
  marcarLida,
  marcarTodasLidas,
  sincronizarAlertasCreditos,
} from '../services/notificacoes.ts';
import { caminhoPagamento } from '../services/linkPagamentoUrl.ts';
import {
  escolhasRenovacao,
  lerPlanoAdicional,
} from '../services/renovacaoOpcoes.ts';
import { executarAgendados } from '../services/statusCron.ts';
import { rodarBackupAgendado } from '../services/backup.ts';
import { createDashboardWorkflow } from './dashboard.ts';
import { createAccountWorkflow } from './account.ts';
import { createTransactionsWorkflow } from './transactions.ts';
import { createMessagesWorkflow } from './messages.ts';
import { createAutomationWorkflow } from './automation.ts';
import { createWhatsappWorkflow } from './whatsapp.ts';
import { createStatusWorkflow } from './status.ts';
import { createPaymentSettingsWorkflow } from './payment-settings.ts';
import { createIntegrationsWorkflow } from './integrations.ts';
import { createPushWorkflow } from './push.ts';
import { createNotificationsWorkflow } from './notifications.ts';
import { createPortalWorkflow } from './portal.ts';
import { createLandingWorkflow } from './landing.ts';
import { createPlaceholderWorkflow } from './placeholder.ts';
import { createCronWorkflow } from './cron.ts';
import { createWorkerProxyWorkflow } from './worker-proxy.ts';
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

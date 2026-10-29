import { queryRows, execute, queryOne, withTransaction } from '../db/mysql.ts';
import { recordSecurityEvent } from '../security/runtimeSecurity.ts';
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
} from '../services/cobrancasScheduler.ts';
import {
  jaSemeou,
  marcarSemeado,
  seedMensagensPadrao,
} from '../services/catalogSeeds.ts';
import { env } from '../config/env.ts';
import {
  defaultDeliveryMonitoring,
  defaultDeliveryTracker,
} from '../services/deliveryMonitoringDefaults.ts';
import { automationsEnabled } from '../security/automationPolicy.ts';
import { removerStatusExpirados } from '../services/statusRetention.ts';
import { removerStatusWhatsapp } from '../services/statusRemoval.ts';
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
import { createDashboardWorkflow } from './dashboard.ts';
import { createAccountWorkflow } from './account.ts';
import { createTransactionsWorkflow } from './transactions.ts';
import { createMessagesWorkflow } from './messages.ts';
import { createAutomationWorkflow } from './automation.ts';
import { createAutomationPreview } from '../services/automationPreview.ts';
import { montarMensagem } from '../services/whatsapp.ts';
import { getPixConfig } from '../services/pixConfig.ts';
import { createWhatsappWorkflow } from './whatsapp.ts';
import { createStatusWorkflow } from './status.ts';
import { createPaymentSettingsWorkflow } from './payment-settings.ts';
import { createIntegrationsWorkflow } from './integrations.ts';
import { createPushWorkflow } from './push.ts';
import { createNotificationsWorkflow } from './notifications.ts';
import { createPortalWorkflow } from './portal.ts';
import { createLandingWorkflow } from './landing.ts';
import { createPlaceholderWorkflow } from './placeholder.ts';
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
      auditSecurity: recordSecurityEvent,
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
      queryRows,
      toNullableString,
    }),
    automation: createAutomationWorkflow({
      deliveryPreview: createAutomationPreview({
        queryRows,
        queryOne,
        appTodayIso,
        renderMessage: montarMensagem,
        getPixConfig,
        appUrl: env.appUrl,
        enabled: automationsEnabled(env),
      }),
      deliveryCenter: defaultDeliveryMonitoring,
      agendamentoAtivo: automationsEnabled(env),
      withTransaction,
      execute,
      queryOne,
      queryRows,
      consultaDestinatariosCobranca,
      agruparAvisosCobranca,
      appTodayIso,
      boolField,
      toNullableString,
      toNumber,
      dispararRegraManual: (userId, ruleId) =>
        dispararRegraManual(userId, ruleId, defaultDeliveryTracker),
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
      env,
      execute,
      queryRows,
      toNullableString,
      removerStatusExpirados,
      removerStatusWhatsapp,
      statusHistoryData,
    }),
    'payment-settings': createPaymentSettingsWorkflow({
      auditSecurity: recordSecurityEvent,
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
      auditSecurity: recordSecurityEvent,
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

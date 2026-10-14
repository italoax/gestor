import {
  workflowResult,
  raiseWorkflowError,
} from '../services/workflowReply.ts';
export function createPaymentSettingsWorkflow({
  execute,
  queryOne,
  queryRows,
  env,
  carregarConfigsDoUsuario,
  salvarConfig,
  PROVIDER_LISTA,
  PROVIDER_NOMES,
}) {
  const SCHEMAS = {
    mercadopago: ['access_token'],
    asaas: ['access_token', 'ambiente'],
    openpix: ['app_id'],
    pagbank: ['access_token', 'ambiente'],
    pagarme: ['secret_key'],
  };
  return {
    list: (input) =>
      workflowResult(input, async (reply) => {
        try {
          const userId = input.session.user.id;
          const configs = await carregarConfigsDoUsuario(userId);
          const mensagens = await queryRows(
            'SELECT id, titulo FROM mensagens WHERE user_id = :userId ORDER BY titulo',
            { userId },
          );
          const preferencia = await queryOne(
            'SELECT mensagem_pix_confirmado_id AS mensagemId, provider_padrao AS providerPadrao FROM users WHERE id = :userId',
            { userId },
          );
          const credPorProvider: Record<string, any> = {};
          const ativoPorProvider: Record<string, any> = {};
          for (const c of configs) {
            credPorProvider[c.provider] = c.credenciais;
            ativoPorProvider[c.provider] = c.ativo;
          }
          reply.render('pages/integracao-pagamento', {
            title: 'Integração Pagamento',
            mensagens,
            appUrl: env.appUrl.replace(/\/$/, ''),
            providerPadrao:
              preferencia?.providerPadrao ||
              configs.find((c) => c.ativo)?.provider ||
              '',
            mensagemConfirmacaoId: preferencia?.mensagemId ?? null,
            providers: PROVIDER_LISTA,
            providerNomes: PROVIDER_NOMES,
            credPorProvider,
            ativoPorProvider,
          });
        } catch (error) {
          raiseWorkflowError(error);
        }
      }),
    change: (input) =>
      workflowResult(input, async (reply) => {
        try {
          const userId = input.session.user.id;
          const provider = String(input.body.provider ?? '');
          if (input.body.action === 'provedor-padrao') {
            const configs = await carregarConfigsDoUsuario(userId);
            if (!configs.some((c) => c.provider === provider && c.ativo)) {
              input.flash(
                'error',
                'Configure e ative o provedor antes de selecioná-lo.',
              );
              return reply.redirect('/integracao-pagamento');
            }
            await execute(
              'UPDATE users SET provider_padrao = :provider WHERE id = :userId',
              { provider, userId },
            );
            input.flash('success', 'Provedor para receber PIX atualizado.');
            return reply.redirect('/integracao-pagamento');
          }
          if (input.body.action === 'mensagem-confirmacao') {
            const raw = String(input.body.mensagem_id ?? '');
            const mensagemId = raw ? Number(raw) : null;
            if (
              raw &&
              (!Number.isSafeInteger(mensagemId) ||
                !(await queryOne(
                  'SELECT id FROM mensagens WHERE id = :id AND user_id = :userId',
                  { id: mensagemId, userId },
                )))
            ) {
              input.flash('error', 'Escolha uma mensagem válida.');
              return reply.redirect('/integracao-pagamento');
            }
            await execute(
              'UPDATE users SET mensagem_pix_confirmado_id = :mensagemId WHERE id = :userId',
              { mensagemId, userId },
            );
            input.flash('success', 'Mensagem após confirmação do PIX salva.');
            return reply.redirect('/integracao-pagamento');
          }
          if (!SCHEMAS[provider]) {
            input.flash('error', 'Provedor inválido.');
            return reply.redirect('/integracao-pagamento');
          }
          const credenciais: Record<string, any> = {};
          let temAlgo = false;
          for (const campo of SCHEMAS[provider]) {
            const v = String(
              input.body[`creds_${provider}_${campo}`] ?? '',
            ).trim();
            if (v) {
              credenciais[campo] = v;
              temAlgo = true;
            }
          }
          const ativo = input.body[`ativo_${provider}`] === '1' && temAlgo;
          await salvarConfig(userId, provider, credenciais, ativo);
          input.flash('success', `${provider} ${ativo ? 'ativado' : 'salvo'}.`);
          return reply.redirect('/integracao-pagamento');
        } catch (error) {
          raiseWorkflowError(error);
        }
      }),
  };
}

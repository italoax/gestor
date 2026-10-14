import {
  workflowResult,
  raiseWorkflowError,
} from '../services/workflowReply.ts';
export function createNotificationsWorkflow({
  contarNaoLidas,
  excluirNotificacao,
  limparTodas,
  listarNotificacoes,
  marcarLida,
  marcarTodasLidas,
  sincronizarAlertasCreditos,
}) {
  return {
    overview: (input) =>
      workflowResult(input, async (reply) => {
        reply.render('pages/avisos', {
          title: 'Avisos',
          subtitle: 'Atalhos para seus painéis e aplicativos',
        });
      }),
    list: (input) =>
      workflowResult(input, async (reply) => {
        try {
          const userId = input.session.user.id;
          await sincronizarAlertasCreditos(userId);
          const [items, naoLidas] = await Promise.all([
            listarNotificacoes(userId, 30),
            contarNaoLidas(userId),
          ]);
          reply
            .set('Cache-Control', 'no-store')
            .json({ ok: true, items, naoLidas });
        } catch (error) {
          raiseWorkflowError(error);
        }
      }),
    readAll: (input) =>
      workflowResult(input, async (reply) => {
        try {
          await marcarTodasLidas(input.session.user.id);
          reply.json({ ok: true });
        } catch (error) {
          raiseWorkflowError(error);
        }
      }),
    read: (input) =>
      workflowResult(input, async (reply) => {
        try {
          const id = Number(input.params.id);
          if (!id)
            return reply.status(400).json({ ok: false, error: 'id inválido' });
          await marcarLida(input.session.user.id, id);
          reply.json({ ok: true });
        } catch (error) {
          raiseWorkflowError(error);
        }
      }),
    remove: (input) =>
      workflowResult(input, async (reply) => {
        try {
          const id = Number(input.params.id);
          if (!id)
            return reply.status(400).json({ ok: false, error: 'id inválido' });
          await excluirNotificacao(input.session.user.id, id);
          reply.json({ ok: true });
        } catch (error) {
          raiseWorkflowError(error);
        }
      }),
    clear: (input) =>
      workflowResult(input, async (reply) => {
        try {
          await limparTodas(input.session.user.id);
          reply.json({ ok: true });
        } catch (error) {
          raiseWorkflowError(error);
        }
      }),
  };
}

import {
  workflowResult,
  raiseWorkflowError,
} from '../services/workflowReply.ts';
export function createPushWorkflow({
  execute,
  vapidPublicKey,
  pushDisponivel,
  publicHttpsUrl,
}) {
  return {
    publicKey: (input) =>
      workflowResult(input, async (reply) => {
        reply.json({
          ok: true,
          key: vapidPublicKey(),
          enabled: pushDisponivel(),
        });
      }),
    subscribe: (input) =>
      workflowResult(input, async (reply) => {
        try {
          const userId = input.session.user.id;
          const sub = input.body;
          const endpoint = String(sub?.endpoint ?? '');
          const p256dh = String(sub?.keys?.p256dh ?? '');
          const auth = String(sub?.keys?.auth ?? '');
          if (!endpoint || !p256dh || !auth)
            return reply
              .status(400)
              .json({ ok: false, error: 'Inscrição inválida.' });
          try {
            publicHttpsUrl(endpoint);
          } catch {
            return reply
              .status(400)
              .json({ ok: false, error: 'Endpoint push inválido.' });
          }
          const ua = String(input.get('user-agent') ?? '').slice(0, 250);
          await execute(
            `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
       VALUES (:userId, :endpoint, :p256dh, :auth, :ua)
       ON DUPLICATE KEY UPDATE user_id = VALUES(user_id), p256dh = VALUES(p256dh), auth = VALUES(auth), user_agent = VALUES(user_agent)`,
            { userId, endpoint, p256dh, auth, ua },
          );
          reply.json({ ok: true });
        } catch (error) {
          raiseWorkflowError(error);
        }
      }),
    unsubscribe: (input) =>
      workflowResult(input, async (reply) => {
        try {
          const endpoint = String(input.body?.endpoint ?? '');
          if (!endpoint)
            return reply
              .status(400)
              .json({ ok: false, error: 'endpoint obrigatório.' });
          await execute(
            `DELETE FROM push_subscriptions WHERE endpoint = :endpoint AND user_id = :userId`,
            { endpoint, userId: input.session.user.id },
          );
          reply.json({ ok: true });
        } catch (error) {
          raiseWorkflowError(error);
        }
      }),
  };
}

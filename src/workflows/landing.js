import {
  workflowResult,
  raiseWorkflowError,
} from '../services/workflowReply.js';
export function createLandingWorkflow({}) {
  return {
    alias: (input) =>
      workflowResult(input, async (reply) => {
        reply.redirect(301, '/');
      }),
    home: (input) =>
      workflowResult(input, async (reply) => {
        const phone = (
          process.env.IX_STREAMING_WHATSAPP ?? '5531982453768'
        ).replace(/\D/g, '');
        const contact = /^\d{10,15}$/.test(phone) ? phone : '';
        const contactUrl = (price) =>
          contact
            ? `https://wa.me/${contact}?text=${encodeURIComponent(
                price
                  ? `Olá! Quero conhecer o plano de R$ ${price}/mês da ixstreaming.`
                  : 'Olá! Quero conhecer os planos da ixstreaming.',
              )}`
            : '#contato';
        reply.render('pages/ix-streaming', {
          layout: false,
          contactReady: Boolean(contact),
          contactUrl,
        });
      }),
  };
}

import {
  workflowResult,
  raiseWorkflowError,
} from '../services/workflowReply.js';
export function createPlaceholderWorkflow({}) {
  return {
    page: (input) =>
      workflowResult(input, async (reply) => {
        const slug = String(input.params.slug ?? '').toLowerCase();
        if (slug === 'testes') return reply.redirect('/dashboard');
        const recurso = {
          titulo: 'Em breve',
          icon: '🚧',
          descricao: 'Este recurso está em desenvolvimento.',
        };
        reply.render('pages/em-breve', { title: recurso.titulo, recurso });
      }),
  };
}

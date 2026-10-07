import { Router } from 'express';
import { queryOne } from '../db/mysql.js';
import { renovarClienteAutomatico } from '../services/autoRenovacao.js';
import { renovarPlanosDoCliente } from '../services/renovacaoConjunta.js';
import { CreditosError } from '../services/creditos.js';
import {
  contarNaoLidas,
  excluirNotificacao,
  limparTodas,
  listarNotificacoes,
  marcarLida,
  marcarTodasLidas,
  sincronizarAlertasCreditos,
} from '../services/notificacoes.js';
export const notificacoesRouter = Router();
notificacoesRouter.post(
  '/pagamentos/:id/confirmar-renovacao',
  async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      const userId = req.session.user.id;
      if (!Number.isSafeInteger(id) || id <= 0)
        return res
          .status(400)
          .json({ ok: false, error: 'Pagamento inválido.' });
      const pagamento = await queryOne(
        "SELECT cliente_id AS clienteId, renovacao_dados AS dados FROM pagamentos WHERE id = :id AND user_id = :userId AND status = 'approved' AND renovado_em IS NULL",
        { id, userId },
      );
      if (!pagamento)
        return res
          .status(404)
          .json({
            ok: false,
            error: 'Pagamento não encontrado ou renovação já confirmada.',
          });
      if (pagamento.dados && JSON.parse(pagamento.dados).versao === 1) {
        try {
          const resultado = await renovarPlanosDoCliente(
            userId,
            Number(pagamento.clienteId),
            { pagamentoId: id },
          );
          await sincronizarAlertasCreditos(userId);
          return res.json({
            ok: true,
            vencimentos: resultado.itens.map((item) => ({
              plano: item.plano,
              vencimento: item.vencimento,
            })),
          });
        } catch (error) {
          if (error instanceof CreditosError)
            return res.status(409).json({ ok: false, error: error.message });
          throw error;
        }
      }
      const resultado = await renovarClienteAutomatico(
        userId,
        Number(pagamento.clienteId),
        0,
        1,
        undefined,
        id,
      );
      if (!resultado.renovado)
        return res
          .status(409)
          .json({
            ok: false,
            error:
              resultado.motivo || 'Não foi possível confirmar a renovação.',
          });
      return res.json({ ok: true, novoVencimento: resultado.novoVencimento });
    } catch (error) {
      next(error);
    }
  },
);
// Lista as últimas + contador de não lidas. Polled pelo topbar a cada minuto.
notificacoesRouter.get('/notificacoes', async (req, res, next) => {
  try {
    const userId = req.session.user.id;
    await sincronizarAlertasCreditos(userId);
    const [items, naoLidas] = await Promise.all([
      listarNotificacoes(userId, 30),
      contarNaoLidas(userId),
    ]);
    res.set('Cache-Control', 'no-store').json({ ok: true, items, naoLidas });
  } catch (error) {
    next(error);
  }
});
notificacoesRouter.post(
  '/notificacoes/marcar-todas-lidas',
  async (req, res, next) => {
    try {
      await marcarTodasLidas(req.session.user.id);
      res.json({ ok: true });
    } catch (error) {
      next(error);
    }
  },
);
notificacoesRouter.post('/notificacoes/:id/lida', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ ok: false, error: 'id inválido' });
    await marcarLida(req.session.user.id, id);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});
notificacoesRouter.post('/notificacoes/:id/excluir', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ ok: false, error: 'id inválido' });
    await excluirNotificacao(req.session.user.id, id);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});
notificacoesRouter.post('/notificacoes/limpar', async (req, res, next) => {
  try {
    await limparTodas(req.session.user.id);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

import { Router } from 'express';
import { execute, queryRows } from '../db/mysql.js';
export const transacoesRouter = Router();
transacoesRouter.get('/transacoes', async (req, res, next) => {
  try {
    const userId = req.session.user.id;
    const [statsRows, transacoes, clientes, planos, servidores] =
      await Promise.all([
        queryRows(
          `SELECT COUNT(*) AS totalTx,
                COALESCE(SUM(telas), 0) AS somaTelas,
                COALESCE(SUM(creditos), 0) AS somaCreditos,
                COALESCE(SUM(valor_venda), 0) AS somaReceita,
                COALESCE(SUM(lucro), 0) AS somaLucro
           FROM transacoes WHERE user_id = :userId`,
          { userId },
        ),
        queryRows(
          `SELECT id, data, forma_pagamento AS formaPagamento, cliente_id AS clienteId, cliente_nome AS clienteNome,
                descricao, plano, servidor, telas, creditos, custo, valor_venda AS valorVenda, lucro
           FROM transacoes WHERE user_id = :userId ORDER BY data DESC, id DESC LIMIT 500`,
          { userId },
        ),
        queryRows(
          'SELECT id, nome, plano, servidor, telas, valor FROM clientes WHERE user_id = :userId ORDER BY nome ASC',
          { userId },
        ),
        queryRows(
          'SELECT id, nome FROM planos WHERE user_id = :userId ORDER BY nome ASC',
          { userId },
        ),
        queryRows(
          'SELECT id, nome FROM servidores WHERE user_id = :userId ORDER BY nome ASC',
          { userId },
        ),
      ]);
    const s = statsRows[0] ?? {};
    const stats = {
      total: Number(s.totalTx ?? 0),
      telas: Number(s.somaTelas ?? 0),
      creditos: Number(s.somaCreditos ?? 0),
      receita: Number(s.somaReceita ?? 0),
      lucro: Number(s.somaLucro ?? 0),
    };
    res.render('pages/transacoes', {
      title: 'Transações de Clientes',
      subtitle: 'Controle de créditos usados e recargas',
      stats,
      transacoes,
      clientes,
      planos,
      servidores,
    });
  } catch (error) {
    next(error);
  }
});
// Transações são apenas de leitura: geradas automaticamente em cadastros/renovações.
// A única ação permitida é apagar (criar/editar foram removidos).
transacoesRouter.post('/transacoes', async (req, res, next) => {
  try {
    const userId = req.session.user.id;
    const action = String(req.body.action ?? '');
    const id = Number(req.body.id);
    if (action === 'delete_transacao') {
      await execute(
        'DELETE FROM transacoes WHERE id = :id AND user_id = :userId',
        { id, userId },
      );
      req.flash('success', 'Transação apagada.');
    }
    return res.redirect('/transacoes');
  } catch (error) {
    next(error);
  }
});

import {
  workflowResult,
  raiseWorkflowError,
} from '../services/workflowReply.ts';
import {
  transactionsPageWindow,
  transactionsPageUrl,
  transactionsFilters,
  transactionSearchPattern,
} from '../services/transactionsPage.ts';
import { transactionDetails } from '../services/transactionDetails.ts';
export function createTransactionsWorkflow({ execute, queryRows }) {
  return {
    list: (input) =>
      workflowResult(input, async (reply) => {
        try {
          const userId = input.session.user.id;
          const page = transactionsPageWindow(input.query);
          const filters = transactionsFilters(input.query);
          const conditions = ['user_id = :userId'];
          const params: Record<string, unknown> = { userId };
          if (filters.busca) {
            conditions.push(`CONCAT_WS(' ', cliente_nome, descricao, servidor, plano, forma_pagamento,
              DATE_FORMAT(data, '%d/%m/%Y'), CAST(data AS CHAR)) COLLATE utf8mb4_unicode_ci LIKE :busca ESCAPE '='`);
            params.busca = transactionSearchPattern(filters.busca);
          }
          if (filters.pagamento) {
            conditions.push('TRIM(forma_pagamento) = :pagamento');
            params.pagamento = filters.pagamento;
          }
          const [
            statsRows,
            transacoes,
            clientes,
            planos,
            servidores,
            payments,
          ] = await Promise.all([
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
           FROM transacoes WHERE ${conditions.join(' AND ')} ORDER BY data DESC, id DESC
           LIMIT ${page.porPagina + 1} OFFSET ${page.offset}`,
              params,
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
            queryRows(
              `SELECT DISTINCT TRIM(forma_pagamento) AS nome FROM transacoes
                 WHERE user_id = :userId AND COALESCE(TRIM(forma_pagamento), '') <> '' ORDER BY nome ASC`,
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
          reply.render('pages/transacoes', {
            title: 'Transações de Clientes',
            subtitle: 'Controle de créditos usados e recargas',
            stats,
            filtros: filters,
            formasPagamento: payments.map((item) => String(item.nome)),
            transacoes: transacoes
              .slice(0, page.porPagina)
              .map((item) => ({ ...item, ...transactionDetails(item) })),
            paginacao: {
              pagina: page.pagina,
              porPagina: page.porPagina,
              temMais: transacoes.length > page.porPagina,
              anteriorUrl:
                page.pagina > 1
                  ? transactionsPageUrl(
                      page.pagina - 1,
                      page.porPagina,
                      filters,
                    )
                  : null,
              proximaUrl:
                transacoes.length > page.porPagina
                  ? transactionsPageUrl(
                      page.pagina + 1,
                      page.porPagina,
                      filters,
                    )
                  : null,
            },
            clientes,
            planos,
            servidores,
          });
        } catch (error) {
          raiseWorkflowError(error);
        }
      }),
    change: (input) =>
      workflowResult(input, async (reply) => {
        try {
          const userId = input.session.user.id;
          const action = String(input.body.action ?? '');
          const id = Number(input.body.id);
          if (action === 'delete_transacao') {
            await execute(
              'DELETE FROM transacoes WHERE id = :id AND user_id = :userId',
              { id, userId },
            );
            input.flash('success', 'Transação apagada.');
          }
          return reply.redirect('/transacoes');
        } catch (error) {
          raiseWorkflowError(error);
        }
      }),
  };
}

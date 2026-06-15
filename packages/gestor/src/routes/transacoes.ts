import { Router } from "express";
import { execute, queryOne, queryRows } from "../db/mysql.js";
import { appTodayIso } from "../services/dates.js";
import { toNullableString, toNumber } from "../services/format.js";
import type { RowDataPacket } from "mysql2";

interface TransacaoRow extends RowDataPacket {
  id: number; data: Date | string; formaPagamento: string | null; clienteId: number | null;
  clienteNome: string | null; descricao: string | null; plano: string | null; servidor: string | null;
  telas: number; creditos: number; custo: number; valorVenda: number; lucro: number;
}
interface StatRow extends RowDataPacket { totalTx: number; somaTelas: number; somaCreditos: number; somaReceita: number; somaLucro: number; }
interface ClienteOptRow extends RowDataPacket { id: number; nome: string; plano: string; servidor: string; telas: number; valor: number; }
interface NomeRow extends RowDataPacket { id: number; nome: string; }
interface ClienteNomeRow extends RowDataPacket { nome: string; }

export const transacoesRouter = Router();

transacoesRouter.get("/transacoes", async (req, res, next) => {
  try {
    const userId = req.session.user!.id;
    const [statsRows, transacoes, clientes, planos, servidores] = await Promise.all([
      queryRows<StatRow>(
        `SELECT COUNT(*) AS totalTx,
                COALESCE(SUM(telas), 0) AS somaTelas,
                COALESCE(SUM(creditos), 0) AS somaCreditos,
                COALESCE(SUM(valor_venda), 0) AS somaReceita,
                COALESCE(SUM(lucro), 0) AS somaLucro
           FROM transacoes WHERE user_id = :userId`,
        { userId },
      ),
      queryRows<TransacaoRow>(
        `SELECT id, data, forma_pagamento AS formaPagamento, cliente_id AS clienteId, cliente_nome AS clienteNome,
                descricao, plano, servidor, telas, creditos, custo, valor_venda AS valorVenda, lucro
           FROM transacoes WHERE user_id = :userId ORDER BY data DESC, id DESC LIMIT 500`,
        { userId },
      ),
      queryRows<ClienteOptRow>("SELECT id, nome, plano, servidor, telas, valor FROM clientes WHERE user_id = :userId ORDER BY nome ASC", { userId }),
      queryRows<NomeRow>("SELECT id, nome FROM planos WHERE user_id = :userId ORDER BY nome ASC", { userId }),
      queryRows<NomeRow>("SELECT id, nome FROM servidores WHERE user_id = :userId ORDER BY nome ASC", { userId }),
    ]);

    const s = statsRows[0] ?? {} as StatRow;
    const stats = {
      total: Number(s.totalTx ?? 0),
      telas: Number(s.somaTelas ?? 0),
      creditos: Number(s.somaCreditos ?? 0),
      receita: Number(s.somaReceita ?? 0),
      lucro: Number(s.somaLucro ?? 0),
    };
    res.render("pages/transacoes", { title: "Transações de Clientes", subtitle: "Controle de créditos usados e recargas", stats, transacoes, clientes, planos, servidores });
  } catch (error) { next(error); }
});

transacoesRouter.post("/transacoes", async (req, res, next) => {
  try {
    const userId = req.session.user!.id;
    const action = String(req.body.action ?? "");
    const id = Number(req.body.id);

    if (action === "delete_transacao") {
      await execute("DELETE FROM transacoes WHERE id = :id AND user_id = :userId", { id, userId });
      req.flash("success", "Transação apagada.");
      return res.redirect("/transacoes");
    }

    const clienteId = req.body.cliente_id ? Number(req.body.cliente_id) : null;
    let clienteNome: string | null = null;
    if (clienteId) {
      const cliente = await queryOne<ClienteNomeRow>("SELECT nome FROM clientes WHERE id = :clienteId AND user_id = :userId LIMIT 1", { clienteId, userId });
      clienteNome = cliente?.nome ?? null;
    }

    const custo = toNumber(req.body.custo);
    const valorVenda = toNumber(req.body.valor_venda);
    const data = {
      id, userId,
      data: toNullableString(req.body.data) ?? appTodayIso(),
      formaPagamento: toNullableString(req.body.forma_pagamento),
      clienteId,
      clienteNome,
      descricao: toNullableString(req.body.descricao),
      plano: toNullableString(req.body.plano),
      servidor: toNullableString(req.body.servidor),
      telas: toNumber(req.body.telas, 1),
      creditos: toNumber(req.body.creditos),
      custo,
      valorVenda,
      lucro: Number((valorVenda - custo).toFixed(2)),
    };

    if (!data.valorVenda && data.valorVenda !== 0) {
      req.flash("error", "Informe o valor de venda.");
      return res.redirect("/transacoes");
    }

    if (action === "update_transacao") {
      await execute(
        `UPDATE transacoes SET data = :data, forma_pagamento = :formaPagamento, cliente_id = :clienteId,
             cliente_nome = :clienteNome, descricao = :descricao, plano = :plano, servidor = :servidor,
             telas = :telas, creditos = :creditos, custo = :custo, valor_venda = :valorVenda, lucro = :lucro
          WHERE id = :id AND user_id = :userId`, data);
      req.flash("success", "Transação atualizada.");
    } else {
      await execute(
        `INSERT INTO transacoes (user_id, data, forma_pagamento, cliente_id, cliente_nome, descricao, plano,
             servidor, telas, creditos, custo, valor_venda, lucro)
         VALUES (:userId, :data, :formaPagamento, :clienteId, :clienteNome, :descricao, :plano,
             :servidor, :telas, :creditos, :custo, :valorVenda, :lucro)`, data);
      req.flash("success", "Transação registrada.");
    }
    return res.redirect("/transacoes");
  } catch (error) { next(error); }
});

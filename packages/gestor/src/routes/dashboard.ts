import { Router } from "express";
import { queryRows } from "../db/mysql.js";
import { appTodayIso } from "../services/dates.js";
import type { RowDataPacket } from "mysql2";

interface CountRow extends RowDataPacket { total: number; }
interface DashboardTotalsRow extends RowDataPacket {
  clientesTotal: number;
  ativos: number;
  vencidos: number;
  vencemHoje: number;
  vencem7: number;
  receitaPrevista: number;
  faturamentoMes: number;
  custoMes: number;
  lucroMes: number;
  totalPago: number;
}
interface ClientePrazoRow extends RowDataPacket {
  id: number;
  nome: string;
  telefone: string;
  vencimento: Date | string;
  plano: string;
  valor: number;
  dias: number;
}
interface ServidorResumoRow extends RowDataPacket {
  servidor: string;
  total: number;
  valor: number;
}

export const dashboardRouter = Router();

async function count(sql: string, params: Record<string, unknown>) {
  const rows = await queryRows<CountRow>(sql, params);
  return Number(rows[0]?.total ?? 0);
}

function num(value: unknown) {
  return Number(value ?? 0);
}

dashboardRouter.get("/", (_, res) => res.redirect("/dashboard"));

dashboardRouter.get("/dashboard", async (req, res, next) => {
  try {
    const userId = req.session.user!.id;
    const today = appTodayIso();
    const [totalsRows, planos, servidores, proximos, atrasados, porServidor] = await Promise.all([
      queryRows<DashboardTotalsRow>(
        `SELECT
            COUNT(*) AS clientesTotal,
            SUM(CASE WHEN status = 'Ativo' THEN 1 ELSE 0 END) AS ativos,
            SUM(CASE WHEN vencimento < :today THEN 1 ELSE 0 END) AS vencidos,
            SUM(CASE WHEN vencimento = :today THEN 1 ELSE 0 END) AS vencemHoje,
            SUM(CASE WHEN vencimento BETWEEN :today AND DATE_ADD(:today, INTERVAL 7 DAY) THEN 1 ELSE 0 END) AS vencem7,
            COALESCE(SUM(valor), 0) AS receitaPrevista,
            COALESCE(SUM(CASE WHEN pago_em IS NOT NULL AND YEAR(pago_em) = YEAR(:today) AND MONTH(pago_em) = MONTH(:today) THEN valor_pago ELSE 0 END), 0) AS faturamentoMes,
            COALESCE(SUM(CASE WHEN pago_em IS NOT NULL AND YEAR(pago_em) = YEAR(:today) AND MONTH(pago_em) = MONTH(:today) THEN custo_pagamento ELSE 0 END), 0) AS custoMes,
            COALESCE(SUM(CASE WHEN pago_em IS NOT NULL AND YEAR(pago_em) = YEAR(:today) AND MONTH(pago_em) = MONTH(:today) THEN valor_pago - COALESCE(custo_pagamento, 0) ELSE 0 END), 0) AS lucroMes,
            COALESCE(SUM(valor_pago), 0) AS totalPago
          FROM clientes
          WHERE user_id = :userId`,
        { userId, today },
      ),
      count("SELECT COUNT(*) AS total FROM planos WHERE user_id = :userId", { userId }),
      count("SELECT COUNT(*) AS total FROM servidores WHERE user_id = :userId", { userId }),
      queryRows<ClientePrazoRow>(
        `SELECT id, nome, telefone, vencimento, plano, valor, DATEDIFF(vencimento, :today) AS dias
           FROM clientes
          WHERE user_id = :userId AND vencimento >= :today
          ORDER BY vencimento ASC, nome ASC
          LIMIT 8`,
        { userId, today },
      ),
      queryRows<ClientePrazoRow>(
        `SELECT id, nome, telefone, vencimento, plano, valor, DATEDIFF(vencimento, :today) AS dias
           FROM clientes
          WHERE user_id = :userId AND vencimento < :today
          ORDER BY vencimento ASC, nome ASC
          LIMIT 8`,
        { userId, today },
      ),
      queryRows<ServidorResumoRow>(
        `SELECT COALESCE(NULLIF(TRIM(servidor), ''), 'Sem servidor') AS servidor,
                COUNT(*) AS total,
                COALESCE(SUM(valor), 0) AS valor
           FROM clientes
          WHERE user_id = :userId
          GROUP BY COALESCE(NULLIF(TRIM(servidor), ''), 'Sem servidor')
          ORDER BY total DESC, servidor ASC
          LIMIT 6`,
        { userId },
      ),
    ]);

    const raw = totalsRows[0] ?? {} as DashboardTotalsRow;
    const stats = {
      clientesTotal: num(raw.clientesTotal),
      ativos: num(raw.ativos),
      vencidos: num(raw.vencidos),
      vencemHoje: num(raw.vencemHoje),
      vencem7: num(raw.vencem7),
      planos,
      servidores,
      receitaPrevista: num(raw.receitaPrevista),
      faturamentoMes: num(raw.faturamentoMes),
      custoMes: num(raw.custoMes),
      lucroMes: num(raw.lucroMes),
      totalPago: num(raw.totalPago),
    };
    const receitaBase = stats.receitaPrevista || 1;
    const vencidosPercent = stats.clientesTotal ? Math.round((stats.vencidos / stats.clientesTotal) * 100) : 0;
    const ativosPercent = stats.clientesTotal ? Math.round((stats.ativos / stats.clientesTotal) * 100) : 0;
    const lucroPercent = stats.faturamentoMes ? Math.round((stats.lucroMes / stats.faturamentoMes) * 100) : 0;

    res.render("pages/dashboard", {
      title: "Dashboard",
      stats,
      vencidosPercent,
      ativosPercent,
      lucroPercent,
      proximos,
      atrasados,
      porServidor: porServidor.map(item => ({
        ...item,
        total: num(item.total),
        valor: num(item.valor),
        percent: Math.max(8, Math.round((num(item.valor) / receitaBase) * 100)),
      })),
    });
  } catch (error) { next(error); }
});

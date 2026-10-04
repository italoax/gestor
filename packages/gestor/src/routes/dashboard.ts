import { Router } from "express";
import { queryRows } from "../db/mysql.js";
import { appTodayIso } from "../services/dates.js";
import { PAIS_NOME, UF_NOME, paisFromTelefone, ufFromTelefone } from "../services/geo.js";
import type { RowDataPacket } from "mysql2";

interface CountRow extends RowDataPacket { total: number; }
interface DashboardTotalsRow extends RowDataPacket {
  clientesTotal: number;
  ativos: number;
  vencidos: number;
  venceHoje: number; venceHojeValor: number;
  venceAmanha: number; venceAmanhaValor: number;
  venceuOntem: number; venceuOntemValor: number;
  receitaPrevista: number;
}
interface FinanceirasRow extends RowDataPacket {
  recebidoHoje: number; custoHoje: number;
  recebidoMes: number; custoMes: number;
  recebidoMesAnterior: number; custoMesAnterior: number;
}
interface ClientePrazoRow extends RowDataPacket {
  id: number; nome: string; telefone: string; vencimento: Date | string; plano: string; valor: number; dias: number;
}
interface DistribuicaoRow extends RowDataPacket { rotulo: string; total: number; valor: number; }
interface ServidorPerfRow extends RowDataPacket { servidor: string; total: number; faturamento: number; custo: number; }
interface SerieDiaRow extends RowDataPacket { dia: number; receita: number; custo: number; }
interface NovosDiaRow extends RowDataPacket { dia: number; total: number; }
interface TelefoneRow extends RowDataPacket { telefone: string | null; }

type Periodo = "mes" | "anterior" | "todos";

export const dashboardRouter = Router();

async function count(sql: string, params: Record<string, unknown>) {
  const rows = await queryRows<CountRow>(sql, params);
  return Number(rows[0]?.total ?? 0);
}

function num(value: unknown) {
  return Number(value ?? 0);
}

dashboardRouter.get("/", (_, res) => res.redirect("/dashboard"));

// Cache em memória do payload do dashboard. Dashboard roda 14 queries pesadas
// (DATEDIFF, GROUP BY mês, série diária) — refresh a cada clique custa caro.
// 60s é o suficiente pra cobrir o usuário recarregando, mas curto pra dados
// novos aparecerem rápido. Chave inclui periodo porque ?periodo= muda o filtro.
type DashboardPayload = Record<string, unknown>;
const dashboardCache = new Map<string, { expiresAt: number; payload: DashboardPayload }>();
const DASHBOARD_CACHE_TTL_MS = 60_000;

// Invalida cache do usuário — chame quando algo mudar (criar cliente, renovar, etc).
// Por ora é usado só na sessão atual; rotas que escrevem podem chamar isso pra forçar refresh.
export function invalidarDashboardCache(userId: number) {
  for (const key of dashboardCache.keys()) {
    if (key.startsWith(`${userId}:`)) dashboardCache.delete(key);
  }
}

dashboardRouter.get("/dashboard", async (req, res, next) => {
  try {
    const userId = req.session.user!.id;
    const periodoRawCache = String(req.query.periodo ?? "todos");
    const cacheKey = `${userId}:${periodoRawCache}`;
    const cached = dashboardCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return res.render("pages/dashboard", cached.payload);
    }
    const today = appTodayIso();
    const year = Number(today.slice(0, 4));
    const month = Number(today.slice(5, 7));
    const dayOfMonth = Number(today.slice(8, 10));
    const daysInMonth = new Date(year, month, 0).getDate();

    const [totalsRows, financeirasRows, planosCount, servidoresCount, proximos, atrasados, serieFinanceira, serieNovos] = await Promise.all([
      // Contagens de clientes/vencimentos — vêm da tabela de clientes.
      queryRows<DashboardTotalsRow>(
        // Vencidos só conta clientes Ativos (mesmo critério da tela de Clientes —
        // statusByVencimento trata 'Inativo' como categoria separada). Antes
        // inativos vencidos infláva o card "Vencidos" do dashboard sem aparecer
        // no badge vermelho da listagem.
        `SELECT
            COUNT(*) AS clientesTotal,
            COALESCE(SUM(status = 'Ativo' AND vencimento >= :today), 0) AS ativos,
            COALESCE(SUM(status = 'Ativo' AND vencimento < :today), 0) AS vencidos,
            COALESCE(SUM(vencimento = :today), 0) AS venceHoje,
            COALESCE(SUM(CASE WHEN vencimento = :today THEN valor ELSE 0 END), 0) AS venceHojeValor,
            COALESCE(SUM(vencimento = DATE_ADD(:today, INTERVAL 1 DAY)), 0) AS venceAmanha,
            COALESCE(SUM(CASE WHEN vencimento = DATE_ADD(:today, INTERVAL 1 DAY) THEN valor ELSE 0 END), 0) AS venceAmanhaValor,
            COALESCE(SUM(vencimento = DATE_SUB(:today, INTERVAL 1 DAY)), 0) AS venceuOntem,
            COALESCE(SUM(CASE WHEN vencimento = DATE_SUB(:today, INTERVAL 1 DAY) THEN valor ELSE 0 END), 0) AS venceuOntemValor,
            COALESCE(SUM(valor), 0) AS receitaPrevista
          FROM clientes
          WHERE user_id = :userId AND arquivado = 0`,
        { userId, today },
      ),
      // Valores financeiros vêm exclusivamente da tabela de transações
      // (cadastros + renovações com pagamento). Cadastros sem pagamento não
      // geram transação — então não inflam receita/custo aqui.
      queryRows<FinanceirasRow>(
        `SELECT
            COALESCE(SUM(CASE WHEN DATE(data) = :today THEN valor_venda ELSE 0 END), 0) AS recebidoHoje,
            COALESCE(SUM(CASE WHEN DATE(data) = :today THEN custo ELSE 0 END), 0) AS custoHoje,
            COALESCE(SUM(CASE WHEN YEAR(data) = YEAR(:today) AND MONTH(data) = MONTH(:today) THEN valor_venda ELSE 0 END), 0) AS recebidoMes,
            COALESCE(SUM(CASE WHEN YEAR(data) = YEAR(:today) AND MONTH(data) = MONTH(:today) THEN custo ELSE 0 END), 0) AS custoMes,
            COALESCE(SUM(CASE WHEN YEAR(data) = YEAR(DATE_SUB(:today, INTERVAL 1 MONTH)) AND MONTH(data) = MONTH(DATE_SUB(:today, INTERVAL 1 MONTH)) THEN valor_venda ELSE 0 END), 0) AS recebidoMesAnterior,
            COALESCE(SUM(CASE WHEN YEAR(data) = YEAR(DATE_SUB(:today, INTERVAL 1 MONTH)) AND MONTH(data) = MONTH(DATE_SUB(:today, INTERVAL 1 MONTH)) THEN custo ELSE 0 END), 0) AS custoMesAnterior
          FROM transacoes
          WHERE user_id = :userId`,
        { userId, today },
      ),
      count("SELECT COUNT(*) AS total FROM planos WHERE user_id = :userId", { userId }),
      count("SELECT COUNT(*) AS total FROM servidores WHERE user_id = :userId", { userId }),
      queryRows<ClientePrazoRow>(
        `SELECT id, nome, telefone, vencimento, plano, valor, DATEDIFF(vencimento, :today) AS dias
           FROM clientes WHERE user_id = :userId AND arquivado = 0 AND vencimento >= :today
          ORDER BY vencimento ASC, nome ASC LIMIT 8`,
        { userId, today },
      ),
      queryRows<ClientePrazoRow>(
        `SELECT id, nome, telefone, vencimento, plano, valor, DATEDIFF(vencimento, :today) AS dias
           FROM clientes WHERE user_id = :userId AND arquivado = 0 AND vencimento < :today
          ORDER BY vencimento DESC, nome ASC LIMIT 8`,
        { userId, today },
      ),
      // Série diária do mês atual — também vem de transações para refletir
      // exatamente o que aparece na aba "Transações de Clientes".
      queryRows<SerieDiaRow>(
        `SELECT DAY(data) AS dia, COALESCE(SUM(valor_venda), 0) AS receita, COALESCE(SUM(custo), 0) AS custo
           FROM transacoes
          WHERE user_id = :userId AND YEAR(data) = YEAR(:today) AND MONTH(data) = MONTH(:today)
          GROUP BY DAY(data) ORDER BY dia`,
        { userId, today },
      ),
      queryRows<NovosDiaRow>(
        // created_at é UTC; subtrai 3h pra cair em SP antes de agrupar por dia/mês,
        // senão clientes cadastrados de noite caem no dia errado no gráfico.
        // Usa `+ INTERVAL -3 HOUR` (sempre disponível) em vez de CONVERT_TZ — esse
        // último depende das tabelas de timezone estarem carregadas e retorna NULL
        // se não estiverem, zerando o gráfico sem aviso.
        `SELECT DAY(created_at + INTERVAL -3 HOUR) AS dia, COUNT(*) AS total
           FROM clientes
          WHERE user_id = :userId
            AND YEAR(created_at + INTERVAL -3 HOUR) = YEAR(:today)
            AND MONTH(created_at + INTERVAL -3 HOUR) = MONTH(:today)
          GROUP BY dia ORDER BY dia`,
        { userId, today },
      ),
    ]);

    const raw = totalsRows[0] ?? {} as DashboardTotalsRow;
    const fin = financeirasRows[0] ?? {} as FinanceirasRow;
    const recebidoHoje = num(fin.recebidoHoje), custoHoje = num(fin.custoHoje);
    const recebidoMes = num(fin.recebidoMes), custoMes = num(fin.custoMes);
    const recebidoMesAnterior = num(fin.recebidoMesAnterior), custoMesAnterior = num(fin.custoMesAnterior);

    const stats = {
      clientesTotal: num(raw.clientesTotal),
      ativos: num(raw.ativos),
      vencidos: num(raw.vencidos),
      servidoresCount,
      planosCount,
      receitaPrevista: num(raw.receitaPrevista),
      vencimentos: {
        hoje: { total: num(raw.venceHoje), valor: num(raw.venceHojeValor) },
        amanha: { total: num(raw.venceAmanha), valor: num(raw.venceAmanhaValor) },
        ontem: { total: num(raw.venceuOntem), valor: num(raw.venceuOntemValor) },
      },
      receitaCusto: {
        hoje: { receita: recebidoHoje, custo: custoHoje, lucro: recebidoHoje - custoHoje },
        mes: { receita: recebidoMes, custo: custoMes, lucro: recebidoMes - custoMes },
        mesAnterior: { receita: recebidoMesAnterior, custo: custoMesAnterior, lucro: recebidoMesAnterior - custoMesAnterior },
      },
      financeiro: {
        recebidoHoje,
        recebidoMes,
        recebidoMesAnterior,
        projecao: recebidoMes > 0 && dayOfMonth > 0 ? (recebidoMes / dayOfMonth) * daysInMonth : 0,
        variacaoMes: recebidoMesAnterior > 0 ? Math.round(((recebidoMes - recebidoMesAnterior) / recebidoMesAnterior) * 100) : 0,
      },
    };

    const ativosPercent = stats.clientesTotal ? Math.round((stats.ativos / stats.clientesTotal) * 100) : 0;
    const vencidosPercent = stats.clientesTotal ? Math.round((stats.vencidos / stats.clientesTotal) * 100) : 0;

    // Séries diárias (1..dia atual) preenchendo zeros.
    const labels: string[] = [];
    const serieReceita: number[] = [];
    const serieCusto: number[] = [];
    const serieLucro: number[] = [];
    const serieNovosClientes: number[] = [];
    const mapaFin = new Map(serieFinanceira.map((r) => [num(r.dia), { receita: num(r.receita), custo: num(r.custo) }]));
    const mapaNovos = new Map(serieNovos.map((r) => [num(r.dia), num(r.total)]));
    const mm = String(month).padStart(2, "0");
    for (let d = 1; d <= dayOfMonth; d += 1) {
      labels.push(`${String(d).padStart(2, "0")}/${mm}`);
      const fin = mapaFin.get(d) ?? { receita: 0, custo: 0 };
      serieReceita.push(fin.receita);
      serieCusto.push(fin.custo);
      serieLucro.push(fin.receita - fin.custo);
      serieNovosClientes.push(mapaNovos.get(d) ?? 0);
    }

    const novosNoMes = serieNovosClientes.reduce((a, b) => a + b, 0);

    // ---- Distribuição (base de clientes não-arquivados, filtrável por vencimento via ?periodo=) ----
    const periodoRaw = String(req.query.periodo ?? "todos");
    const periodo: Periodo = periodoRaw === "mes" || periodoRaw === "anterior" ? periodoRaw : "todos";
    const vencCond = (p: string) =>
      periodo === "mes"
        ? ` AND YEAR(${p}vencimento) = YEAR(:today) AND MONTH(${p}vencimento) = MONTH(:today)`
        : periodo === "anterior"
          ? ` AND YEAR(${p}vencimento) = YEAR(DATE_SUB(:today, INTERVAL 1 MONTH)) AND MONTH(${p}vencimento) = MONTH(DATE_SUB(:today, INTERVAL 1 MONTH))`
          : "";
    const dateWhere = `AND arquivado = 0${vencCond("")}`;
    // Filtro equivalente para a tabela de transações: usa a coluna `data` (data do pagamento).
    const txDateWhere =
      periodo === "mes"
        ? " AND YEAR(data) = YEAR(:today) AND MONTH(data) = MONTH(:today)"
        : periodo === "anterior"
          ? " AND YEAR(data) = YEAR(DATE_SUB(:today, INTERVAL 1 MONTH)) AND MONTH(data) = MONTH(DATE_SUB(:today, INTERVAL 1 MONTH))"
          : "";

    const [formasRows, planosRows, indicacoesRows, dispositivosRows, aplicativosRows, servidoresPerf, telefonesRows] = await Promise.all([
      queryRows<DistribuicaoRow>(
        // Formas de pagamento agora vêm da tabela de transações: cada cadastro/renovação
        // com pagamento gerou um registro, então é a fonte exata.
        `SELECT COALESCE(NULLIF(TRIM(forma_pagamento), ''), 'Não informado') AS rotulo,
                COUNT(*) AS total, COALESCE(SUM(valor_venda), 0) AS valor
           FROM transacoes
          WHERE user_id = :userId ${txDateWhere}
            AND forma_pagamento IS NOT NULL AND TRIM(forma_pagamento) <> ''
          GROUP BY rotulo ORDER BY valor DESC, total DESC LIMIT 8`,
        { userId, today },
      ),
      queryRows<DistribuicaoRow>(
        `SELECT COALESCE(NULLIF(TRIM(plano), ''), 'Sem plano') AS rotulo,
                COUNT(*) AS total, COALESCE(SUM(valor), 0) AS valor
           FROM clientes WHERE user_id = :userId ${dateWhere}
          GROUP BY rotulo ORDER BY total DESC LIMIT 8`,
        { userId, today },
      ),
      queryRows<DistribuicaoRow>(
        `SELECT COALESCE(NULLIF(TRIM(captacao), ''), 'Não informado') AS rotulo,
                COUNT(*) AS total, 0 AS valor
           FROM clientes
          WHERE user_id = :userId ${dateWhere} AND captacao IS NOT NULL AND TRIM(captacao) <> ''
          GROUP BY rotulo ORDER BY total DESC LIMIT 8`,
        { userId, today },
      ),
      queryRows<DistribuicaoRow>(
        `SELECT COALESCE(NULLIF(TRIM(dispositivo), ''), 'Não informado') AS rotulo,
                COUNT(*) AS total, 0 AS valor
           FROM clientes
          WHERE user_id = :userId ${dateWhere} AND dispositivo IS NOT NULL AND TRIM(dispositivo) <> ''
          GROUP BY rotulo ORDER BY total DESC LIMIT 8`,
        { userId, today },
      ),
      queryRows<DistribuicaoRow>(
        `SELECT COALESCE(NULLIF(TRIM(aplicativo), ''), 'Não informado') AS rotulo,
                COUNT(*) AS total, 0 AS valor
           FROM clientes
          WHERE user_id = :userId ${dateWhere} AND aplicativo IS NOT NULL AND TRIM(aplicativo) <> ''
          GROUP BY rotulo ORDER BY total DESC LIMIT 8`,
        { userId, today },
      ),
      queryRows<ServidorPerfRow>(
        // Performance por servidor agora vem da tabela de transações: soma direta de
        // valor_venda e custo agrupado por servidor. "total" = quantidade de clientes
        // distintos com transação no período (mais útil que nº de transações).
        `SELECT COALESCE(NULLIF(TRIM(servidor), ''), 'Sem servidor') AS servidor,
                COUNT(DISTINCT COALESCE(cliente_id, CONCAT('_', id))) AS total,
                COALESCE(SUM(valor_venda), 0) AS faturamento,
                COALESCE(SUM(custo), 0) AS custo
           FROM transacoes
          WHERE user_id = :userId ${txDateWhere}
          GROUP BY servidor ORDER BY faturamento DESC, total DESC LIMIT 8`,
        { userId, today },
      ),
      queryRows<TelefoneRow>(
        `SELECT telefone FROM clientes WHERE user_id = :userId ${dateWhere}`,
        { userId, today },
      ),
    ]);

    const formasTotalValor = formasRows.reduce((a, r) => a + num(r.valor), 0);
    const formasPagamento = formasRows.map((r) => ({
      rotulo: r.rotulo, total: num(r.total), valor: num(r.valor),
      percent: formasTotalValor ? Math.round((num(r.valor) / formasTotalValor) * 100) : 0,
    }));

    const planosTotalCli = planosRows.reduce((a, r) => a + num(r.total), 0);
    const planosDist = planosRows.map((r) => ({
      rotulo: r.rotulo, total: num(r.total),
      percent: planosTotalCli ? Math.round((num(r.total) / planosTotalCli) * 100) : 0,
    }));

    const indicTotal = indicacoesRows.reduce((a, r) => a + num(r.total), 0);
    const indicacoes = indicacoesRows.map((r) => ({
      rotulo: r.rotulo, total: num(r.total),
      percent: indicTotal ? Math.round((num(r.total) / indicTotal) * 100) : 0,
    }));

    const dispTotal = dispositivosRows.reduce((a, r) => a + num(r.total), 0);
    const topDispositivos = dispositivosRows.map((r) => ({
      rotulo: r.rotulo, total: num(r.total),
      percent: dispTotal ? Math.round((num(r.total) / dispTotal) * 100) : 0,
    }));

    const appTotal = aplicativosRows.reduce((a, r) => a + num(r.total), 0);
    const topAplicativos = aplicativosRows.map((r) => ({
      rotulo: r.rotulo, total: num(r.total),
      percent: appTotal ? Math.round((num(r.total) / appTotal) * 100) : 0,
    }));

    const itensServidor = servidoresPerf.map((s) => {
      const faturamento = num(s.faturamento), custo = num(s.custo);
      const lucro = faturamento - custo;
      return {
        servidor: s.servidor, total: num(s.total), faturamento, custo, lucro,
        margem: faturamento ? Math.round((lucro / faturamento) * 100) : 0,
        custoPercent: faturamento ? Math.max(0, Math.round((custo / faturamento) * 100)) : 0,
        lucroPercent: faturamento ? Math.max(0, Math.round((lucro / faturamento) * 100)) : 0,
      };
    });
    const totalFat = itensServidor.reduce((a, s) => a + s.faturamento, 0);
    const totalCusto = itensServidor.reduce((a, s) => a + s.custo, 0);
    const totalLucro = totalFat - totalCusto;
    const performance = {
      faturamento: totalFat, custo: totalCusto, lucro: totalLucro,
      margem: totalFat ? Math.round((totalLucro / totalFat) * 100) : 0,
      itens: itensServidor,
    };

    // Geo derivada do DDD do telefone.
    const estadosMap: Record<string, number> = {};
    const paisesMap: Record<string, number> = {};
    for (const r of telefonesRows) {
      const uf = ufFromTelefone(r.telefone);
      if (uf) estadosMap[uf] = (estadosMap[uf] ?? 0) + 1;
      const pais = paisFromTelefone(r.telefone);
      if (pais) paisesMap[pais] = (paisesMap[pais] ?? 0) + 1;
    }
    const estadosTop = Object.entries(estadosMap)
      .map(([uf, total]) => ({ uf, nome: UF_NOME[uf] ?? uf, total }))
      .sort((a, b) => b.total - a.total);
    const paisesTop = Object.entries(paisesMap)
      .map(([code, total]) => ({ code, nome: PAIS_NOME[code] ?? code, total }))
      .sort((a, b) => b.total - a.total);
    const estados = { total: estadosTop.reduce((a, e) => a + e.total, 0), top: estadosTop };
    const paises = { total: paisesTop.reduce((a, p) => a + p.total, 0), top: paisesTop };

    const payload: DashboardPayload = {
      title: "Dashboard",
      stats,
      ativosPercent,
      vencidosPercent,
      proximos,
      atrasados,
      periodo,
      formasPagamento,
      planosDist,
      indicacoes,
      topDispositivos,
      topAplicativos,
      performance,
      estados,
      paises,
      novosNoMes,
      chart: JSON.stringify({ labels, receita: serieReceita, custo: serieCusto, lucro: serieLucro, novos: serieNovosClientes }),
      geo: JSON.stringify({ estados: estadosMap, paises: paisesMap }),
    };
    dashboardCache.set(cacheKey, { expiresAt: Date.now() + DASHBOARD_CACHE_TTL_MS, payload });
    res.render("pages/dashboard", payload);
  } catch (error) { next(error); }
});

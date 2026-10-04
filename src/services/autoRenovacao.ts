import { withTransaction, queryOne } from "../db/mysql.js";
import { env } from "../config/env.js";
import { appNowSql, appTodayIso } from "./dates.js";
import { enviarMensagemModeloComRetry } from "./whatsapp.js";
import { getPixConfig } from "./pixConfig.js";
import { sincronizarAlertasCreditos } from "./notificacoes.js";
import { CreditosError, consumoRenovacao, debitarCreditos } from "./creditos.js";
import type { RowDataPacket } from "mysql2";

// Atualiza também saldos que já estavam baixos antes da renovação.
export async function verificarCreditosServidor(userId: number, _nome: string, _antes: number, _depois: number): Promise<void> {
  await sincronizarAlertasCreditos(userId).catch((error) => console.warn("[creditos] alerta falhou:", error));
}

interface ClienteAutoRow extends RowDataPacket {
  id: number;
  nome: string;
  telefone: string;
  user: string | null;
  senha: string | null;
  plano: string;
  servidor: string;
  vencimento: string | Date;
  valor: number;
  telas: number;
  pagamentoToken: string | null;
}

interface PlanoRow extends RowDataPacket { periodo: number; tipo: string | null; creditoGastos: number; }
interface ServidorRow extends RowDataPacket { id: number; nome: string; valorCred: number; }
interface UserRenovacaoRow extends RowDataPacket {
  autoRenovar: number;
  mensagemRenovacaoId: number | null;
}
interface MensagemRow extends RowDataPacket {
  id: number;
  mensagem: string | null;
  mediaTipo: string | null;
  mediaPath: string | null;
}

export interface AutoRenovacaoResult {
  renovado: boolean;
  novoVencimento?: string;
  creditosConsumidos?: number;
  mensagemEnviada?: boolean;
  motivo?: string;
}

// O plano conta em meses de calendário? Aceita "Mes", "Mês" e "Meses" — o form
// de planos grava "Meses", mas o default da coluna é "Mês".
function periodoEmMeses(tipo: unknown): boolean {
  return /^mes/.test(
    String(tipo ?? "").normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim(),
  );
}

/**
 * base + (periodo × vezes), em dias ou meses de calendário conforme o plano.
 * ESPELHA o somarPeriodo do public/assets/js/main.js — os dois precisam
 * concordar, senão o modal sugere uma data e a renovação automática grava outra.
 * Em meses, o dia é preso ao último dia válido: 31/01 + 1 mês = 28/02.
 */
function somarPeriodo(base: Date, periodo: number, tipo: unknown, vezes = 1): Date {
  const n = Number(periodo) * Number(vezes || 1);
  if (!periodoEmMeses(tipo)) {
    return new Date(base.getFullYear(), base.getMonth(), base.getDate() + n);
  }
  const total = base.getMonth() + n;
  const ano = base.getFullYear() + Math.floor(total / 12);
  const mes = ((total % 12) + 12) % 12;
  const ultimoDia = new Date(ano, mes + 1, 0).getDate();
  return new Date(ano, mes, Math.min(base.getDate(), ultimoDia));
}

function isoSqlDate(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Renova um cliente automaticamente após confirmação de pagamento.
 *
 * Idempotente: se o cliente já tem vencimento >= hoje + 1 dia recente, NÃO renova
 * de novo (proteção contra webhook duplicado).
 *
 * Algoritmo:
 *  - Pega plano.periodo (dias) — fallback 30 se não achar
 *  - Pega servidor.valorCred — fallback 0
 *  - Novo vencimento = max(hoje, venc atual) + 1 × periodo
 *  - Custo = 1 × valorCred
 *  - UPDATE cliente: vencimento novo, pago_em, valor_pago, status='Ativo'
 *  - Valida e debita créditos por tela em transação; saldo insuficiente bloqueia a renovação
 *  - INSERT em transacoes ("Renovação automática (PIX)")
 *  - Se user.mensagem_renovacao_id, dispara WhatsApp via template
 */
export async function renovarClienteAutomatico(
  userId: number,
  clienteId: number,
  valorRecebido: number,
  periodos = 1,
  planoPago?: { periodo: number; tipo: string | null; creditoGastos?: number },
  confirmacaoPagamentoId?: number,
): Promise<AutoRenovacaoResult> {
  if (env.localMode) return { renovado: false, motivo: "Auto-renovação desativada no modo local." };
  const userCfg = await queryOne<UserRenovacaoRow>(
    `SELECT auto_renovar AS autoRenovar, mensagem_renovacao_id AS mensagemRenovacaoId
       FROM users WHERE id = :userId LIMIT 1`,
    { userId },
  );
  if (!confirmacaoPagamentoId && (!userCfg || !userCfg.autoRenovar)) {
    return { renovado: false, motivo: "Auto-renovação desativada para este usuário." };
  }

  let resultado;
  try {
    resultado = await withTransaction(async (conn) => {
      const queryOne = async <T extends RowDataPacket>(sql: string, params: Record<string, string | number | null>) => {
        const [rows] = await conn.query<T[]>(sql, params);
        return rows[0] ?? null;
      };
      const execute = async (sql: string, params: Record<string, string | number | null>) => conn.execute(sql, params);
      let pagoEm = appNowSql();
      if (confirmacaoPagamentoId) {
        const pagamento = await queryOne<RowDataPacket>(
          `SELECT cliente_id AS clienteId, valor, renovacao_periodos AS periodos,
                  renovacao_dados AS dados, pago_em AS pagoEm
             FROM pagamentos WHERE id = :id AND user_id = :userId AND status = 'approved'
               AND renovado_em IS NULL FOR UPDATE`, { id: confirmacaoPagamentoId, userId });
        if (!pagamento || Number(pagamento.clienteId) !== clienteId) throw new CreditosError("Pagamento inválido ou renovação já confirmada.");
        valorRecebido = Number(pagamento.valor);
        periodos = Number(pagamento.periodos) || 1;
        planoPago = pagamento.dados ? JSON.parse(String(pagamento.dados)) : undefined;
        pagoEm = String(pagamento.pagoEm || pagoEm);
      }
      const cliente = await queryOne<ClienteAutoRow>(
        `SELECT id, nome, telefone, user, senha, plano, servidor, vencimento, valor, telas,
                pagamento_token AS pagamentoToken
           FROM clientes WHERE id = :clienteId AND user_id = :userId LIMIT 1 FOR UPDATE`,
        { clienteId, userId },
      );
      if (!cliente) return { renovado: false, motivo: "Cliente não encontrado." };
      if (!cliente.plano || !cliente.servidor) {
        return { renovado: false, motivo: "Cliente sem plano e/ou servidor — renovação manual necessária." };
      }

      const plano = await queryOne<PlanoRow>(
        `SELECT periodo, tipo, credito_gastos AS creditoGastos FROM planos WHERE nome = :nome AND user_id = :userId LIMIT 1`,
        { nome: cliente.plano, userId },
      );
      const planoRenovado = planoPago || plano;
      const periodoQtd = Math.max(1, Number(planoRenovado?.periodo ?? 30));
      // Sem plano casado, cai no default histórico de 30 dias.
      const periodoTipo = planoRenovado?.tipo ?? "Dias";

      const servidor = await queryOne<ServidorRow>(
        `SELECT id, nome, valor_cred AS valorCred FROM servidores
          WHERE nome = :nome AND user_id = :userId LIMIT 1`,
        { nome: cliente.servidor, userId },
      );
      const valorCred = Number(servidor?.valorCred ?? 0);
      // PIX renova um período completo e consome os créditos do plano por tela.
      const telasN = consumoRenovacao(Number(cliente.telas), periodos, Number(planoRenovado?.creditoGastos) || 1);
      const custoPagamento = Number((valorCred * telasN).toFixed(2));

      // Data base = max(hoje, venc atual). Cliente vencido vai renovar pra hoje + periodo.
      const todayIso = appTodayIso();
      const vencAtualIso = String(cliente.vencimento).slice(0, 10);
      const baseIso = vencAtualIso > todayIso ? vencAtualIso : todayIso;
      const [by, bm, bd] = baseIso.split("-").map((n) => Number(n));
      const novoVenc = somarPeriodo(new Date(by, bm - 1, bd), periodoQtd, periodoTipo, periodos);
      const novoVencIso = isoSqlDate(novoVenc);

      // Proteção contra webhook duplicado: se o vencimento atual já passou da
      // hipotética data nova, foi renovado recentemente — não duplica.
      if (vencAtualIso >= novoVencIso) {
        return { renovado: false, motivo: "Cliente já está com vencimento à frente — possível webhook duplicado." };
      }

      const saldo = await debitarCreditos(conn, userId, cliente.servidor, telasN);

      await execute(
        `UPDATE clientes
            SET vencimento = :vencimento,
                pago_em = :pagoEm,
                valor_pago = :valorPago,
                forma_pagamento = 'PIX',
                valor = :valor,
                creditos_gastos = :periodos,
                custo_pagamento = :custoPagamento,
                status = 'Ativo'
          WHERE id = :clienteId AND user_id = :userId`,
        {
          clienteId, userId,
          periodos,
          vencimento: novoVencIso,
          pagoEm,
          valorPago: valorRecebido,
          valor: cliente.valor || Number((valorRecebido / periodos).toFixed(2)),
          custoPagamento,
        },
      );

      // Registra transação tipo "Renovação automática (PIX)".
      await execute(
        `INSERT INTO transacoes
           (user_id, data, forma_pagamento, cliente_id, cliente_nome, descricao, plano,
            servidor, telas, creditos, custo, valor_venda, lucro)
         VALUES (:userId, :data, 'PIX', :clienteId, :clienteNome, :descricao,
            :plano, :servidor, :telas, :creditos, :custo, :valorVenda, :lucro)`,
        {
          userId, clienteId,
          descricao: confirmacaoPagamentoId ? 'Renovação confirmada (PIX)' : 'Renovação automática (PIX)',
          data: pagoEm.slice(0, 10),
          clienteNome: cliente.nome,
          plano: cliente.plano,
          servidor: cliente.servidor,
          telas: Number(cliente.telas),
          // creditos na transação = consumo real do servidor (telas × 1 período).
          creditos: telasN,
          custo: custoPagamento,
          valorVenda: valorRecebido,
          lucro: Number((valorRecebido - custoPagamento).toFixed(2)),
        },
      );

      if (confirmacaoPagamentoId) {
        await execute("UPDATE pagamentos SET renovado_em = :agora WHERE id = :id AND user_id = :userId", { agora: appNowSql(), id: confirmacaoPagamentoId, userId });
        await execute(
          `UPDATE notificacoes SET tipo = 'pagamento', lida = 1, titulo = :titulo, mensagem = :mensagem
            WHERE pagamento_id = :id AND user_id = :userId`,
          { titulo: `${cliente.nome} renovado`, mensagem: `Renovação confirmada no painel. Novo vencimento: ${novoVencIso}.`, id: confirmacaoPagamentoId, userId });
      }
      return { renovado: true as const, cliente, novoVencIso, telasN, saldo };
    });
  } catch (error) {
    if (error instanceof CreditosError) return { renovado: false, motivo: error.message };
    throw error;
  }
  if (!resultado.cliente || !resultado.saldo) return { renovado: false, motivo: resultado.motivo };
  const { cliente, novoVencIso, telasN, saldo } = resultado;
  await verificarCreditosServidor(userId, cliente.servidor, saldo.antes, saldo.depois);

  // Dispara WhatsApp via template se configurado.
  let mensagemEnviada = false;
  if (userCfg?.mensagemRenovacaoId) {
    const msg = await queryOne<MensagemRow>(
      `SELECT id, mensagem, media_tipo AS mediaTipo, media_path AS mediaPath
         FROM mensagens WHERE id = :id AND user_id = :userId LIMIT 1`,
      { id: userCfg.mensagemRenovacaoId, userId },
    );
    if (msg) {
      const sessao = await queryOne<RowDataPacket & { sessao: string }>(
        `SELECT sessao FROM whatsapp_devices WHERE user_id = :userId
          ORDER BY principal DESC, id ASC LIMIT 1`,
        { userId },
      );
      if (sessao?.sessao) {
        const result = await enviarMensagemModeloComRetry(
          sessao.sessao,
          { ...cliente, vencimento: novoVencIso },
          { mensagem: msg.mensagem, mediaTipo: msg.mediaTipo, mediaPath: msg.mediaPath },
          undefined, undefined, await getPixConfig(userId),
        );
        mensagemEnviada = result.ok;
      }
    }
  }

  return {
    renovado: true,
    novoVencimento: novoVencIso,
    creditosConsumidos: telasN,
    mensagemEnviada,
  };
}

import type { RowDataPacket } from "mysql2";
import { queryRows, withTransaction } from "../db/mysql.js";
import { formatMoney } from "./format.js";
import { opcoesRenovacao, type PlanoRenovacao } from "./renovacaoOpcoes.js";
import { enviarPushParaUsuario } from "./push.js";

export interface PagamentoPendente extends RowDataPacket {
  id: number; clienteId: number; nome: string; valor: number; plano: string;
  periodos: number; dados: string | null; pagoEm: string | null; duracao?: string;
}

function duracaoPagamento(row: PagamentoPendente) {
  const dados = row.dados ? JSON.parse(row.dados) : null;
  if (dados?.versao === 1 && Array.isArray(dados.itens)) {
    return dados.itens.map((item: PlanoRenovacao & { plano: string }) => `${item.plano}: ${opcoesRenovacao(item, 0).find(opcao => opcao.periodos === Number(row.periodos))?.label || `${row.periodos} período(s)`}`).join(' + ');
  }
  const plano: PlanoRenovacao | null = row.dados ? JSON.parse(row.dados) : null;
  return opcoesRenovacao(plano, Number(row.valor)).find(opcao => opcao.periodos === Number(row.periodos))?.label
    || `${Number(row.periodos) || 1} período(s) do plano`;
}

export async function registrarPagamentoPendente(pagamentoId: number, userId: number): Promise<boolean> {
  const aviso = await withTransaction(async conn => {
    const [rows] = await conn.query<PagamentoPendente[]>(
      `SELECT p.id, p.cliente_id AS clienteId, c.nome, c.plano, p.valor,
              p.renovacao_periodos AS periodos, p.renovacao_dados AS dados, p.pago_em AS pagoEm
         FROM pagamentos p JOIN clientes c ON c.id = p.cliente_id AND c.user_id = p.user_id
        WHERE p.id = :pagamentoId AND p.user_id = :userId AND p.status = 'approved'
          AND p.user_notificado = 0 AND p.renovado_em IS NULL FOR UPDATE`, { pagamentoId, userId });
    const row = rows[0];
    if (!row) return null;
    const titulo = `${row.nome} pagou ${formatMoney(row.valor)}`.slice(0, 190);
    const mensagem = `Renovação por ${duracaoPagamento(row)} pendente no painel. Renove o acesso e depois marque como renovado.`;
    await conn.execute(
      `INSERT INTO notificacoes (user_id, titulo, mensagem, tipo, url, pagamento_id)
       VALUES (:userId, :titulo, :mensagem, 'renovacao_pendente', '/clientes#renovacoes-pendentes', :pagamentoId)`,
      { userId, titulo, mensagem, pagamentoId });
    await conn.execute("UPDATE pagamentos SET user_notificado = 1 WHERE id = :pagamentoId AND user_id = :userId", { pagamentoId, userId });
    return { titulo, mensagem };
  });
  if (!aviso) return false;
  await enviarPushParaUsuario(userId, { title: aviso.titulo, body: aviso.mensagem, url: '/clientes#renovacoes-pendentes', tag: `pagamento-pendente-${pagamentoId}` })
    .catch(error => console.warn('[pagamento] push falhou:', error));
  return true;
}

export async function listarRenovacoesPendentes(userId: number) {
  const rows = await queryRows<PagamentoPendente>(
    `SELECT p.id, p.cliente_id AS clienteId, c.nome, c.plano, p.valor,
            p.renovacao_periodos AS periodos, p.renovacao_dados AS dados, p.pago_em AS pagoEm
       FROM pagamentos p JOIN clientes c ON c.id = p.cliente_id AND c.user_id = p.user_id
       JOIN notificacoes n ON n.pagamento_id = p.id AND n.user_id = p.user_id
      WHERE p.user_id = :userId AND p.status = 'approved' AND p.renovado_em IS NULL
      ORDER BY p.pago_em ASC, p.id ASC`, { userId });
  return rows.map(row => ({ ...row, duracao: duracaoPagamento(row) }));
}

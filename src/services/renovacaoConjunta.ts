import crypto from 'node:crypto';
import type { RowDataPacket } from 'mysql2/promise';
import { queryOne, withTransaction } from '../db/mysql.js';
import { appNowSql, appTodayIso } from './dates.js';
import { CreditosError, consumoRenovacao, debitarCreditos } from './creditos.js';
import { escolhasRenovacao, lerPlanoAdicional, novoVencimentoPlano, type PlanoAdicional, type RenovacaoConjunta } from './renovacaoOpcoes.js';
import { normalizeDateInput } from './format.js';

export async function validarPlanoAdicional(body: Record<string, unknown>, userId: number, anterior: unknown): Promise<PlanoAdicional | null> {
  if (body.tem_plano_adicional !== '1') return null;
  if (!String(body.adicional_aplicativo || '').trim()) throw new CreditosError('Selecione o aplicativo do segundo servidor na aba Apps.');
  const salvo = lerPlanoAdicional(anterior);
  const plano = String(body.adicional_plano || '').trim();
  const servidor = String(body.adicional_servidor || '').trim();
  const valor = Number(body.adicional_valor);
  const telas = Number(body.adicional_telas);
  const vencimento = normalizeDateInput(body.adicional_vencimento);
  if (!plano || !servidor || !vencimento || !String(body.adicional_valor ?? '').trim()
    || !Number.isFinite(valor) || valor <= 0 || valor > 9999999999.99 || !Number.isSafeInteger(telas) || telas < 1) {
    throw new CreditosError('Preencha plano, servidor, valor positivo, telas e vencimento do segundo plano.');
  }
  const catalogo = await queryOne<RowDataPacket>('SELECT id FROM planos WHERE user_id = :userId AND nome = :nome AND ativo = 1', { userId, nome: plano });
  const srv = await queryOne<RowDataPacket>('SELECT id FROM servidores WHERE user_id = :userId AND nome = :nome', { userId, nome: servidor });
  if (!catalogo || !srv) throw new CreditosError('Selecione um plano ativo e um servidor válido para o segundo plano.');
  return { id: salvo?.id || crypto.randomUUID(), plano, servidor, valor: Math.round(valor * 100) / 100, telas, vencimento,
    aplicativo: String(body.adicional_aplicativo || '').trim().slice(0, 120), dispositivo: String(body.adicional_dispositivo || '').trim().slice(0, 120),
    user: String(body.adicional_user || '').trim().slice(0, 120), idPainel: String(body.adicional_id_painel || '').trim().slice(0, 120) };
}

export async function renovarPlanosDoCliente(userId: number, clienteId: number, pedido: {
  selecao?: string; periodos?: number; chave?: string; formaPagamento?: string; pagamentoId?: number;
}) {
  return withTransaction(async conn => {
    const one = async (sql: string, params: Record<string, string | number | null>) => (await conn.query<RowDataPacket[]>(sql, params))[0][0];
    let pagamento: RowDataPacket | undefined;
    if (pedido.pagamentoId) {
      pagamento = await one(`SELECT cliente_id AS clienteId, valor, renovacao_periodos AS periodos, renovacao_dados AS dados, pago_em AS pagoEm
        FROM pagamentos WHERE id = :id AND user_id = :userId AND status = 'approved' AND renovado_em IS NULL FOR UPDATE`, { id: pedido.pagamentoId!, userId });
      if (!pagamento || Number(pagamento.clienteId) !== clienteId) throw new CreditosError('Pagamento inválido ou renovação já confirmada.');
    } else if (!/^[a-f0-9-]{36}$/i.test(pedido.chave || '') || !['PIX', 'Dinheiro', 'Cartão'].includes(pedido.formaPagamento || '')) {
      throw new CreditosError('Reabra a renovação e selecione a forma de pagamento.');
    }
    const cliente = await one('SELECT * FROM clientes WHERE id = :clienteId AND user_id = :userId AND arquivado = 0 FOR UPDATE', { clienteId, userId });
    if (!cliente) throw new CreditosError('Cliente não encontrado.');
    if (!pagamento) {
      const repetido = await one('SELECT cliente_id FROM renovacoes_conjuntas WHERE user_id = :userId AND chave = :chave', { userId, chave: pedido.chave! });
      if (repetido) return { duplicado: true, itens: [], total: 0 };
    }
    const adicional = lerPlanoAdicional(cliente.plano_adicional);
    const periodos = Number(pagamento?.periodos ?? pedido.periodos);
    let dados: RenovacaoConjunta;
    if (pagamento) {
      dados = JSON.parse(pagamento.dados);
      if (dados.versao !== 1 || !Array.isArray(dados.itens) || !dados.itens.length || dados.itens.length > 2
        || new Set(dados.itens.map(item => item.chave)).size !== dados.itens.length) throw new CreditosError('Dados de pagamento inválidos.');
    } else {
      const grupos = await escolhasRenovacao(cliente, async nome => {
        const plano = await one('SELECT periodo, tipo, credito_gastos AS creditoGastos FROM planos WHERE user_id = :userId AND nome = :nome', { userId, nome });
        return plano ? { periodo: Number(plano.periodo), tipo: plano.tipo, creditoGastos: Number(plano.creditoGastos) } : null;
      });
      const grupo = grupos.find(g => g.selecao === pedido.selecao);
      if (!grupo || !('itens' in grupo.dados) || !grupo.opcoes.some(o => o.periodos === periodos)) throw new CreditosError('Selecione os planos e uma quantidade válida de renovações.');
      dados = grupo.dados;
    }
    if (!Number.isSafeInteger(periodos) || periodos < 1 || periodos > 12) throw new CreditosError('Quantidade de renovações inválida.');
    const total = dados.itens.reduce((soma, item) => soma + Math.round(item.valor * 100) * periodos, 0) / 100;
    if (!Number.isFinite(total) || total <= 0 || (pagamento && Math.round(Number(pagamento.valor) * 100) !== Math.round(total * 100))) throw new CreditosError('O valor pago não corresponde aos planos selecionados.');
    const resultados = [];
    let custoTotal = 0;
    // Ordem estável dos servidores evita inversão de locks entre clientes diferentes.
    for (const item of [...dados.itens].sort((a, b) => a.servidor.localeCompare(b.servidor))) {
      const atual = item.chave === 'principal' ? { plano: cliente.plano, servidor: cliente.servidor, telas: cliente.telas, vencimento: cliente.vencimento, idPainel: cliente.sigma_customer_id || '' } : adicional?.id === item.chave ? adicional : null;
      if (!atual || atual.plano !== item.plano || atual.servidor !== item.servidor || Number(atual.telas) !== Number(item.telas)
        || (atual.idPainel || '') !== (item.idPainel || '')) throw new CreditosError('O cadastro de um plano mudou após a cobrança. Confira o pagamento antes de renovar.');
      const consumo = consumoRenovacao(Number(item.telas), periodos, Number(item.creditoGastos) || 1);
      const srv = await one('SELECT valor_cred FROM servidores WHERE user_id = :userId AND nome = :nome', { userId, nome: item.servidor });
      await debitarCreditos(conn, userId, item.servidor, consumo);
      const custo = Number((Number(srv?.valor_cred || 0) * consumo).toFixed(2));
      const valor = Math.round(item.valor * 100) * periodos / 100;
      const vencimento = novoVencimentoPlano(String(atual.vencimento).slice(0, 10), appTodayIso(), item, periodos);
      custoTotal += custo;
      if (item.chave === 'principal') {
        await conn.execute('UPDATE clientes SET vencimento = :vencimento, creditos_gastos = :periodos, status = \'Ativo\' WHERE id = :clienteId AND user_id = :userId', { vencimento, periodos, clienteId, userId });
      } else {
        adicional!.vencimento = vencimento;
        await conn.execute('UPDATE clientes SET plano_adicional = :adicional WHERE id = :clienteId AND user_id = :userId', { adicional: JSON.stringify(adicional), clienteId, userId });
      }
      const pagoEm = String(pagamento?.pagoEm || appNowSql());
      await conn.execute(`INSERT INTO transacoes (user_id, data, forma_pagamento, cliente_id, cliente_nome, descricao, plano, servidor, telas, creditos, custo, valor_venda, lucro)
        VALUES (:userId, :data, :formaPagamento, :clienteId, :nome, :descricao, :plano, :servidor, :telas, :consumo, :custo, :valor, :lucro)`, {
        userId, clienteId, nome: cliente.nome, data: pagoEm.slice(0, 10), formaPagamento: pagamento ? 'PIX' : pedido.formaPagamento!,
        descricao: pagamento ? 'Renovação confirmada (PIX)' : 'Renovação de planos', plano: item.plano, servidor: item.servidor,
        telas: item.telas, consumo, custo, valor, lucro: Number((valor - custo).toFixed(2)),
      });
      resultados.push({ ...item, vencimento, consumo });
    }
    await conn.execute(`UPDATE clientes SET pago_em = :pagoEm, valor_pago = :total, custo_pagamento = :custo,
      forma_pagamento = :forma WHERE id = :clienteId AND user_id = :userId`, {
      userId, clienteId, total, custo: Number(custoTotal.toFixed(2)), pagoEm: String(pagamento?.pagoEm || appNowSql()), forma: pagamento ? 'PIX' : pedido.formaPagamento!,
    });
    if (pagamento) {
      await conn.execute('UPDATE pagamentos SET renovado_em = :agora WHERE id = :id AND user_id = :userId', { agora: appNowSql(), id: pedido.pagamentoId!, userId });
      await conn.execute(`UPDATE notificacoes SET tipo = 'pagamento', lida = 1, titulo = :titulo, mensagem = :mensagem WHERE pagamento_id = :id AND user_id = :userId`, {
        id: pedido.pagamentoId!, userId, titulo: `${cliente.nome} renovado`, mensagem: resultados.map(item => `${item.plano}: ${item.vencimento}`).join('; '),
      });
    } else await conn.execute('INSERT INTO renovacoes_conjuntas (user_id, chave, cliente_id) VALUES (:userId, :chave, :clienteId)', { userId, chave: pedido.chave!, clienteId });
    return { duplicado: false, itens: resultados, total };
  });
}

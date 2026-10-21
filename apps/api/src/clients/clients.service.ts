import { Inject, Injectable } from '@nestjs/common';
import crypto from 'node:crypto';
import { BACKEND_RUNTIME, type BackendRuntime } from '../runtime.ts';
import {
  escolhasRenovacao,
  lerPlanoAdicional,
} from '../../../../src/services/renovacaoOpcoes.ts';
@Injectable()
export class ClientsService {
  constructor(
    @Inject(BACKEND_RUNTIME) private readonly runtime: BackendRuntime,
  ) {}
  private get db() {
    if (!this.runtime.clients)
      throw new Error('Clients dependencies unavailable.');
    return this.runtime.clients;
  }
  async list(userId: number, archived: unknown) {
    const verArquivados = String(archived ?? '') === '1';
    const [
      clientes,
      planos,
      servidores,
      mensagens,
      dispositivosRows,
      aplicativosRows,
      whatsappDevicesRows,
    ] = await Promise.all([
      this.db.queryRows(
        `SELECT id, nome, user, telefone, vencimento, plano, valor, status, servidor, telas,
                creditos_gastos AS creditosGastos, pago_em AS pagoEm, valor_pago AS valorPago,
                forma_pagamento AS formaPagamento, custo_pagamento AS custoPagamento,
                observacao_pagamento AS observacaoPagamento,
                id_painel AS idPainel, email, captacao, aniversario, link_m3u AS linkM3u,
                time_cliente AS timeCliente, telefone_secundario AS telefoneSecundario, observacoes,
                data_inicio AS dataInicio, hora_vencimento AS horaVencimento,
                pontos_fidelidade AS pontosFidelidade,
                enviar_boas_vindas AS enviarBoasVindas, dispositivo, aplicativo, arquivado,
                sigma_customer_id AS sigmaCustomerId, plano_adicional
           FROM clientes WHERE user_id = :userId AND arquivado = :arq ORDER BY nome ASC`,
        { userId, arq: verArquivados ? 1 : 0 },
      ),
      this.db.queryRows(
        'SELECT id, nome, credito_gastos AS creditoGastos, periodo, tipo, ativo FROM planos WHERE user_id = :userId ORDER BY nome ASC',
        { userId },
      ),
      this.db.queryRows(
        'SELECT id, nome, valor_cred AS valorCred, sessao, url_renovacao AS urlRenovacao FROM servidores WHERE user_id = :userId ORDER BY nome ASC',
        { userId },
      ),
      this.db.queryRows(
        'SELECT id, titulo, mensagem, media_tipo AS mediaTipo, media_path AS mediaPath FROM mensagens WHERE user_id = :userId ORDER BY titulo ASC',
        { userId },
      ),
      this.db.queryRows(
        "SELECT nome FROM dispositivos WHERE user_id = :userId AND status = 'Ativo' ORDER BY nome ASC",
        { userId },
      ),
      this.db.queryRows(
        "SELECT nome FROM aplicativos WHERE user_id = :userId AND status = 'Ativo' ORDER BY nome ASC",
        { userId },
      ),
      this.db.queryRows(
        'SELECT nome, sessao FROM whatsapp_devices WHERE user_id = :userId ORDER BY principal DESC, id ASC',
        { userId },
      ),
    ]);
    const dispositivos = dispositivosRows.map((d) => d.nome);
    const aplicativos = aplicativosRows.map((a) => a.nome);
    const whatsappDevices = whatsappDevicesRows.map((d) => ({
      nome: d.nome,
      sessao: d.sessao,
    }));
    const renovacoesPendentes = await this.db.listPendingRenewals(userId);
    const pageData = {
      title: verArquivados ? 'Clientes arquivados' : 'Clientes',
      renovacoesPendentes,
      subtitle: verArquivados
        ? 'Clientes que você arquivou'
        : 'Gerencie todos os seus clientes',
      clientes: clientes.map((c) => ({
        ...c,
        adicional: lerPlanoAdicional(c.plano_adicional),
      })),
      planos,
      servidores,
      mensagens,
      dispositivos,
      aplicativos,
      whatsappDevices,
      verArquivados,
    };

    return pageData;
  }
  async renewalOptions(userId: number, id: unknown) {
    const client = await this.db.queryOne(
      'SELECT * FROM clientes WHERE id = :id AND user_id = :userId AND arquivado = 0',
      { id: Number(id), userId },
    );
    if (!client) return null;
    const escolhas = await escolhasRenovacao(client, (nome: string) =>
      this.db.queryOne(
        'SELECT periodo, tipo, credito_gastos AS creditoGastos FROM planos WHERE user_id = :userId AND nome = :nome',
        { userId, nome },
      ),
    );
    return { escolhas, chave: crypto.randomUUID() };
  }
  async paymentPreference(userId: number) {
    const row = await this.db.queryOne(
      `SELECT m.id AS mensagemId FROM users u
 LEFT JOIN mensagens m ON m.id = u.mensagem_pagamento_padrao_id AND m.user_id = u.id
 WHERE u.id = :userId`,
      { userId },
    );
    return { mensagemId: row?.mensagemId ?? null };
  }
  async savePaymentPreference(userId: number, value: unknown) {
    const mensagemId = value === '' || value === null ? null : Number(value);
    if (mensagemId !== null) {
      if (!Number.isSafeInteger(mensagemId) || mensagemId <= 0)
        return { status: 400, data: { message: 'Mensagem inv\u00e1lida.' } };
      const message = await this.db.queryOne(
        'SELECT id FROM mensagens WHERE id = :mensagemId AND user_id = :userId',
        { mensagemId, userId },
      );
      if (!message)
        return {
          status: 400,
          data: { message: 'Mensagem n\u00e3o encontrada.' },
        };
    }
    await this.db.execute(
      'UPDATE users SET mensagem_pagamento_padrao_id = :mensagemId WHERE id = :userId',
      { mensagemId, userId },
    );
    return { status: 200, data: { mensagemId } };
  }
  async paymentLink(userId: number, value: unknown) {
    const id = Number(value);
    const owner = await this.db.queryOne(
      'SELECT id FROM clientes WHERE id = :id AND user_id = :userId LIMIT 1',
      { id, userId },
    );
    if (!owner)
      return {
        status: 404,
        data: { ok: false, error: 'Cliente n\u00e3o encontrado.' },
      };
    const url = await this.db.paymentUrl(id);
    return url
      ? { status: 200, data: { ok: true, url } }
      : { status: 500, data: { ok: false, error: 'Falha ao gerar link.' } };
  }
}

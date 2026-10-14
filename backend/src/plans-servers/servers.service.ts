import { Inject, Injectable } from '@nestjs/common';
import {
  boolField,
  toNullableString,
  toNumber,
} from '../../../src/services/format.js';
import { PlansServersStore } from './plans-servers.store.js';
@Injectable()
export class ServersService {
  constructor(
    @Inject(PlansServersStore) private readonly store: PlansServersStore,
  ) {}
  async list(userId: number) {
    const servidores = await this.store.dependencies.queryRows(
      `SELECT s.id, s.nome,
              COALESCE(contagem.clientesTotal, 0) AS clientesTotal,
              COALESCE(contagem.clientesAtivos, 0) AS clientesAtivos,
              COALESCE(contagem.clientesInativos, 0) AS clientesInativos,
              s.testes_total AS testesTotal, s.testes_ativos AS testesAtivos,
              s.testes_inativos AS testesInativos, s.creditos, s.valor_cred AS valorCred, s.sessao, s.integracao,
              s.identificador, s.link_painel AS linkPainel, s.cobranca_por_telas AS cobrancaPorTelas,
              s.observacao_servidor AS observacaoServidor, s.renovacao_automatica AS renovacaoAutomatica,
              s.dispositivo_whatsapp AS dispositivoWhatsapp, s.url_app_android AS urlAppAndroid, s.url_app_ios AS urlAppIos,
              s.info_servidor AS infoServidor, s.dns_1 AS dns1, s.dns_2 AS dns2, s.dns_3 AS dns3, s.dns_4 AS dns4,
              s.url_api_xc AS urlApiXc, s.url_api_smarters AS urlApiSmarters, s.epg, s.pix, s.pix_nome AS pixNome,
              s.pix_tipo AS pixTipo, s.url_renovacao AS urlRenovacao
         FROM servidores s
         LEFT JOIN (
           SELECT user_id, TRIM(servidor) AS servidor,
                  COUNT(*) AS clientesTotal,
                  SUM(status = 'Ativo') AS clientesAtivos,
                  SUM(status = 'Inativo') AS clientesInativos
             FROM clientes
            WHERE user_id = :userId AND TRIM(COALESCE(servidor, '')) <> ''
            GROUP BY user_id, TRIM(servidor)
         ) contagem ON contagem.user_id = s.user_id AND contagem.servidor = TRIM(s.nome)
        WHERE s.user_id = :userId
        ORDER BY s.id DESC`,
      { userId },
    );
    return { title: 'Servidores', servidores };
  }
  async save(userId: number, body: Record<string, unknown>) {
    const id = Number(body.id);
    const action = String(body.action ?? '');
    if (action === 'delete_servidor') {
      await this.store.dependencies.execute(
        'DELETE FROM servidores WHERE id = :id AND user_id = :userId',
        { id, userId },
      );
      return { type: 'success', message: 'Servidor apagado.' };
    } else {
      const data = {
        userId,
        id,
        nome: String(body.nome ?? '').trim(),
        clientesTotal: toNumber(body.clientes_total),
        clientesAtivos: toNumber(body.clientes_ativos),
        clientesInativos: toNumber(body.clientes_inativos),
        testesTotal: toNumber(body.testes_total),
        testesAtivos: toNumber(body.testes_ativos),
        testesInativos: toNumber(body.testes_inativos),
        creditos: toNumber(body.creditos),
        valorCred: toNumber(body.valor_cred),
        sessao: String(body.sessao ?? 'Não definido'),
        integracao: String(body.integracao || 'Não definida'),
        identificador: toNullableString(body.identificador),
        linkPainel: toNullableString(body.link_painel),
        cobrancaPorTelas: boolField(body.cobranca_por_telas),
        observacaoServidor: toNullableString(body.observacao_servidor),
        renovacaoAutomatica: boolField(body.renovacao_automatica),
        dispositivoWhatsapp: toNullableString(body.dispositivo_whatsapp),
        urlAppAndroid: toNullableString(body.url_app_android),
        urlAppIos: toNullableString(body.url_app_ios),
        infoServidor: toNullableString(body.info_servidor),
        dns1: toNullableString(body.dns_1),
        dns2: toNullableString(body.dns_2),
        dns3: toNullableString(body.dns_3),
        dns4: toNullableString(body.dns_4),
        urlApiXc: toNullableString(body.url_api_xc),
        urlApiSmarters: toNullableString(body.url_api_smarters),
        epg: toNullableString(body.epg),
        pix: toNullableString(body.pix),
        pixNome: toNullableString(body.pix_nome),
        pixTipo: toNullableString(body.pix_tipo),
        urlRenovacao: toNullableString(body.url_renovacao),
      };
      const novosSet = `identificador = :identificador, link_painel = :linkPainel, cobranca_por_telas = :cobrancaPorTelas, observacao_servidor = :observacaoServidor, renovacao_automatica = :renovacaoAutomatica, dispositivo_whatsapp = :dispositivoWhatsapp, url_app_android = :urlAppAndroid, url_app_ios = :urlAppIos, info_servidor = :infoServidor, dns_1 = :dns1, dns_2 = :dns2, dns_3 = :dns3, dns_4 = :dns4, url_api_xc = :urlApiXc, url_api_smarters = :urlApiSmarters, epg = :epg, pix = :pix, pix_nome = :pixNome, pix_tipo = :pixTipo, url_renovacao = :urlRenovacao`;
      if (action === 'update_servidor') {
        const atual = await this.store.dependencies.queryOne(
          'SELECT nome FROM servidores WHERE id = :id AND user_id = :userId LIMIT 1',
          { id, userId },
        );
        await this.store.dependencies.execute(
          `UPDATE servidores SET nome = :nome, clientes_total = :clientesTotal, clientes_ativos = :clientesAtivos, clientes_inativos = :clientesInativos, testes_total = :testesTotal, testes_ativos = :testesAtivos, testes_inativos = :testesInativos, creditos = :creditos, valor_cred = :valorCred, sessao = :sessao, integracao = :integracao, ${novosSet} WHERE id = :id AND user_id = :userId`,
          data,
        );
        if (atual?.nome)
          await this.store.rename(
            userId,
            'servidor',
            String(atual.nome),
            data.nome,
          );
        return { type: 'success', message: 'Servidor atualizado.' };
      } else {
        await this.store.dependencies.execute(
          `INSERT INTO servidores (user_id, nome, clientes_total, clientes_ativos, clientes_inativos, testes_total, testes_ativos, testes_inativos, creditos, valor_cred, sessao, integracao, identificador, link_painel, cobranca_por_telas, observacao_servidor, renovacao_automatica, dispositivo_whatsapp, url_app_android, url_app_ios, info_servidor, dns_1, dns_2, dns_3, dns_4, url_api_xc, url_api_smarters, epg, pix, pix_nome, pix_tipo, url_renovacao) VALUES (:userId, :nome, :clientesTotal, :clientesAtivos, :clientesInativos, :testesTotal, :testesAtivos, :testesInativos, :creditos, :valorCred, :sessao, :integracao, :identificador, :linkPainel, :cobrancaPorTelas, :observacaoServidor, :renovacaoAutomatica, :dispositivoWhatsapp, :urlAppAndroid, :urlAppIos, :infoServidor, :dns1, :dns2, :dns3, :dns4, :urlApiXc, :urlApiSmarters, :epg, :pix, :pixNome, :pixTipo, :urlRenovacao)`,
          data,
        );
        return { type: 'success', message: 'Servidor criado.' };
      }
    }
  }
}

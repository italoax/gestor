import { Inject, Injectable } from '@nestjs/common';
import {
  boolField,
  toNullableString,
  toNumber,
} from '../../../src/services/format.ts';
import { PlansServersStore } from './plans-servers.store.ts';
@Injectable()
export class PlansService {
  constructor(
    @Inject(PlansServersStore) private readonly store: PlansServersStore,
  ) {}
  async list(userId: number) {
    await this.store.seedPlans(userId);
    const planos = await this.store.dependencies.queryRows(
      `SELECT p.id, p.nome, COALESCE(contagem.clientes, 0) AS clientes,
              p.tipo, p.periodo, p.observacao, p.credito_gastos AS creditos, p.ativo,
              p.sigma_package_id AS sigmaPackageId, p.sigma_connections AS sigmaConnections
         FROM planos p
         LEFT JOIN (
           SELECT user_id, TRIM(plano) AS plano, COUNT(*) AS clientes
             FROM clientes
            WHERE user_id = :userId AND TRIM(COALESCE(plano, '')) <> ''
            GROUP BY user_id, TRIM(plano)
         ) contagem ON contagem.user_id = p.user_id AND contagem.plano = TRIM(p.nome)
        WHERE p.user_id = :userId
        ORDER BY p.id DESC`,
      { userId },
    );
    return {
      title: 'Planos de Clientes',
      subtitle: 'Gerencie os planos disponíveis para seus clientes',
      planos,
    };
  }
  async save(userId: number, body: Record<string, unknown>) {
    const id = Number(body.id);
    const action = String(body.action ?? '');
    const reject = (message: string) => ({ type: 'error', message });
    if (!['create_plano', 'update_plano', 'delete_plano'].includes(action))
      return reject('Ação de plano inválida.');
    let atual = null;
    if (action !== 'create_plano') {
      if (!Number.isSafeInteger(id) || id <= 0)
        return reject('Plano inválido.');
      atual = await this.store.dependencies.queryOne(
        'SELECT nome FROM planos WHERE id = :id AND user_id = :userId LIMIT 1',
        { id, userId },
      );
      if (!atual) return reject('Plano não encontrado.');
    }
    if (action === 'delete_plano') {
      const vinculado = await this.store.dependencies.queryOne(
        "SELECT id FROM clientes WHERE user_id = :userId AND (TRIM(plano) = :nome OR JSON_UNQUOTE(JSON_EXTRACT(plano_adicional, '$.plano')) = :nome) LIMIT 1",
        { userId, nome: atual!.nome },
      );
      if (vinculado)
        return reject(
          'Este plano possui clientes vinculados. Altere o plano desses clientes antes de apagar.',
        );
      await this.store.dependencies.execute(
        'DELETE FROM planos WHERE id = :id AND user_id = :userId',
        {
          id,
          userId,
        },
      );
      return { type: 'success', message: 'Plano apagado.' };
    } else {
      const data = {
        userId,
        id,
        nome: String(body.nome ?? '').trim(),
        tipo: String(body.tipo || 'Dias'),
        periodo: toNumber(body.periodo, 1),
        creditoGastos: toNumber(body.creditos, 0),
        observacao: toNullableString(body.observacao),
        ativo: boolField(body.ativo),
        sigmaPackageId: toNullableString(body.sigma_package_id),
        sigmaConnections: toNumber(body.sigma_connections, 1),
      };
      // Não substituir entradas inválidas por valores padrão durante a validação.
      data.periodo = Number(String(body.periodo ?? '').trim() || NaN);
      data.creditoGastos = Number(
        String(body.creditos ?? '')
          .trim()
          .replace(',', '.') || NaN,
      );
      data.sigmaConnections = Number(
        String(body.sigma_connections ?? '1').trim() || NaN,
      );
      if (!data.nome || data.nome.length > 120)
        return reject('Informe um nome de plano com até 120 caracteres.');
      if (!['Dias', 'Meses'].includes(data.tipo))
        return reject('Selecione Dias ou Meses para o período.');
      if (
        !Number.isInteger(data.periodo) ||
        data.periodo < 1 ||
        data.periodo > 2147483647
      )
        return reject('Informe um período inteiro maior que zero.');
      if (
        !Number.isFinite(data.creditoGastos) ||
        data.creditoGastos < 0 ||
        data.creditoGastos > 9999999999.99 ||
        Math.abs(
          data.creditoGastos * 100 - Math.round(data.creditoGastos * 100),
        ) > 0.0001
      )
        return reject(
          'Informe créditos maiores ou iguais a zero, com até duas casas decimais.',
        );
      if (
        !Number.isInteger(data.sigmaConnections) ||
        data.sigmaConnections < 1 ||
        data.sigmaConnections > 2147483647
      )
        return reject(
          'Informe uma quantidade inteira de conexões maior que zero.',
        );
      if ((data.sigmaPackageId?.length || 0) > 120)
        return reject('O ID do pacote Sigma deve ter até 120 caracteres.');
      const duplicado = await this.store.dependencies.queryOne(
        'SELECT id FROM planos WHERE user_id = :userId AND TRIM(nome) = :nome AND id <> :id LIMIT 1',
        { userId, nome: data.nome, id: action === 'create_plano' ? 0 : id },
      );
      if (duplicado) return reject('Já existe um plano com esse nome.');
      if (action === 'update_plano') {
        await this.store.dependencies.execute(
          `UPDATE planos SET nome = :nome, tipo = :tipo, periodo = :periodo, credito_gastos = :creditoGastos, observacao = :observacao, ativo = :ativo, sigma_package_id = :sigmaPackageId, sigma_connections = :sigmaConnections WHERE id = :id AND user_id = :userId`,
          data,
        );
        if (atual?.nome)
          await this.store.rename(
            userId,
            'plano',
            String(atual.nome),
            data.nome,
          );
        return { type: 'success', message: 'Plano atualizado.' };
      } else {
        await this.store.dependencies.execute(
          `INSERT INTO planos (user_id, nome, tipo, periodo, credito_gastos, clientes, observacao, ativo, sigma_package_id, sigma_connections) VALUES (:userId, :nome, :tipo, :periodo, :creditoGastos, 0, :observacao, :ativo, :sigmaPackageId, :sigmaConnections)`,
          data,
        );
        return { type: 'success', message: 'Plano criado.' };
      }
    }
  }
}

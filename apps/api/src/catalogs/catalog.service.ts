import { Inject, Injectable } from '@nestjs/common';
import { BACKEND_RUNTIME, type BackendRuntime } from '../runtime.ts';
import type { CatalogName } from './catalog.types.ts';
import { toNullableString, toNumber } from '../../../../src/services/format.ts';

@Injectable()
export class CatalogService {
  constructor(
    @Inject(BACKEND_RUNTIME) private readonly runtime: BackendRuntime,
  ) {}
  private get dependencies() {
    if (!this.runtime.catalogs)
      throw new Error('Dependências de catálogos não configuradas.');
    return this.runtime.catalogs;
  }
  async list(name: CatalogName, userId: number) {
    const db = this.dependencies,
      config = db.configs[name];
    if (!(await db.jaSemeou(userId, name))) {
      const existing = await db.queryRows(
        `SELECT nome FROM ${name} WHERE user_id = :userId`,
        { userId },
      );
      const names = new Set(
        existing.map((item) => String(item.nome).trim().toLowerCase()),
      );
      for (const [nome, descricao] of config.padroes) {
        if (names.has(nome.toLowerCase())) continue;
        await db.execute(
          `INSERT INTO ${name} (user_id, nome, descricao, status) VALUES (:userId, :nome, :descricao, 'Ativo')`,
          { userId, nome, descricao },
        );
      }
      await db.marcarSemeado(userId, name);
    }
    const columns = config.comValorRenovacao
      ? 'id, nome, descricao, valor_renovacao AS valorRenovacao, status'
      : 'id, nome, descricao, status';
    const items = await db.queryRows(
      `SELECT ${columns} FROM ${name} WHERE user_id = :userId ORDER BY nome ASC`,
      { userId },
    );
    return {
      title: config.titulo,
      subtitle: config.subtitulo,
      [name]: config.comValorRenovacao
        ? items.map((item) => ({
            ...item,
            valorRenovacao: Number(item.valorRenovacao ?? 0),
          }))
        : items,
    };
  }
  async save(name: CatalogName, userId: number, body: Record<string, unknown>) {
    const db = this.dependencies,
      config = db.configs[name],
      id = Number(body.id),
      action = String(body.action ?? ''),
      label =
        config.singular.charAt(0).toUpperCase() + config.singular.slice(1);
    if (action === `delete_${config.singular}`) {
      await db.execute(
        `DELETE FROM ${name} WHERE id = :id AND user_id = :userId`,
        { id, userId },
      );
      return { type: 'success', message: `${label} apagado.` };
    }
    const nome = String(body.nome ?? '').trim();
    if (!nome)
      return {
        type: 'error',
        message: `Informe o nome do ${config.singular}.`,
      };
    const data: Record<string, unknown> = {
      userId,
      id,
      nome,
      descricao: toNullableString(body.descricao),
      status: String(body.status) === 'Inativo' ? 'Inativo' : 'Ativo',
    };
    if (config.comValorRenovacao)
      data.valorRenovacao = toNumber(body.valor_renovacao);
    if (action === `update_${config.singular}`) {
      const current = await db.queryOne(
        `SELECT nome FROM ${name} WHERE id = :id AND user_id = :userId LIMIT 1`,
        { id, userId },
      );
      const extra = config.comValorRenovacao
        ? ', valor_renovacao = :valorRenovacao'
        : '';
      await db.execute(
        `UPDATE ${name} SET nome = :nome, descricao = :descricao${extra}, status = :status WHERE id = :id AND user_id = :userId`,
        data,
      );
      if (current?.nome && current.nome !== nome)
        await db.execute(
          `UPDATE clientes SET \`${config.singular}\` = :novo WHERE user_id = :userId AND \`${config.singular}\` = :antigo`,
          { userId, antigo: current.nome, novo: nome },
        );
      return { type: 'success', message: `${label} atualizado.` };
    }
    const columns = config.comValorRenovacao ? ', valor_renovacao' : '',
      values = config.comValorRenovacao ? ', :valorRenovacao' : '';
    await db.execute(
      `INSERT INTO ${name} (user_id, nome, descricao${columns}, status) VALUES (:userId, :nome, :descricao${values}, :status)`,
      data,
    );
    return { type: 'success', message: `${label} criado.` };
  }
}

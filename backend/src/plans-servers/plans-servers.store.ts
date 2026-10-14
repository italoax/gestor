import { Inject, Injectable } from '@nestjs/common';
import { BACKEND_RUNTIME, type BackendRuntime } from '../runtime.js';
const PLANOS_PADRAO: readonly (readonly [string, number, number, string])[] = [
  ['Mensal', 30, 1, 'Plano mensal de 30 dias'],
  ['Trimestral', 90, 3, 'Plano trimestral de 90 dias'],
  ['Semestral', 180, 6, 'Plano semestral de 180 dias'],
  ['Anual', 365, 12, 'Plano anual de 365 dias'],
];

@Injectable()
export class PlansServersStore {
  constructor(
    @Inject(BACKEND_RUNTIME) private readonly runtime: BackendRuntime,
  ) {}
  get dependencies() {
    if (!this.runtime.plansServers)
      throw new Error('Dependencias de planos e servidores nao configuradas.');
    return this.runtime.plansServers;
  }
  async rename(
    userId: number,
    campo: 'plano' | 'servidor',
    nomeAntigo: string,
    nomeNovo: string,
  ) {
    if (!nomeAntigo || !nomeNovo || nomeAntigo === nomeNovo) return;
    await this.dependencies.execute(
      campo === 'plano' || campo === 'servidor'
        ? `UPDATE clientes SET \`${campo}\` = CASE WHEN \`${campo}\` = :antigo THEN :novo ELSE \`${campo}\` END,
          plano_adicional = CASE WHEN JSON_UNQUOTE(JSON_EXTRACT(plano_adicional, '$.${campo}')) = :antigo
            THEN JSON_SET(plano_adicional, '$.${campo}', :novo) ELSE plano_adicional END
         WHERE user_id = :userId AND (\`${campo}\` = :antigo OR JSON_UNQUOTE(JSON_EXTRACT(plano_adicional, '$.${campo}')) = :antigo)`
        : `UPDATE clientes SET \`${campo}\` = :novo WHERE user_id = :userId AND \`${campo}\` = :antigo`,
      { userId, antigo: nomeAntigo, novo: nomeNovo },
    );
    if (campo === 'plano' || campo === 'servidor') {
      await this.dependencies.execute(
        `UPDATE transacoes SET \`${campo}\` = :novo WHERE user_id = :userId AND \`${campo}\` = :antigo`,
        { userId, antigo: nomeAntigo, novo: nomeNovo },
      );
    }
  }
  async seedPlans(userId: number) {
    // Semeia os padrões UMA ÚNICA VEZ. Se o usuário apagar um depois, NÃO recria.
    if (await this.dependencies.jaSemeou(userId, 'planos')) return;
    const existentes = await this.dependencies.queryRows(
      'SELECT nome FROM planos WHERE user_id = :userId',
      { userId },
    );
    const nomes = new Set(
      existentes.map((r) => String(r.nome).trim().toLowerCase()),
    );
    for (const [nome, periodo, creditos, descricao] of PLANOS_PADRAO) {
      if (nomes.has(nome.toLowerCase())) continue;
      await this.dependencies.execute(
        `INSERT INTO planos (user_id, nome, tipo, periodo, credito_gastos, clientes, observacao, ativo)
       VALUES (:userId, :nome, 'Dias', :periodo, :creditos, 0, :descricao, 1)`,
        { userId, nome, periodo, creditos, descricao },
      );
    }
    await this.dependencies.marcarSemeado(userId, 'planos');
  }
}

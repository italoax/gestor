import { Router } from "express";
import { execute, queryOne, queryRows } from "../db/mysql.js";
import { toNullableString, toNumber } from "../services/format.js";
import { jaSemeou, marcarSemeado } from "./simpleCrud.js";
import type { RowDataPacket } from "mysql2";

// Coluna do cliente que guarda o nome do catálogo como string (denormalizada).
// Ao renomear um item do catálogo, propaga pra essa coluna nos clientes.
type CatalogoConfig = {
  // Slug singular: "dispositivo", "aplicativo". Usado em flash, action e coluna do cliente.
  singular: string;
  // Slug plural: "dispositivos", "aplicativos". Usado em rota e tabela.
  plural: string;
  // Título e subtítulo da página renderizada.
  titulo: string;
  subtitulo: string;
  // Sementes padrão semeadas na primeira visita (nome + descrição).
  padroes: Array<[string, string]>;
  // Inclui o campo valor_renovacao (DECIMAL) no CRUD. Aplicativos sim, dispositivos não.
  comValorRenovacao?: boolean;
};

interface BaseCatalogoRow extends RowDataPacket {
  id: number; nome: string; descricao: string | null; status: string;
  valorRenovacao?: number;
}

export function criarCatalogoRouter(config: CatalogoConfig) {
  const { singular, plural, titulo, subtitulo, padroes, comValorRenovacao } = config;
  const router = Router();

  async function semear(userId: number) {
    if (await jaSemeou(userId, plural)) return;
    const existentes = await queryRows<RowDataPacket & { nome: string }>(
      `SELECT nome FROM ${plural} WHERE user_id = :userId`, { userId });
    const nomes = new Set(existentes.map((r) => String(r.nome).trim().toLowerCase()));
    for (const [nome, descricao] of padroes) {
      if (nomes.has(nome.toLowerCase())) continue;
      await execute(
        `INSERT INTO ${plural} (user_id, nome, descricao, status) VALUES (:userId, :nome, :descricao, 'Ativo')`,
        { userId, nome, descricao },
      );
    }
    await marcarSemeado(userId, plural);
  }

  router.get(`/${plural}`, async (req, res, next) => {
    try {
      const userId = req.session.user!.id;
      await semear(userId);
      const selectCols = comValorRenovacao
        ? "id, nome, descricao, valor_renovacao AS valorRenovacao, status"
        : "id, nome, descricao, status";
      const items = await queryRows<BaseCatalogoRow>(
        `SELECT ${selectCols} FROM ${plural} WHERE user_id = :userId ORDER BY nome ASC`,
        { userId },
      );
      const normalized = comValorRenovacao
        ? items.map((i) => ({ ...i, valorRenovacao: Number(i.valorRenovacao ?? 0) }))
        : items;
      res.render(`pages/${plural}`, { title: titulo, subtitle: subtitulo, [plural]: normalized });
    } catch (error) { next(error); }
  });

  router.post(`/${plural}`, async (req, res, next) => {
    try {
      const userId = req.session.user!.id;
      const id = Number(req.body.id);
      const action = String(req.body.action ?? "");

      if (action === `delete_${singular}`) {
        await execute(`DELETE FROM ${plural} WHERE id = :id AND user_id = :userId`, { id, userId });
        req.flash("success", `${capitalize(singular)} apagado.`);
        return res.redirect(`/${plural}`);
      }

      const nome = String(req.body.nome ?? "").trim();
      if (!nome) {
        req.flash("error", `Informe o nome do ${singular}.`);
        return res.redirect(`/${plural}`);
      }

      const data: Record<string, unknown> = {
        userId, id, nome,
        descricao: toNullableString(req.body.descricao),
        status: String(req.body.status) === "Inativo" ? "Inativo" : "Ativo",
      };
      if (comValorRenovacao) data.valorRenovacao = toNumber(req.body.valor_renovacao);

      if (action === `update_${singular}`) {
        // Renomear propaga para a coluna `${singular}` dos clientes — senão a
        // tabela ficaria mostrando o nome antigo nas linhas vinculadas.
        const atual = await queryOne<RowDataPacket & { nome: string }>(
          `SELECT nome FROM ${plural} WHERE id = :id AND user_id = :userId LIMIT 1`, { id, userId },
        );
        const setExtra = comValorRenovacao ? ", valor_renovacao = :valorRenovacao" : "";
        await execute(
          `UPDATE ${plural} SET nome = :nome, descricao = :descricao${setExtra}, status = :status WHERE id = :id AND user_id = :userId`,
          data,
        );
        if (atual?.nome && atual.nome !== nome) {
          await execute(
            `UPDATE clientes SET \`${singular}\` = :novo WHERE user_id = :userId AND \`${singular}\` = :antigo`,
            { userId, antigo: atual.nome, novo: nome },
          );
        }
        req.flash("success", `${capitalize(singular)} atualizado.`);
      } else {
        const colsExtra = comValorRenovacao ? ", valor_renovacao" : "";
        const valsExtra = comValorRenovacao ? ", :valorRenovacao" : "";
        await execute(
          `INSERT INTO ${plural} (user_id, nome, descricao${colsExtra}, status) VALUES (:userId, :nome, :descricao${valsExtra}, :status)`,
          data,
        );
        req.flash("success", `${capitalize(singular)} criado.`);
      }
      res.redirect(`/${plural}`);
    } catch (error) { next(error); }
  });

  return router;
}

function capitalize(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

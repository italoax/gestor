import { Router } from "express";
import { execute, queryRows } from "../db/mysql.js";
import { toNullableString, toNumber } from "../services/format.js";
import { jaSemeou, marcarSemeado } from "./simpleCrud.js";
import type { RowDataPacket } from "mysql2";

interface AplicativoRow extends RowDataPacket {
  id: number; nome: string; descricao: string | null; valorRenovacao: number; status: string;
}

// Catálogo padrão de aplicativos, semeado UMA ÚNICA VEZ na primeira visita.
const APLICATIVOS_PADRAO: Array<[string, string]> = [
  ["EasyTV", "Aplicativo de streaming EasyTV"],
  ["Funplay", "Aplicativo de streaming Funplay"],
  ["GSE Smart IPTV", "GSE Smart IPTV Player"],
  ["IptvSmarters", "IPTV Smarters Player"],
  ["MegaPlay", "Aplicativo de streaming MegaPlay"],
  ["TiviMate", "TiviMate IPTV Player"],
];

async function seedAplicativosPadrao(userId: number) {
  if (await jaSemeou(userId, "aplicativos")) return;
  const existentes = await queryRows<RowDataPacket & { nome: string }>(
    "SELECT nome FROM aplicativos WHERE user_id = :userId", { userId });
  const nomes = new Set(existentes.map((r) => String(r.nome).trim().toLowerCase()));
  for (const [nome, descricao] of APLICATIVOS_PADRAO) {
    if (nomes.has(nome.toLowerCase())) continue;
    await execute(
      "INSERT INTO aplicativos (user_id, nome, descricao, status) VALUES (:userId, :nome, :descricao, 'Ativo')",
      { userId, nome, descricao },
    );
  }
  await marcarSemeado(userId, "aplicativos");
}

export const aplicativosRouter = Router();

aplicativosRouter.get("/aplicativos", async (req, res, next) => {
  try {
    const userId = req.session.user!.id;
    await seedAplicativosPadrao(userId);
    const aplicativos = await queryRows<AplicativoRow>(
      "SELECT id, nome, descricao, valor_renovacao AS valorRenovacao, status FROM aplicativos WHERE user_id = :userId ORDER BY nome ASC",
      { userId },
    );
    res.render("pages/aplicativos", {
      title: "Aplicativos",
      subtitle: "Gerencie o catálogo de aplicativos e seus valores de renovação",
      aplicativos: aplicativos.map((a) => ({ ...a, valorRenovacao: Number(a.valorRenovacao ?? 0) })),
    });
  } catch (error) { next(error); }
});

aplicativosRouter.post("/aplicativos", async (req, res, next) => {
  try {
    const userId = req.session.user!.id;
    const id = Number(req.body.id);
    const action = String(req.body.action ?? "");
    if (action === "delete_aplicativo") {
      await execute("DELETE FROM aplicativos WHERE id = :id AND user_id = :userId", { id, userId });
      req.flash("success", "Aplicativo apagado.");
    } else {
      const nome = String(req.body.nome ?? "").trim();
      if (!nome) {
        req.flash("error", "Informe o nome do aplicativo.");
        return res.redirect("/aplicativos");
      }
      const data = {
        userId, id, nome,
        descricao: toNullableString(req.body.descricao),
        valorRenovacao: toNumber(req.body.valor_renovacao),
        status: String(req.body.status) === "Inativo" ? "Inativo" : "Ativo",
      };
      if (action === "update_aplicativo") {
        await execute(
          "UPDATE aplicativos SET nome = :nome, descricao = :descricao, valor_renovacao = :valorRenovacao, status = :status WHERE id = :id AND user_id = :userId",
          data,
        );
        req.flash("success", "Aplicativo atualizado.");
      } else {
        await execute(
          "INSERT INTO aplicativos (user_id, nome, descricao, valor_renovacao, status) VALUES (:userId, :nome, :descricao, :valorRenovacao, :status)",
          data,
        );
        req.flash("success", "Aplicativo criado.");
      }
    }
    res.redirect("/aplicativos");
  } catch (error) { next(error); }
});

import { Router } from "express";
import { execute, queryRows } from "../db/mysql.js";
import { toNullableString } from "../services/format.js";
import { jaSemeou, marcarSemeado } from "./simpleCrud.js";
import type { RowDataPacket } from "mysql2";

interface DispositivoRow extends RowDataPacket {
  id: number; nome: string; descricao: string | null; status: string;
}

// Catálogo padrão de dispositivos, semeado UMA ÚNICA VEZ na primeira visita.
const DISPOSITIVOS_PADRAO: string[] = [
  "AOC Roku TV", "Android", "Android TV", "Apple TV", "Chromecast", "Chromecast com Google TV",
  "Fire TV Cube", "Fire TV Stick", "Google TV", "LG webOS", "Linux PC", "MXQ Pro", "MacBook",
  "Nintendo Switch", "Notebook Windows", "PC Windows", "PS4", "PS5", "Philips Roku TV",
  "Roku Express", "Roku Premiere", "Roku Stick", "Roku TV", "Samsung Galaxy Tab", "Samsung Tizen",
  "Smart TV AOC", "Smart TV JVC", "Smart TV LG", "Smart TV Multilaser", "Smart TV Panasonic",
  "Smart TV Philco", "Smart TV Philips", "Smart TV Samsung", "Smart TV Semp TCL", "Smart TV Sony",
  "Smart TV TCL", "Smart TV Toshiba", "TCL Roku TV", "TV Box Android", "Tablet Android",
  "Xbox One", "Xbox Series S", "Xbox Series X", "Xiaomi Mi Box", "Xiaomi Mi TV Stick",
  "iMac", "iPad", "iPhone",
];

async function seedDispositivosPadrao(userId: number) {
  if (await jaSemeou(userId, "dispositivos")) return;
  const existentes = await queryRows<RowDataPacket & { nome: string }>(
    "SELECT nome FROM dispositivos WHERE user_id = :userId", { userId });
  const nomes = new Set(existentes.map((r) => String(r.nome).trim().toLowerCase()));
  for (const nome of DISPOSITIVOS_PADRAO) {
    if (nomes.has(nome.toLowerCase())) continue;
    await execute(
      "INSERT INTO dispositivos (user_id, nome, status) VALUES (:userId, :nome, 'Ativo')",
      { userId, nome },
    );
  }
  await marcarSemeado(userId, "dispositivos");
}

export const dispositivosRouter = Router();

dispositivosRouter.get("/dispositivos", async (req, res, next) => {
  try {
    const userId = req.session.user!.id;
    await seedDispositivosPadrao(userId);
    const dispositivos = await queryRows<DispositivoRow>(
      "SELECT id, nome, descricao, status FROM dispositivos WHERE user_id = :userId ORDER BY nome ASC",
      { userId },
    );
    res.render("pages/dispositivos", {
      title: "Dispositivos",
      subtitle: "Gerencie o catálogo de dispositivos dos clientes",
      dispositivos,
    });
  } catch (error) { next(error); }
});

dispositivosRouter.post("/dispositivos", async (req, res, next) => {
  try {
    const userId = req.session.user!.id;
    const id = Number(req.body.id);
    const action = String(req.body.action ?? "");
    if (action === "delete_dispositivo") {
      await execute("DELETE FROM dispositivos WHERE id = :id AND user_id = :userId", { id, userId });
      req.flash("success", "Dispositivo apagado.");
    } else {
      const nome = String(req.body.nome ?? "").trim();
      if (!nome) {
        req.flash("error", "Informe o nome do dispositivo.");
        return res.redirect("/dispositivos");
      }
      const data = {
        userId, id, nome,
        descricao: toNullableString(req.body.descricao),
        status: String(req.body.status) === "Inativo" ? "Inativo" : "Ativo",
      };
      if (action === "update_dispositivo") {
        await execute(
          "UPDATE dispositivos SET nome = :nome, descricao = :descricao, status = :status WHERE id = :id AND user_id = :userId",
          data,
        );
        req.flash("success", "Dispositivo atualizado.");
      } else {
        await execute(
          "INSERT INTO dispositivos (user_id, nome, descricao, status) VALUES (:userId, :nome, :descricao, :status)",
          data,
        );
        req.flash("success", "Dispositivo criado.");
      }
    }
    res.redirect("/dispositivos");
  } catch (error) { next(error); }
});

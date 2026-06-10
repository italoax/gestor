import { Router } from "express";
import { execute, queryRows } from "../db/mysql.js";
import { toNullableString, toNumber } from "../services/format.js";
import type { RowDataPacket } from "mysql2";

interface PlanoRow extends RowDataPacket { id: number; nome: string; clientes: number; tipo: string; periodo: number; observacao: string | null; }
interface ServidorRow extends RowDataPacket { id: number; nome: string; clientesTotal: number; clientesAtivos: number; clientesInativos: number; testesTotal: number; testesAtivos: number; testesInativos: number; creditos: number; valorCred: number; sessao: string; integracao: string; }
interface MensagemRow extends RowDataPacket { id: number; titulo: string; mensagem: string | null; mediaTipo: string | null; mediaPath: string | null; }

export const crudRouter = Router();

crudRouter.get("/planos", async (req, res, next) => {
  try {
    const planos = await queryRows<PlanoRow>(
      `SELECT p.id, p.nome, COALESCE(contagem.clientes, 0) AS clientes,
              p.tipo, p.periodo, p.observacao
         FROM planos p
         LEFT JOIN (
           SELECT user_id, TRIM(plano) AS plano, COUNT(*) AS clientes
             FROM clientes
            WHERE user_id = :userId AND TRIM(COALESCE(plano, '')) <> ''
            GROUP BY user_id, TRIM(plano)
         ) contagem ON contagem.user_id = p.user_id AND contagem.plano = TRIM(p.nome)
        WHERE p.user_id = :userId
        ORDER BY p.id DESC`, { userId: req.session.user!.id });
    res.render("pages/planos", { title: "Planos", planos });
  } catch (error) { next(error); }
});

crudRouter.post("/planos", async (req, res, next) => {
  try {
    const userId = req.session.user!.id;
    const id = Number(req.body.id);
    const action = String(req.body.action ?? "");
    if (action === "delete_plano") {
      await execute("DELETE FROM planos WHERE id = :id AND user_id = :userId", { id, userId });
      req.flash("success", "Plano apagado.");
    } else {
      const data = { userId, id, nome: String(req.body.nome ?? "").trim(), tipo: String(req.body.tipo ?? "Mês"), periodo: toNumber(req.body.periodo, 1), creditoGastos: 0, observacao: toNullableString(req.body.observacao) };
      if (action === "update_plano") {
        await execute(`UPDATE planos SET nome = :nome, tipo = :tipo, periodo = :periodo, credito_gastos = :creditoGastos, observacao = :observacao WHERE id = :id AND user_id = :userId`, data);
        req.flash("success", "Plano atualizado.");
      } else {
        await execute(`INSERT INTO planos (user_id, nome, tipo, periodo, credito_gastos, clientes, observacao) VALUES (:userId, :nome, :tipo, :periodo, :creditoGastos, 0, :observacao)`, data);
        req.flash("success", "Plano criado.");
      }
    }
    res.redirect("/planos");
  } catch (error) { next(error); }
});

crudRouter.get("/servidores", async (req, res, next) => {
  try {
    const servidores = await queryRows<ServidorRow>(
      `SELECT s.id, s.nome,
              COALESCE(contagem.clientesTotal, 0) AS clientesTotal,
              COALESCE(contagem.clientesAtivos, 0) AS clientesAtivos,
              COALESCE(contagem.clientesInativos, 0) AS clientesInativos,
              s.testes_total AS testesTotal, s.testes_ativos AS testesAtivos,
              s.testes_inativos AS testesInativos, s.creditos, s.valor_cred AS valorCred, s.sessao, s.integracao
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
        ORDER BY s.id DESC`, { userId: req.session.user!.id });
    res.render("pages/servidores", { title: "Servidores", servidores });
  } catch (error) { next(error); }
});

crudRouter.post("/servidores", async (req, res, next) => {
  try {
    const userId = req.session.user!.id;
    const id = Number(req.body.id);
    const action = String(req.body.action ?? "");
    if (action === "delete_servidor") {
      await execute("DELETE FROM servidores WHERE id = :id AND user_id = :userId", { id, userId });
      req.flash("success", "Servidor apagado.");
    } else {
      const data = {
        userId, id, nome: String(req.body.nome ?? "").trim(),
        clientesTotal: toNumber(req.body.clientes_total), clientesAtivos: toNumber(req.body.clientes_ativos), clientesInativos: toNumber(req.body.clientes_inativos),
        testesTotal: toNumber(req.body.testes_total), testesAtivos: toNumber(req.body.testes_ativos), testesInativos: toNumber(req.body.testes_inativos),
        creditos: toNumber(req.body.creditos), valorCred: toNumber(req.body.valor_cred), sessao: String(req.body.sessao ?? "Não definido"), integracao: String(req.body.integracao ?? "Não definida"),
      };
      if (action === "update_servidor") {
        await execute(`UPDATE servidores SET nome = :nome, clientes_total = :clientesTotal, clientes_ativos = :clientesAtivos, clientes_inativos = :clientesInativos, testes_total = :testesTotal, testes_ativos = :testesAtivos, testes_inativos = :testesInativos, creditos = :creditos, valor_cred = :valorCred, sessao = :sessao, integracao = :integracao WHERE id = :id AND user_id = :userId`, data);
        req.flash("success", "Servidor atualizado.");
      } else {
        await execute(`INSERT INTO servidores (user_id, nome, clientes_total, clientes_ativos, clientes_inativos, testes_total, testes_ativos, testes_inativos, creditos, valor_cred, sessao, integracao) VALUES (:userId, :nome, :clientesTotal, :clientesAtivos, :clientesInativos, :testesTotal, :testesAtivos, :testesInativos, :creditos, :valorCred, :sessao, :integracao)`, data);
        req.flash("success", "Servidor criado.");
      }
    }
    res.redirect("/servidores");
  } catch (error) { next(error); }
});

crudRouter.get("/mensagens", async (req, res, next) => {
  try {
    const mensagens = await queryRows<MensagemRow>(`SELECT id, titulo, mensagem, media_tipo AS mediaTipo, media_path AS mediaPath FROM mensagens WHERE user_id = :userId ORDER BY id DESC`, { userId: req.session.user!.id });
    res.render("pages/mensagens", { title: "Mensagens", mensagens });
  } catch (error) { next(error); }
});

crudRouter.post("/mensagens", async (req, res, next) => {
  try {
    const userId = req.session.user!.id;
    const id = Number(req.body.id);
    const action = String(req.body.action ?? "");
    if (action === "delete_mensagem") {
      await execute("DELETE FROM mensagens WHERE id = :id AND user_id = :userId", { id, userId });
      req.flash("success", "Mensagem apagada.");
    } else {
      const data = { userId, id, titulo: String(req.body.titulo ?? "").trim(), mensagem: toNullableString(req.body.mensagem), mediaTipo: toNullableString(req.body.media_tipo), mediaPath: toNullableString(req.body.media_path) };
      if (action === "update_mensagem") {
        await execute(`UPDATE mensagens SET titulo = :titulo, mensagem = :mensagem, media_tipo = :mediaTipo, media_path = :mediaPath WHERE id = :id AND user_id = :userId`, data);
        req.flash("success", "Mensagem atualizada.");
      } else {
        await execute(`INSERT INTO mensagens (user_id, titulo, mensagem, media_tipo, media_path) VALUES (:userId, :titulo, :mensagem, :mediaTipo, :mediaPath)`, data);
        req.flash("success", "Mensagem criada.");
      }
    }
    res.redirect("/mensagens");
  } catch (error) { next(error); }
});

import { Router } from "express";
import fs from "node:fs";
import { execute, queryOne, queryRows } from "../db/mysql.js";
import { formatMoney, formatDateBr } from "../services/format.js";
import { toNumber, toNullableString, boolField } from "../services/format.js";
import { gerarDumpSql, listarBackups, caminhoBackup, rodarBackupAgendado } from "../services/backup.js";
import { appTodayIso } from "../services/dates.js";
import { createLogger } from "../services/logger.js";
import { requireAdmin } from "../middleware/auth.js";
import type { RowDataPacket } from "mysql2";

// Painel do dono do sistema (is_admin=1). Gerencia os planos de assinatura do
// gestor, os usuarios (vencimento/admin) e os backups do banco.
// Montado em /admin no server.ts; todos os paths aqui sao RELATIVOS a /admin.
const logger = createLogger("admin");

export const adminRouter = Router();

// Guard no proprio router: toda rota /admin/* exige is_admin (fresh no banco).
adminRouter.use(requireAdmin);

interface PlanoAssinaturaRow extends RowDataPacket {
  id: number; nome: string; preco: number; descricao: string | null;
  diasValidade: number; ativo: number; ordem: number;
}
interface UserAdminRow extends RowDataPacket {
  id: number; name: string; username: string; email: string | null;
  isAdmin: number; vencimento: string | null; diasFaltando: number | null;
}

adminRouter.get("/", (_req, res) => res.redirect("/admin/planos"));

// ---------- PLANOS DE ASSINATURA ----------
adminRouter.get("/planos", async (_req, res, next) => {
  try {
    const planos = await queryRows<PlanoAssinaturaRow>(
      `SELECT id, nome, preco, descricao, dias_validade AS diasValidade, ativo, ordem
         FROM assinatura_planos ORDER BY ordem ASC, id ASC`,
    );
    res.render("pages/admin-planos", {
      title: "Admin · Planos", subtitle: "Planos de assinatura do gestor",
      planos, formatMoney,
    });
  } catch (error) { next(error); }
});

adminRouter.post("/planos", async (req, res, next) => {
  try {
    const action = String(req.body.action ?? "");
    const id = Number(req.body.id);
    if (action === "delete_plano") {
      await execute("DELETE FROM assinatura_planos WHERE id = :id", { id });
      req.flash("success", "Plano removido.");
    } else {
      const data = {
        id,
        nome: String(req.body.nome ?? "").trim(),
        preco: toNumber(req.body.preco, 0),
        descricao: toNullableString(req.body.descricao),
        diasValidade: toNumber(req.body.dias_validade, 30),
        ativo: boolField(req.body.ativo),
        ordem: toNumber(req.body.ordem, 0),
      };
      if (!data.nome) { req.flash("error", "Nome obrigatório."); return res.redirect("/admin/planos"); }
      if (action === "update_plano") {
        await execute(
          `UPDATE assinatura_planos SET nome = :nome, preco = :preco, descricao = :descricao,
                  dias_validade = :diasValidade, ativo = :ativo, ordem = :ordem WHERE id = :id`, data);
        req.flash("success", "Plano atualizado.");
      } else {
        await execute(
          `INSERT INTO assinatura_planos (nome, preco, descricao, dias_validade, ativo, ordem)
           VALUES (:nome, :preco, :descricao, :diasValidade, :ativo, :ordem)`, data);
        req.flash("success", "Plano criado.");
      }
    }
    res.redirect("/admin/planos");
  } catch (error) { next(error); }
});

// ---------- USUARIOS ----------
adminRouter.get("/usuarios", async (_req, res, next) => {
  try {
    const today = appTodayIso();
    const usuarios = await queryRows<UserAdminRow>(
      `SELECT id, name, username, email, is_admin AS isAdmin,
              DATE_FORMAT(assinatura_vencimento, '%Y-%m-%d') AS vencimento,
              DATEDIFF(assinatura_vencimento, :today) AS diasFaltando
         FROM users ORDER BY id ASC`,
      { today },
    );
    res.render("pages/admin-usuarios", {
      title: "Admin · Usuários", subtitle: "Contas e assinaturas",
      usuarios, formatDateBr,
    });
  } catch (error) { next(error); }
});

adminRouter.post("/usuarios", async (req, res, next) => {
  try {
    const action = String(req.body.action ?? "");
    const id = Number(req.body.id);
    const selfId = req.session.user?.id;
    if (action === "toggle_admin") {
      // Trava de seguranca: nao deixa o admin remover o proprio acesso e ficar
      // sem nenhum admin no sistema por engano.
      if (id === selfId) { req.flash("error", "Você não pode alterar o próprio status de admin."); return res.redirect("/admin/usuarios"); }
      await execute("UPDATE users SET is_admin = 1 - is_admin WHERE id = :id", { id });
      req.flash("success", "Status de admin alterado.");
    } else if (action === "estender") {
      const dias = toNumber(req.body.dias, 30);
      // Estende a partir do maior entre hoje e o vencimento atual (nao "come"
      // dias ja pagos quando a conta ainda esta ativa).
      await execute(
        `UPDATE users SET assinatura_vencimento =
           DATE_ADD(GREATEST(COALESCE(assinatura_vencimento, CURDATE()), CURDATE()), INTERVAL :dias DAY)
         WHERE id = :id`, { id, dias });
      req.flash("success", `Assinatura estendida em ${dias} dias.`);
      logger.info(`admin estendeu user=${id} em ${dias} dias`);
    } else if (action === "bloquear") {
      // Define vencimento pra ontem — bloqueia no proximo acesso.
      await execute("UPDATE users SET assinatura_vencimento = DATE_SUB(CURDATE(), INTERVAL 1 DAY) WHERE id = :id", { id });
      req.flash("success", "Assinatura bloqueada.");
    }
    res.redirect("/admin/usuarios");
  } catch (error) { next(error); }
});

// ---------- BACKUPS ----------
adminRouter.get("/backups", (_req, res, next) => {
  try {
    res.render("pages/admin-backups", {
      title: "Admin · Backups", subtitle: "Backup do banco de dados",
      backups: listarBackups(),
    });
  } catch (error) { next(error); }
});

// Gera um backup sob demanda (alem do diario automatico).
adminRouter.post("/backups/gerar", async (req, res, next) => {
  try {
    // Reusa o backup do dia se ja existe; senao gera.
    const r = await rodarBackupAgendado();
    req.flash("success", r.gerado ? "Backup gerado." : "Backup de hoje já existia (reaproveitado).");
    res.redirect("/admin/backups");
  } catch (error) { next(error); }
});

// Download direto — gera o dump na hora e faz stream (sempre a versao atual).
adminRouter.get("/backups/download-agora", async (_req, res, next) => {
  try {
    const dump = await gerarDumpSql();
    const nome = `gestor-${appTodayIso()}-agora.sql`;
    res.setHeader("Content-Type", "application/sql; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${nome}"`);
    res.send(dump);
  } catch (error) { next(error); }
});

// Download de um backup ja salvo em disco.
adminRouter.get("/backups/download/:nome", (req, res, next) => {
  try {
    const p = caminhoBackup(String(req.params.nome));
    if (!p) return res.status(404).render("pages/error", { title: "Não encontrado", error: { message: "Backup não encontrado." } });
    res.download(p);
  } catch (error) { next(error); }
});

adminRouter.post("/backups/excluir", (req, res, next) => {
  try {
    const p = caminhoBackup(String(req.body.nome));
    if (p) { fs.unlinkSync(p); req.flash("success", "Backup excluído."); }
    res.redirect("/admin/backups");
  } catch (error) { next(error); }
});

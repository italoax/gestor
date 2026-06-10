import { Router } from "express";
import bcrypt from "bcryptjs";
import { execute, queryOne } from "../db/mysql.js";
import type { RowDataPacket } from "mysql2";

interface UserRow extends RowDataPacket { id: number; name: string; username: string; email: string | null; passwordHash: string; }

export const accountRouter = Router();

accountRouter.get("/minha-conta", async (req, res, next) => {
  try {
    const user = await queryOne<UserRow>("SELECT id, name, username, email, password_hash AS passwordHash FROM users WHERE id = :id LIMIT 1", { id: req.session.user!.id });
    res.render("pages/minha-conta", { title: "Minha Conta", account: user });
  } catch (error) { next(error); }
});

accountRouter.post("/minha-conta", async (req, res, next) => {
  try {
    const id = req.session.user!.id;
    const name = String(req.body.name ?? "").trim();
    const username = String(req.body.username ?? "").trim();
    const email = String(req.body.email ?? "").trim();
    const password = String(req.body.password ?? "");
    const passwordConfirm = String(req.body.password_confirm ?? "");
    if (!name || !username || !email) {
      req.flash("error", "Nome, usuário e email são obrigatórios.");
      return res.redirect("/minha-conta");
    }
    const existingUser = await queryOne<UserRow>("SELECT id, name, username, email, password_hash AS passwordHash FROM users WHERE (username = :username OR email = :email) AND id <> :id LIMIT 1", { id, username, email });
    if (existingUser) {
      req.flash("error", "Usuário ou email já cadastrado em outra conta.");
      return res.redirect("/minha-conta");
    }
    if (password) {
      if (password.length < 6 || password !== passwordConfirm) {
        req.flash("error", "Senha inválida ou confirmação diferente.");
        return res.redirect("/minha-conta");
      }
      const passwordHash = await bcrypt.hash(password, 12);
      await execute("UPDATE users SET name = :name, username = :username, email = :email, password_hash = :passwordHash WHERE id = :id", { id, name, username, email, passwordHash });
    } else {
      await execute("UPDATE users SET name = :name, username = :username, email = :email WHERE id = :id", { id, name, username, email });
    }
    req.session.user = { id, name, username, email };
    req.flash("success", "Conta atualizada.");
    return res.redirect("/minha-conta");
  } catch (error) { next(error); }
});

import { Router } from "express";
import bcrypt from "bcryptjs";
import { execute, queryOne } from "../db/mysql.js";
import type { RowDataPacket } from "mysql2";

interface UserRow extends RowDataPacket {
  id: number;
  name: string;
  username: string;
  email: string | null;
  passwordHash: string;
}

export const authRouter = Router();

const REMEMBER_ME_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 30;

function wantsPersistentLogin(value: unknown): boolean {
  return ["1", "true", "on", "yes", "sim"].includes(String(value ?? "").toLowerCase());
}

authRouter.get("/login", (req, res) => {
  if (req.session.user) return res.redirect("/dashboard");
  res.render("pages/login", { title: "Login" });
});

authRouter.post("/login", async (req, res, next) => {
  try {
    const username = String(req.body.username ?? "").trim();
    const password = String(req.body.password ?? "");
    const user = await queryOne<UserRow>(
      "SELECT id, name, username, email, password_hash AS passwordHash FROM users WHERE username = :username LIMIT 1",
      { username },
    );
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      req.flash("error", "Usuário ou senha inválidos.");
      return res.redirect("/login");
    }
    const remember = wantsPersistentLogin(req.body.remember);
    req.session.user = { id: user.id, name: user.name, username: user.username, email: user.email };
    req.session.cookie.maxAge = remember ? REMEMBER_ME_MAX_AGE_MS : undefined;
    res.redirect("/dashboard");
  } catch (error) { next(error); }
});

authRouter.get("/register", (req, res) => {
  res.render("pages/register", { title: "Criar conta" });
});

authRouter.post("/register", async (req, res, next) => {
  try {
    const name = String(req.body.name ?? "").trim();
    const username = String(req.body.username ?? "").trim();
    const email = String(req.body.email ?? "").trim();
    const password = String(req.body.password ?? "");
    const passwordConfirm = String(req.body.password_confirm ?? "");
    if (!name || !username || !email || !password) { req.flash("error", "Preencha nome, usuário, email e senha."); return res.redirect("/register"); }
    if (!/^[a-zA-Z0-9_.-]{3,30}$/.test(username)) { req.flash("error", "Usuário inválido."); return res.redirect("/register"); }
    if (password.length < 6 || password !== passwordConfirm) { req.flash("error", "Senha inválida ou confirmação diferente."); return res.redirect("/register"); }
    const existingUser = await queryOne<UserRow>("SELECT id, name, username, email, password_hash AS passwordHash FROM users WHERE username = :username OR email = :email LIMIT 1", { username, email });
    if (existingUser) { req.flash("error", "Usuário ou email já cadastrado."); return res.redirect("/register"); }
    const passwordHash = await bcrypt.hash(password, 12);
    const result = await execute(
      "INSERT INTO users (name, username, email, password_hash, created_at) VALUES (:name, :username, :email, :passwordHash, NOW())",
      { name, username, email, passwordHash },
    );
    req.session.user = { id: result.insertId, name, username, email };
    res.redirect("/dashboard");
  } catch (error) { next(error); }
});

authRouter.post("/logout", (req, res) => {
  req.session.destroy(() => res.redirect("/login"));
});

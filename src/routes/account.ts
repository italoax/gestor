import { Router } from "express";
import bcrypt from "bcryptjs";
import rateLimit from "express-rate-limit";
import { execute, queryOne, queryRows } from "../db/mysql.js";
import { invalidarPixConfig } from "../services/pixConfig.js";
import { toNullableString } from "../services/format.js";
import type { RowDataPacket } from "mysql2";

interface UserRow extends RowDataPacket {
  id: number; name: string; username: string; email: string | null; passwordHash: string;
  pixChave?: string | null; pixNome?: string | null; pixTipo?: string | null;
}

export const accountRouter = Router();
const accountRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, limit: 10,
  keyGenerator: req => String(req.session.user!.id),
  standardHeaders: "draft-7", legacyHeaders: false,
  message: "Muitas tentativas de alteração da conta. Aguarde 15 minutos.",
});

accountRouter.get("/minha-conta", async (req, res, next) => {
  try {
    const user = await queryOne<UserRow>(
      `SELECT id, name, username, email, password_hash AS passwordHash,
              pix_chave AS pixChave, pix_nome AS pixNome, pix_tipo AS pixTipo
         FROM users WHERE id = :id LIMIT 1`,
      { id: req.session.user!.id },
    );
    res.render("pages/minha-conta", { title: "Minha Conta", account: user });
  } catch (error) { next(error); }
});

// Salva a chave PIX estatica (usada na tag {pix} das mensagens). Form separado
// do perfil pra nao exigir reenviar nome/senha so pra editar a chave.
accountRouter.post("/minha-conta/pix", async (req, res, next) => {
  try {
    const id = req.session.user!.id;
    const pixChave = toNullableString(req.body.pix_chave);
    const pixNome = toNullableString(req.body.pix_nome);
    const pixTipo = toNullableString(req.body.pix_tipo);
    await execute(
      "UPDATE users SET pix_chave = :pixChave, pix_nome = :pixNome, pix_tipo = :pixTipo WHERE id = :id",
      { id, pixChave, pixNome, pixTipo },
    );
    invalidarPixConfig(id); // limpa o cache pra a mudanca valer na proxima mensagem
    req.flash("success", "Chave PIX salva. Use a tag {pix} nas mensagens.");
    return res.redirect("/minha-conta");
  } catch (error) { next(error); }
});

accountRouter.post("/minha-conta", accountRateLimit, async (req, res, next) => {
  try {
    const id = req.session.user!.id;
    const name = String(req.body.name ?? "").trim();
    const username = String(req.body.username ?? "").trim();
    const password = String(req.body.password ?? "");
    const passwordConfirm = String(req.body.password_confirm ?? "");
    const account = await queryOne<UserRow>("SELECT username, password_hash AS passwordHash FROM users WHERE id = :id LIMIT 1", { id });
    if (!account) return res.sendStatus(401);
    if (password || username !== account.username) {
      const currentPassword = req.body.current_password;
      if (typeof currentPassword !== "string" || !currentPassword || Buffer.byteLength(currentPassword, "utf8") > 72 || !(await bcrypt.compare(currentPassword, account.passwordHash))) {
        req.flash("error", "Informe a senha atual correta para alterar o usuário ou a senha.");
        return res.redirect("/minha-conta");
      }
    }
    if (!name || !username) {
      req.flash("error", "Nome e usuário são obrigatórios.");
      return res.redirect("/minha-conta");
    }
    const existingUser = await queryOne<UserRow>("SELECT id FROM users WHERE username = :username AND id <> :id LIMIT 1", { id, username });
    if (existingUser) {
      req.flash("error", "Usuário já cadastrado em outra conta.");
      return res.redirect("/minha-conta");
    }
    if (password) {
      if (password.length < 8 || Buffer.byteLength(password, "utf8") > 72 || password !== passwordConfirm) {
        req.flash("error", "A nova senha deve ter pelo menos 8 caracteres, no máximo 72 bytes e confirmação igual.");
        return res.redirect("/minha-conta");
      }
      const passwordHash = await bcrypt.hash(password, 12);
      await execute("UPDATE users SET name = :name, username = :username, password_hash = :passwordHash WHERE id = :id", { id, name, username, passwordHash });
    } else {
      await execute("UPDATE users SET name = :name, username = :username WHERE id = :id", { id, name, username });
    }
    // Preserva isAdmin da sessao (senao o menu Admin some ao editar o perfil).
    req.session.user = { ...req.session.user!, id, name, username };
    req.flash("success", "Conta atualizada.");
    return res.redirect("/minha-conta");
  } catch (error) { next(error); }
});

// Backup completo dos dados do usuário em JSON. Útil pra ter cópia local caso
// dê problema no banco (Hostinger oferece backup mas pode demorar a restaurar)
// e pra migrar dados entre instalações. Filtrado por user_id — não vaza dados
// de outros tenants.
accountRouter.get("/minha-conta/backup", async (req, res, next) => {
  try {
    const userId = req.session.user!.id;
    const [user, clientes, transacoes, planos, servidores, dispositivos, aplicativos, mensagens, cobrancas] = await Promise.all([
      queryOne<RowDataPacket>("SELECT id, name, username, email FROM users WHERE id = :userId", { userId }),
      queryRows<RowDataPacket>("SELECT * FROM clientes WHERE user_id = :userId ORDER BY id", { userId }),
      queryRows<RowDataPacket>("SELECT * FROM transacoes WHERE user_id = :userId ORDER BY id", { userId }),
      queryRows<RowDataPacket>("SELECT * FROM planos WHERE user_id = :userId ORDER BY id", { userId }),
      queryRows<RowDataPacket>("SELECT * FROM servidores WHERE user_id = :userId ORDER BY id", { userId }),
      queryRows<RowDataPacket>("SELECT * FROM dispositivos WHERE user_id = :userId ORDER BY id", { userId }),
      queryRows<RowDataPacket>("SELECT * FROM aplicativos WHERE user_id = :userId ORDER BY id", { userId }),
      queryRows<RowDataPacket>("SELECT * FROM mensagens WHERE user_id = :userId ORDER BY id", { userId }),
      queryRows<RowDataPacket>("SELECT * FROM cobrancas WHERE user_id = :userId ORDER BY id", { userId }),
    ]);
    const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const filename = `gestor-backup-${userId}-${stamp}.json`;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(JSON.stringify({
      meta: { exportadoEm: new Date().toISOString(), versao: 1, user },
      clientes, transacoes, planos, servidores, dispositivos, aplicativos, mensagens, cobrancas,
    }, null, 2));
  } catch (error) { next(error); }
});

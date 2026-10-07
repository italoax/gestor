import crypto from "node:crypto";
import { Router } from "express";
import rateLimit from "express-rate-limit";
import type { RowDataPacket } from "mysql2";
import { execute, queryOne, queryRows } from "../db/mysql.js";
import { requireAuth } from "../middleware/auth.js";
import { escolherProvedor } from "../services/paymentProvider.js";
import { caminhoPagamento } from "../services/linkPagamentoUrl.js";
import { escolhasRenovacao, lerPlanoAdicional, type PlanoRenovacao } from "../services/renovacaoOpcoes.js";

export const areaClienteRouter = Router();
const revision = (cliente: RowDataPacket) => crypto.createHash("sha256").update(JSON.stringify([cliente.user, cliente.senha, cliente.pagamento_curto || null])).digest("hex");
const sameSecret = (a: string, b: string) => crypto.timingSafeEqual(crypto.createHash("sha256").update(a).digest(), crypto.createHash("sha256").update(b).digest());
const fields = "id, user_id, nome, user, vencimento, hora_vencimento, plano, valor, telas, servidor, sigma_customer_id, plano_adicional, status, aplicativo, senha, pagamento_token, pagamento_curto";
const limit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: "draft-7", legacyHeaders: false, message: "Muitas tentativas. Aguarde 15 minutos." });

areaClienteRouter.use(["/area-cliente", "/acessos-clientes"], (_req, res, next) => {
  res.set("Cache-Control", "no-store");
  res.set("Referrer-Policy", "no-referrer");
  next();
});
areaClienteRouter.get("/area-cliente/login", limit, async (req, res, next) => {
  try {
    const alias = String(req.query.acesso ?? "");
    const cliente = /^[A-Za-z0-9_-]{16}$/.test(alias)
      ? await queryOne<RowDataPacket>("SELECT id, user, senha, pagamento_curto FROM clientes WHERE pagamento_curto = :alias AND arquivado = 0 AND portal_bloqueado = 0 LIMIT 1", { alias }) : null;
    if (cliente) {
      await new Promise<void>((resolve, reject) => req.session.regenerate(err => err ? reject(err) : resolve()));
      req.session.cliente = { id: cliente.id, revision: revision(cliente), viaLink: true };
      req.session.cookie.maxAge = 8 * 60 * 60 * 1000;
      await new Promise<void>((resolve, reject) => req.session.save(err => err ? reject(err) : resolve()));
      return res.redirect("/area-cliente");
    }
    if (alias) return res.status(401).render("pages/area-cliente", { layout: false, cliente: null, pix: false, erro: "Link de acesso inválido ou indisponível. Entre com seus dados IPTV ou solicite um novo link." });
    res.render("pages/area-cliente", { layout: false, cliente: null, pix: false, loginValue: "", erro: req.flash("portal-error").join(" ") });
  } catch (error) { next(error); }
});
areaClienteRouter.post("/area-cliente/login", limit, async (req, res, next) => {
  try {
    const login = String(req.body.login ?? "").trim();
    const password = String(req.body.password ?? "");
    const rejectLogin = (erro: string) => res.status(401).render("pages/area-cliente", {
      layout: false, cliente: null, pix: false, loginValue: login, erro,
    });
    if (!login) return rejectLogin("Informe seu usuário IPTV.");
    const candidates = login.length <= 120
      ? await queryRows<RowDataPacket>("SELECT id, user, senha, pagamento_curto, arquivado, portal_bloqueado FROM clientes WHERE user = :login", { login }) : [];
    const users = candidates.filter(c => c.user === login);
    const enabled = users.filter(c => !c.arquivado && !c.portal_bloqueado);
    if (!password) return rejectLogin("Informe sua senha IPTV.");
    const matches = password.length <= 190 ? enabled.filter(c => c.senha && sameSecret(String(c.senha), password)) : [];
    if (matches.length !== 1) return rejectLogin("Usuário ou senha inválidos, ou acesso indisponível. Confira seus dados ou entre em contato com o responsável.");
    const cliente = matches[0];
    await new Promise<void>((resolve, reject) => req.session.regenerate(err => err ? reject(err) : resolve()));
    req.session.cliente = { id: cliente.id, revision: revision(cliente) };
    req.session.cookie.maxAge = 8 * 60 * 60 * 1000;
    await new Promise<void>((resolve, reject) => req.session.save(err => err ? reject(err) : resolve()));
    res.redirect("/area-cliente");
  } catch (err) { next(err); }
});
areaClienteRouter.post("/area-cliente/sair", (req, res, next) => {
  req.session.destroy(err => err ? next(err) : res.redirect("/area-cliente/login"));
});
areaClienteRouter.use("/area-cliente", async (req, res, next) => {
  try {
    const identity = req.session.cliente;
    if (!identity) return res.redirect("/area-cliente/login");
    const cliente = await queryOne<RowDataPacket>(`SELECT ${fields} FROM clientes WHERE id = :id AND arquivado = 0 AND portal_bloqueado = 0`, { id: identity.id });
    const credencialValida = identity.viaLink ? Boolean(cliente?.pagamento_curto) : Boolean(cliente?.senha);
    if (!cliente || !credencialValida || revision(cliente) !== identity.revision) {
      delete req.session.cliente;
      return res.redirect("/area-cliente/login");
    }
    res.locals.portalCliente = cliente;
    next();
  } catch (err) { next(err); }
});
areaClienteRouter.get("/area-cliente", async (req, res, next) => {
  try {
    const cliente = res.locals.portalCliente;
    const pix = Boolean(await escolherProvedor(cliente.user_id));
    const escolhas = await escolhasRenovacao(cliente, nome => queryOne<RowDataPacket & PlanoRenovacao>("SELECT periodo, tipo, credito_gastos AS creditoGastos FROM planos WHERE user_id = :userId AND nome = :nome LIMIT 1", { userId: cliente.user_id, nome }));
    res.render("pages/area-cliente", { layout: false, cliente, adicional: lerPlanoAdicional(cliente.plano_adicional), pix, escolhas, opcoesRenovacao: escolhas[0].opcoes, erro: req.flash("portal-error").join(" ") });
  } catch (err) { next(err); }
});
areaClienteRouter.post("/area-cliente/renovar", async (req, res, next) => {
  try {
    const cliente = res.locals.portalCliente;
    if (!await escolherProvedor(cliente.user_id)) {
      req.flash("portal-error", "O PIX ainda não foi configurado. Entre em contato com o responsável pelo seu cadastro.");
      return res.redirect("/area-cliente");
    }
    await execute("UPDATE clientes SET pagamento_token = :token WHERE id = :id AND pagamento_token IS NULL", { id: cliente.id, token: crypto.randomBytes(16).toString("hex") });
    const row = await queryOne<RowDataPacket>("SELECT pagamento_token FROM clientes WHERE id = :id", { id: cliente.id });
    if (req.get("Accept") === "application/json") return res.json({ pagamentoUrl: `/pagar/${encodeURIComponent(row!.pagamento_token)}` });
    const periodos = Number(req.body.periodos ?? 1);
    const selecao = ['ambos', 'principal', 'adicional'].includes(req.body.selecao) ? req.body.selecao : '';
    const params = new URLSearchParams();
    if (Number.isSafeInteger(periodos) && periodos > 1) params.set('periodos', String(periodos));
    if (selecao) params.set('selecao', selecao);
    res.redirect(caminhoPagamento(row!.pagamento_token) + (params.size ? '?' + params.toString() : ''));
  } catch (err) { next(err); }
});

areaClienteRouter.get("/acessos-clientes", requireAuth, async (req, res, next) => {
  try {
    const selectedId = req.query.cliente === undefined ? null : Number(req.query.cliente);
    if (selectedId !== null && (!Number.isSafeInteger(selectedId) || selectedId <= 0)) return res.sendStatus(400);
    const clientes = await queryRows<RowDataPacket>("SELECT id, nome, user, pagamento_curto, portal_bloqueado, (senha IS NOT NULL AND senha <> '') AS temSenha FROM clientes WHERE user_id = :owner AND arquivado = 0" + (selectedId !== null ? " AND id = :selectedId" : "") + " ORDER BY nome", { owner: req.session.user!.id, selectedId });
    if (selectedId !== null && !clientes.length) return res.sendStatus(404);
    if (req.get('Accept') === 'application/json' && selectedId !== null) {
      const c = clientes[0];
      return res.json({ id: c.id, nome: c.nome, user: c.user, blocked: Boolean(c.portal_bloqueado), hasLink: Boolean(c.pagamento_curto) });
    }
    res.render("pages/acessos-clientes", { title: "Acessos dos clientes", clientes, aviso: req.flash("portal-admin").join(" ") });
  } catch (err) { next(err); }
});
areaClienteRouter.post("/acessos-clientes", requireAuth, async (req, res, next) => {
  try {
    const id = Number(req.body.id), owner = req.session.user!.id;
    const cliente = await queryOne<RowDataPacket>("SELECT id FROM clientes WHERE id = :id AND user_id = :owner AND arquivado = 0", { id, owner });
    if (!cliente) return res.sendStatus(404);
    if (req.body.action === "revoke-link") {
      await execute("UPDATE clientes SET pagamento_curto = NULL WHERE id = :id AND user_id = :owner AND arquivado = 0", { id, owner });
      if (req.get('Accept') === 'application/json') return res.json({ ok: true, message: 'Link revogado. O próximo envio ou cópia gerará um novo link.' });
      req.flash("portal-admin", "Link revogado. As sessões anteriores precisarão entrar novamente. Copie ou envie o link para gerar um novo.");
      return res.redirect(`/acessos-clientes?cliente=${id}`);
    }
    if (!["disable", "enable"].includes(req.body.action)) return res.sendStatus(400);
    const blocked = req.body.action === "disable" ? 1 : 0;
    await execute("UPDATE clientes SET portal_bloqueado = :blocked WHERE id = :id AND user_id = :owner AND arquivado = 0", { id, owner, blocked });
    if (req.get('Accept') === 'application/json') return res.json({ ok: true, message: blocked ? 'Acesso desativado.' : 'Acesso habilitado.' });
    req.flash("portal-admin", blocked ? "Acesso desativado." : "Acesso habilitado com os dados do IPTV.");
    res.redirect(`/acessos-clientes?cliente=${id}`);
  } catch (err) { next(err); }
});

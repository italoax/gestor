import { Router } from "express";
import { execute, queryOne, queryRows } from "../db/mysql.js";
import type { RowDataPacket } from "mysql2";
import { env } from "../config/env.js";
import {
  carregarConfigsDoUsuario, salvarConfig,
  PROVIDER_LISTA, PROVIDER_NOMES, type ProviderName,
} from "../services/paymentProvider.js";

export const integracaoPagamentoRouter = Router();

integracaoPagamentoRouter.get("/integracao-pagamento", async (req, res, next) => {
  try {
    const userId = req.session.user!.id;
    const configs = await carregarConfigsDoUsuario(userId);
    const mensagens = await queryRows<RowDataPacket>("SELECT id, titulo FROM mensagens WHERE user_id = :userId ORDER BY titulo", { userId });
    const preferencia = await queryOne<RowDataPacket>("SELECT mensagem_pix_confirmado_id AS mensagemId, provider_padrao AS providerPadrao FROM users WHERE id = :userId", { userId });
    const credPorProvider: Record<string, Record<string, unknown>> = {};
    const ativoPorProvider: Record<string, boolean> = {};
    for (const c of configs) {
      credPorProvider[c.provider] = c.credenciais;
      ativoPorProvider[c.provider] = c.ativo;
    }
    res.render("pages/integracao-pagamento", {
      title: "Integração Pagamento",
      mensagens,
      appUrl: env.appUrl.replace(/\/$/, ""),
      providerPadrao: preferencia?.providerPadrao || configs.find(c => c.ativo)?.provider || '',
      mensagemConfirmacaoId: preferencia?.mensagemId ?? null,
      providers: PROVIDER_LISTA,
      providerNomes: PROVIDER_NOMES,
      credPorProvider,
      ativoPorProvider,
    });
  } catch (error) { next(error); }
});

// Schema de credenciais por provedor. Cada nome aqui vira `creds_<provider>_<campo>` no form.
const SCHEMAS: Record<ProviderName, string[]> = {
  mercadopago: ["access_token"],
  asaas: ["access_token", "ambiente"],
  openpix: ["app_id"],
  pagbank: ["access_token", "ambiente"],
  pagarme: ["secret_key"],
};

integracaoPagamentoRouter.post("/integracao-pagamento", async (req, res, next) => {
  try {
    const userId = req.session.user!.id;
    const provider = String(req.body.provider ?? "") as ProviderName;
    if (req.body.action === "provedor-padrao") {
      const configs = await carregarConfigsDoUsuario(userId);
      if (!configs.some(c => c.provider === provider && c.ativo)) {
        req.flash("error", "Configure e ative o provedor antes de selecioná-lo.");
        return res.redirect("/integracao-pagamento");
      }
      await execute("UPDATE users SET provider_padrao = :provider WHERE id = :userId", { provider, userId });
      req.flash("success", "Provedor para receber PIX atualizado.");
      return res.redirect("/integracao-pagamento");
    }
    if (req.body.action === "mensagem-confirmacao") {
      const raw = String(req.body.mensagem_id ?? "");
      const mensagemId = raw ? Number(raw) : null;
      if (raw && (!Number.isSafeInteger(mensagemId) || !await queryOne<RowDataPacket>("SELECT id FROM mensagens WHERE id = :id AND user_id = :userId", { id: mensagemId, userId }))) {
        req.flash("error", "Escolha uma mensagem válida.");
        return res.redirect("/integracao-pagamento");
      }
      await execute("UPDATE users SET mensagem_pix_confirmado_id = :mensagemId WHERE id = :userId", { mensagemId, userId });
      req.flash("success", "Mensagem após confirmação do PIX salva.");
      return res.redirect("/integracao-pagamento");
    }
    if (!SCHEMAS[provider]) {
      req.flash("error", "Provedor inválido.");
      return res.redirect("/integracao-pagamento");
    }
    const credenciais: Record<string, unknown> = {};
    let temAlgo = false;
    for (const campo of SCHEMAS[provider]) {
      const v = String(req.body[`creds_${provider}_${campo}`] ?? "").trim();
      if (v) { credenciais[campo] = v; temAlgo = true; }
    }
    const ativo = req.body[`ativo_${provider}`] === "1" && temAlgo;
    await salvarConfig(userId, provider, credenciais, ativo);
    req.flash("success", `${provider} ${ativo ? "ativado" : "salvo"}.`);
    return res.redirect("/integracao-pagamento");
  } catch (error) { next(error); }
});

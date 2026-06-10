import { Router } from "express";
import { execute, queryRows } from "../db/mysql.js";
import { appNowSql } from "../services/dates.js";
import { normalizeDateInput, toNullableString, toNumber } from "../services/format.js";
import { enviarMensagemModelo } from "../services/whatsapp.js";
import type { RowDataPacket } from "mysql2";

interface ClienteRow extends RowDataPacket {
  id: number; nome: string; user: string; telefone: string; vencimento: Date | string; plano: string;
  valor: number; status: string; servidor: string; telas: number; creditosGastos: number;
  pagoEm: Date | string | null; valorPago: number | null; formaPagamento: string | null;
  custoPagamento: number | null; observacaoPagamento: string | null;
}
interface PlanoRow extends RowDataPacket { id: number; nome: string; creditoGastos: number; periodo: number; }
interface ServidorRow extends RowDataPacket { id: number; nome: string; valorCred: number; sessao: string; }
interface MensagemRow extends RowDataPacket { id: number; titulo: string; mensagem: string | null; mediaTipo: string | null; mediaPath: string | null; }

function normalizePhoneInput(prefixValue: unknown, phoneValue: unknown) {
  const prefixDigits = String(prefixValue || "+55").replace(/\D+/g, "") || "55";
  let phoneText = String(phoneValue ?? "").trim();
  let phoneDigits = phoneText.replace(/\D+/g, "");
  if (!phoneDigits) return "";
  if (phoneDigits.startsWith(prefixDigits) && phoneDigits.length > prefixDigits.length) {
    phoneDigits = phoneDigits.slice(prefixDigits.length);
    phoneText = phoneDigits;
  }
  return `+${prefixDigits} ${phoneText}`.trim();
}

export const clientesRouter = Router();

clientesRouter.get("/clientes", async (req, res, next) => {
  try {
    const userId = req.session.user!.id;
    const [clientes, planos, servidores, mensagens] = await Promise.all([
      queryRows<ClienteRow>(
        `SELECT id, nome, user, telefone, vencimento, plano, valor, status, servidor, telas,
                creditos_gastos AS creditosGastos, pago_em AS pagoEm, valor_pago AS valorPago,
                forma_pagamento AS formaPagamento, custo_pagamento AS custoPagamento,
                observacao_pagamento AS observacaoPagamento
           FROM clientes WHERE user_id = :userId ORDER BY nome ASC`, { userId }),
      queryRows<PlanoRow>("SELECT id, nome, credito_gastos AS creditoGastos, periodo FROM planos WHERE user_id = :userId ORDER BY nome ASC", { userId }),
      queryRows<ServidorRow>("SELECT id, nome, valor_cred AS valorCred, sessao FROM servidores WHERE user_id = :userId ORDER BY nome ASC", { userId }),
      queryRows<MensagemRow>("SELECT id, titulo, mensagem, media_tipo AS mediaTipo, media_path AS mediaPath FROM mensagens WHERE user_id = :userId ORDER BY titulo ASC", { userId }),
    ]);
    res.render("pages/clientes", { title: "Clientes", clientes, planos, servidores, mensagens });
  } catch (error) { next(error); }
});

clientesRouter.post("/clientes", async (req, res, next) => {
  try {
    const userId = req.session.user!.id;
    const action = String(req.body.action ?? "");
    const id = Number(req.body.id);

    if (action === "delete_cliente") {
      await execute("DELETE FROM clientes WHERE id = :id AND user_id = :userId", { id, userId });
      req.flash("success", "Cliente apagado.");
      return res.redirect("/clientes");
    }

    if (action === "add_pagamento") {
      const valor = toNumber(req.body.valor_pago ?? req.body.valor);
      const vencimento = normalizeDateInput(req.body.vencimento);
      const pagoEm = normalizeDateInput(req.body.pago_em);
      if (!vencimento || (String(req.body.pago_em ?? "").trim() && !pagoEm)) {
        req.flash("error", "Data inválida. Use dd/mm/aaaa.");
        return res.redirect("/clientes");
      }
      const plano = String(req.body.plano ?? "").trim();
      await execute(
        `UPDATE clientes SET pago_em = COALESCE(:pagoEm, :now), valor_pago = :valorPago,
             forma_pagamento = :formaPagamento, vencimento = :vencimento, plano = :plano,
             valor = :valor, telas = :telas, creditos_gastos = :creditosGastos,
             custo_pagamento = :custoPagamento, observacao_pagamento = :observacaoPagamento,
             status = 'Ativo'
          WHERE id = :id AND user_id = :userId`,
        {
          id, userId, pagoEm: toNullableString(pagoEm), now: appNowSql(), valorPago: valor,
          formaPagamento: toNullableString(req.body.forma_pagamento), vencimento, plano,
          valor: toNumber(req.body.valor), telas: toNumber(req.body.telas, 1),
          creditosGastos: toNumber(req.body.creditos_gastos), custoPagamento: toNumber(req.body.custo_pagamento),
          observacaoPagamento: toNullableString(req.body.observacao_pagamento),
        },
      );
      req.flash("success", "Pagamento registrado.");
      const mensagemPagamentoId = Number(req.body.mensagem_pagamento_id);
      if (mensagemPagamentoId) {
        const [clientes, mensagens] = await Promise.all([
          queryRows<ClienteRow>("SELECT * FROM clientes WHERE id = :id AND user_id = :userId LIMIT 1", { id, userId }),
          queryRows<MensagemRow>("SELECT id, titulo, mensagem, media_tipo AS mediaTipo, media_path AS mediaPath FROM mensagens WHERE id = :mensagemId AND user_id = :userId LIMIT 1", { mensagemId: mensagemPagamentoId, userId }),
        ]);
        const cliente = clientes[0];
        const mensagem = mensagens[0];
        if (cliente && mensagem) {
          const result = await enviarMensagemModelo(cliente.servidor || "", cliente, mensagem);
          if (result.ok) {
            req.flash("success", "Pagamento salvo e mensagem enviada pelo WPPConnect.");
          } else {
            req.flash("error", `Pagamento salvo, mas não foi possível enviar a mensagem: ${result.error || "erro desconhecido"}`);
          }
        } else {
          req.flash("error", "Pagamento salvo, mas a mensagem escolhida não foi encontrada.");
        }
      }
      return res.redirect("/clientes");
    }

    if (action === "send_whatsapp") {
      const mensagemId = Number(req.body.mensagem_id);
      const [rows, mensagens] = await Promise.all([
        queryRows<ClienteRow>("SELECT * FROM clientes WHERE id = :id AND user_id = :userId LIMIT 1", { id, userId }),
        queryRows<MensagemRow>("SELECT id, titulo, mensagem, media_tipo AS mediaTipo, media_path AS mediaPath FROM mensagens WHERE id = :mensagemId AND user_id = :userId LIMIT 1", { mensagemId, userId }),
      ]);
      const cliente = rows[0];
      const mensagem = mensagens[0];
      if (!cliente) {
        req.flash("error", "Cliente não encontrado.");
      } else if (!mensagem) {
        req.flash("error", "Selecione uma mensagem válida.");
      } else {
        const result = await enviarMensagemModelo(cliente.servidor || "", cliente, mensagem);
        if (result.ok) {
          req.flash("success", `Mensagem enviada para ${cliente.nome}.`);
        } else {
          req.flash("error", `Não foi possível enviar para ${cliente.nome}: ${result.error || "erro desconhecido"}`);
        }
      }
      return res.redirect("/clientes");
    }

    const vencimento = normalizeDateInput(req.body.vencimento);
    const pagoEm = normalizeDateInput(req.body.pago_em);
    const data = {
      id, userId,
      nome: String(req.body.nome ?? "").trim(),
      user: String(req.body.user ?? "").trim(),
      telefone: normalizePhoneInput(req.body.telefone_prefixo, req.body.telefone),
      vencimento,
      plano: String(req.body.plano ?? "").trim(),
      valor: toNumber(req.body.valor),
      status: String(req.body.status ?? "Ativo"),
      servidor: String(req.body.servidor ?? "").trim(),
      telas: toNumber(req.body.telas, 1),
      creditosGastos: toNumber(req.body.creditos_gastos),
      pagoEm: toNullableString(pagoEm),
      valorPago: toNumber(req.body.valor_pago),
      formaPagamento: toNullableString(req.body.forma_pagamento),
      custoPagamento: toNumber(req.body.custo_pagamento),
      observacaoPagamento: toNullableString(req.body.observacao_pagamento),
    };

    if (!data.nome || !data.user || !data.telefone || !data.vencimento) {
      req.flash("error", "Preencha nome, usuário, telefone e vencimento. A data deve estar em dd/mm/aaaa.");
      return res.redirect("/clientes");
    }

    if (String(req.body.pago_em ?? "").trim() && !pagoEm) {
      req.flash("error", "Data de pagamento inválida. Use dd/mm/aaaa.");
      return res.redirect("/clientes");
    }

    if (action === "update_cliente") {
      await execute(
        `UPDATE clientes SET nome = :nome, user = :user, telefone = :telefone, vencimento = :vencimento,
             plano = :plano, valor = :valor, status = :status, servidor = :servidor, telas = :telas,
             creditos_gastos = :creditosGastos, pago_em = :pagoEm, valor_pago = :valorPago,
             forma_pagamento = :formaPagamento, custo_pagamento = :custoPagamento,
             observacao_pagamento = :observacaoPagamento
          WHERE id = :id AND user_id = :userId`, data);
      req.flash("success", "Cliente atualizado.");
    } else {
      await execute(
        `INSERT INTO clientes (user_id, nome, user, telefone, vencimento, plano, valor, status, servidor, telas,
             creditos_gastos, pago_em, valor_pago, forma_pagamento, custo_pagamento, observacao_pagamento)
         VALUES (:userId, :nome, :user, :telefone, :vencimento, :plano, :valor, :status, :servidor, :telas,
             :creditosGastos, :pagoEm, :valorPago, :formaPagamento, :custoPagamento, :observacaoPagamento)`, data);
      req.flash("success", "Cliente criado.");
    }
    return res.redirect("/clientes");
  } catch (error) { next(error); }
});

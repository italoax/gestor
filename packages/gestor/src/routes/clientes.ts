import { Router } from "express";
import { execute, queryRows } from "../db/mysql.js";
import { appNowSql } from "../services/dates.js";
import { boolField, normalizeDateInput, toNullableString, toNumber } from "../services/format.js";
import { enviarMensagemModelo } from "../services/whatsapp.js";
import type { RowDataPacket } from "mysql2";

interface ClienteRow extends RowDataPacket {
  id: number; nome: string; user: string; telefone: string; vencimento: Date | string; plano: string;
  valor: number; status: string; servidor: string; telas: number; creditosGastos: number;
  pagoEm: Date | string | null; valorPago: number | null; formaPagamento: string | null;
  custoPagamento: number | null; observacaoPagamento: string | null;
  senha: string | null; idPainel: string | null; email: string | null; captacao: string | null;
  aniversario: Date | string | null; linkM3u: string | null; timeCliente: string | null;
  telefoneSecundario: string | null; observacoes: string | null; dataInicio: Date | string | null;
  horaVencimento: string | null; sistemaPainel: string | null; pontosFidelidade: number;
  bloquearNotificacoes: number; enviarBoasVindas: number; dispositivo: string | null; aplicativo: string | null;
  arquivado: number;
}
interface PlanoRow extends RowDataPacket { id: number; nome: string; creditoGastos: number; periodo: number; }
interface ServidorRow extends RowDataPacket { id: number; nome: string; valorCred: number; sessao: string; urlRenovacao: string | null; }
interface MensagemRow extends RowDataPacket { id: number; titulo: string; mensagem: string | null; mediaTipo: string | null; mediaPath: string | null; }
interface DispositivoNomeRow extends RowDataPacket { nome: string; }

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

// Sessão do WhatsApp para envio = a do dispositivo principal cadastrado
// (a mesma que o painel conecta/mostra como "Conectado"). Evita usar o nome
// do servidor do cliente como sessão, que causava "WhatsApp não conectado".
async function sessaoWhatsappPrincipal(userId: number): Promise<string> {
  const rows = await queryRows<RowDataPacket & { sessao: string }>(
    "SELECT sessao FROM whatsapp_devices WHERE user_id = :userId ORDER BY principal DESC, id ASC LIMIT 1",
    { userId },
  );
  return rows[0]?.sessao ?? "";
}

export const clientesRouter = Router();

clientesRouter.get("/clientes", async (req, res, next) => {
  try {
    const userId = req.session.user!.id;
    const verArquivados = String(req.query.arquivados ?? "") === "1";
    const [clientes, planos, servidores, mensagens, dispositivosRows, aplicativosRows, whatsappDevicesRows] = await Promise.all([
      queryRows<ClienteRow>(
        `SELECT id, nome, user, telefone, vencimento, plano, valor, status, servidor, telas,
                creditos_gastos AS creditosGastos, pago_em AS pagoEm, valor_pago AS valorPago,
                forma_pagamento AS formaPagamento, custo_pagamento AS custoPagamento,
                observacao_pagamento AS observacaoPagamento,
                senha, id_painel AS idPainel, email, captacao, aniversario, link_m3u AS linkM3u,
                time_cliente AS timeCliente, telefone_secundario AS telefoneSecundario, observacoes,
                data_inicio AS dataInicio, hora_vencimento AS horaVencimento, sistema_painel AS sistemaPainel,
                pontos_fidelidade AS pontosFidelidade, bloquear_notificacoes AS bloquearNotificacoes,
                enviar_boas_vindas AS enviarBoasVindas, dispositivo, aplicativo, arquivado
           FROM clientes WHERE user_id = :userId AND arquivado = :arq ORDER BY nome ASC`, { userId, arq: verArquivados ? 1 : 0 }),
      queryRows<PlanoRow>("SELECT id, nome, credito_gastos AS creditoGastos, periodo FROM planos WHERE user_id = :userId ORDER BY nome ASC", { userId }),
      queryRows<ServidorRow>("SELECT id, nome, valor_cred AS valorCred, sessao, url_renovacao AS urlRenovacao FROM servidores WHERE user_id = :userId ORDER BY nome ASC", { userId }),
      queryRows<MensagemRow>("SELECT id, titulo, mensagem, media_tipo AS mediaTipo, media_path AS mediaPath FROM mensagens WHERE user_id = :userId ORDER BY titulo ASC", { userId }),
      queryRows<DispositivoNomeRow>("SELECT nome FROM dispositivos WHERE user_id = :userId AND status = 'Ativo' ORDER BY nome ASC", { userId }),
      queryRows<DispositivoNomeRow>("SELECT nome FROM aplicativos WHERE user_id = :userId AND status = 'Ativo' ORDER BY nome ASC", { userId }),
      queryRows<RowDataPacket & { nome: string; sessao: string }>("SELECT nome, sessao FROM whatsapp_devices WHERE user_id = :userId ORDER BY principal DESC, id ASC", { userId }),
    ]);
    const dispositivos = dispositivosRows.map((d) => d.nome);
    const aplicativos = aplicativosRows.map((a) => a.nome);
    const whatsappDevices = whatsappDevicesRows.map((d) => ({ nome: d.nome, sessao: d.sessao }));
    res.render("pages/clientes", {
      title: verArquivados ? "Clientes arquivados" : "Clientes",
      subtitle: verArquivados ? "Clientes que você arquivou" : "Gerencie todos os seus clientes",
      clientes, planos, servidores, mensagens, dispositivos, aplicativos, whatsappDevices, verArquivados,
    });
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

    if (action === "arquivar_cliente") {
      await execute("UPDATE clientes SET arquivado = 1 WHERE id = :id AND user_id = :userId", { id, userId });
      req.flash("success", "Cliente arquivado.");
      return res.redirect("/clientes");
    }

    if (action === "desarquivar_cliente") {
      await execute("UPDATE clientes SET arquivado = 0 WHERE id = :id AND user_id = :userId", { id, userId });
      req.flash("success", "Cliente desarquivado.");
      return res.redirect("/clientes?arquivados=1");
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
      // Consome os créditos da renovação do saldo do servidor do cliente.
      const creditosGastos = toNumber(req.body.creditos_gastos);
      if (creditosGastos > 0) {
        await execute(
          `UPDATE servidores s
              JOIN clientes c ON c.servidor = s.nome AND c.user_id = s.user_id
              SET s.creditos = s.creditos - :consumido
            WHERE c.id = :id AND s.user_id = :userId`,
          { consumido: creditosGastos, id, userId },
        );
      }
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
          const result = await enviarMensagemModelo(await sessaoWhatsappPrincipal(userId), cliente, mensagem);
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
      const sessaoEscolhida = String(req.body.dispositivo ?? "").trim();
      const sessao = sessaoEscolhida || await sessaoWhatsappPrincipal(userId);
      const templateId = Number(req.body.mensagem_id);
      const mediaTipo = String(req.body.media_tipo ?? "").trim().toLowerCase();
      const mediaUrl = String(req.body.media_url ?? "").trim();
      let texto = String(req.body.mensagem_texto ?? "").trim();

      const cliente = (await queryRows<ClienteRow>("SELECT * FROM clientes WHERE id = :id AND user_id = :userId LIMIT 1", { id, userId }))[0];
      if (!cliente) {
        req.flash("error", "Cliente não encontrado.");
        return res.redirect("/clientes");
      }
      // Sem texto digitado, mas com template escolhido: usa o texto do template.
      if (!texto && templateId) {
        const tpl = (await queryRows<MensagemRow>("SELECT mensagem FROM mensagens WHERE id = :mensagemId AND user_id = :userId LIMIT 1", { mensagemId: templateId, userId }))[0];
        texto = String(tpl?.mensagem ?? "").trim();
      }
      if (!texto && !mediaUrl) {
        req.flash("error", "Digite uma mensagem ou anexe uma mídia.");
        return res.redirect("/clientes");
      }

      const result = await enviarMensagemModelo(sessao, cliente, {
        mensagem: texto,
        mediaTipo: mediaUrl ? (mediaTipo || "image") : null,
        mediaPath: mediaUrl || null,
      });
      if (result.ok) {
        req.flash("success", `Mensagem enviada para ${cliente.nome}.`);
      } else {
        req.flash("error", `Não foi possível enviar para ${cliente.nome}: ${result.error || "erro desconhecido"}`);
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
      // Campos novos (aba Dados/Plano do modelo)
      senha: toNullableString(req.body.senha),
      idPainel: toNullableString(req.body.id_painel),
      email: toNullableString(req.body.email),
      captacao: toNullableString(req.body.captacao),
      aniversario: toNullableString(req.body.aniversario),
      linkM3u: toNullableString(req.body.link_m3u),
      timeCliente: toNullableString(req.body.time_cliente),
      telefoneSecundario: toNullableString(req.body.telefone_secundario),
      observacoes: toNullableString(req.body.observacoes),
      dataInicio: toNullableString(req.body.data_inicio),
      horaVencimento: toNullableString(req.body.hora_vencimento),
      sistemaPainel: toNullableString(req.body.sistema_painel),
      pontosFidelidade: toNumber(req.body.pontos_fidelidade),
      bloquearNotificacoes: boolField(req.body.bloquear_notificacoes),
      enviarBoasVindas: boolField(req.body.enviar_boas_vindas),
      dispositivo: toNullableString(req.body.dispositivo),
      aplicativo: toNullableString(req.body.aplicativo),
    };

    if (!data.nome || !data.telefone || !data.vencimento) {
      req.flash("error", "Preencha nome, WhatsApp e vencimento. A data deve estar em dd/mm/aaaa.");
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
             observacao_pagamento = :observacaoPagamento,
             senha = :senha, id_painel = :idPainel, email = :email, captacao = :captacao,
             aniversario = :aniversario, link_m3u = :linkM3u, time_cliente = :timeCliente,
             telefone_secundario = :telefoneSecundario, observacoes = :observacoes, data_inicio = :dataInicio,
             hora_vencimento = :horaVencimento, sistema_painel = :sistemaPainel,
             pontos_fidelidade = :pontosFidelidade, bloquear_notificacoes = :bloquearNotificacoes,
             enviar_boas_vindas = :enviarBoasVindas, dispositivo = :dispositivo, aplicativo = :aplicativo
          WHERE id = :id AND user_id = :userId`, data);
      req.flash("success", "Cliente atualizado.");
    } else {
      await execute(
        `INSERT INTO clientes (user_id, nome, user, telefone, vencimento, plano, valor, status, servidor, telas,
             creditos_gastos, pago_em, valor_pago, forma_pagamento, custo_pagamento, observacao_pagamento,
             senha, id_painel, email, captacao, aniversario, link_m3u, time_cliente, telefone_secundario,
             observacoes, data_inicio, hora_vencimento, sistema_painel, pontos_fidelidade,
             bloquear_notificacoes, enviar_boas_vindas, dispositivo, aplicativo)
         VALUES (:userId, :nome, :user, :telefone, :vencimento, :plano, :valor, :status, :servidor, :telas,
             :creditosGastos, :pagoEm, :valorPago, :formaPagamento, :custoPagamento, :observacaoPagamento,
             :senha, :idPainel, :email, :captacao, :aniversario, :linkM3u, :timeCliente, :telefoneSecundario,
             :observacoes, :dataInicio, :horaVencimento, :sistemaPainel, :pontosFidelidade,
             :bloquearNotificacoes, :enviarBoasVindas, :dispositivo, :aplicativo)`, data);
      req.flash("success", "Cliente criado.");
    }
    return res.redirect("/clientes");
  } catch (error) { next(error); }
});

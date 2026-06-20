import { Router } from "express";
import { execute, queryOne, queryRows } from "../db/mysql.js";
import { appNowSql, appTodayIso } from "../services/dates.js";
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
  horaVencimento: string | null; pontosFidelidade: number;
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

// Encontra o servidor de catálogo correspondente ao nome salvo no cliente.
// Se o nome exato não bate (catálogo foi renomeado depois — ex.: cliente tem
// "UNITV" mas o catálogo agora é "UNITV 30 DIAS"), tenta prefix match desde que
// ele resulte em um ÚNICO resultado — sem ambiguidade.
async function resolverServidorDoCliente(userId: number, nome: string): Promise<ServidorRow | null> {
  const direto = await queryOne<ServidorRow>(
    "SELECT id, nome, valor_cred AS valorCred, sessao, url_renovacao AS urlRenovacao FROM servidores WHERE user_id = :userId AND nome = :nome LIMIT 1",
    { userId, nome },
  );
  if (direto) return direto;

  const candidatos = await queryRows<ServidorRow>(
    "SELECT id, nome, valor_cred AS valorCred, sessao, url_renovacao AS urlRenovacao FROM servidores WHERE user_id = :userId AND nome LIKE :prefix LIMIT 2",
    { userId, prefix: `${nome}%` },
  );
  return candidatos.length === 1 ? candidatos[0] : null;
}

// Registra uma transação (controle de créditos/vendas) ao renovar ou cadastrar com pagamento.
interface ClienteTxRow extends RowDataPacket {
  nome: string; plano: string | null; servidor: string | null; telas: number;
  valorPago: number | null; custoPagamento: number | null; formaPagamento: string | null;
}
async function registrarTransacaoCliente(p: {
  userId: number; clienteId: number; clienteNome: string; descricao: string; data: string;
  formaPagamento: string | null; plano: string | null; servidor: string | null;
  telas: number; creditos: number; custo: number; valorVenda: number;
}) {
  const lucro = Number((p.valorVenda - p.custo).toFixed(2));
  await execute(
    `INSERT INTO transacoes (user_id, data, forma_pagamento, cliente_id, cliente_nome, descricao, plano,
         servidor, telas, creditos, custo, valor_venda, lucro)
     VALUES (:userId, :data, :formaPagamento, :clienteId, :clienteNome, :descricao, :plano,
         :servidor, :telas, :creditos, :custo, :valorVenda, :lucro)`,
    { ...p, lucro },
  );
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
                data_inicio AS dataInicio, hora_vencimento AS horaVencimento,
                pontos_fidelidade AS pontosFidelidade,
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
      const vencimento = normalizeDateInput(req.body.vencimento);
      const pagoEm = normalizeDateInput(req.body.pago_em);
      if (!vencimento || (String(req.body.pago_em ?? "").trim() && !pagoEm)) {
        req.flash("error", "Data inválida. Use dd/mm/aaaa.");
        return res.redirect("/clientes");
      }
      const plano = String(req.body.plano ?? "").trim();
      const servidor = String(req.body.servidor ?? "").trim();
      if (!plano || !servidor) {
        req.flash("error", "Este cliente está sem plano e/ou servidor. Edite o cliente para preencher esses campos antes de renovar.");
        return res.redirect("/clientes");
      }
      const valor = toNumber(req.body.valor);
      // Se o usuário não preencheu "valor pago", assume = valor da venda.
      const valorPago = req.body.valor_pago !== undefined && String(req.body.valor_pago).trim()
        ? toNumber(req.body.valor_pago) : valor;
      const telas = toNumber(req.body.telas, 1);
      const creditosGastos = toNumber(req.body.creditos_gastos);

      // Custo automático = valor_cred do servidor × créditos consumidos.
      // `servidorResolvido` cobre o caso onde o cliente ficou com nome antigo (ex.
      // "UNITV") depois que o catálogo virou "UNITV 30 DIAS" — busca prefix match
      // e, se único, adota como o nome canônico daqui pra frente.
      let custoPagamento = toNumber(req.body.custo_pagamento);
      let servidorResolvido = servidor;
      if (!custoPagamento && servidor) {
        const srv = await resolverServidorDoCliente(userId, servidor);
        if (srv) {
          servidorResolvido = srv.nome;
          const consumoCalc = creditosGastos > 0 ? creditosGastos : telas;
          if (srv.valorCred) custoPagamento = Number((Number(srv.valorCred) * consumoCalc).toFixed(2));
        }
      }

      // Empty-string check feito no JS (não no SQL com NULLIF). Antes, comparar
      // o valor mascarado pelo placeholder com a string literal '' disparava
      // "Illegal mix of collations" no MySQL quando a sessão usava utf8mb4_general_ci
      // mas a coluna está em utf8mb4_unicode_ci.
      await execute(
        `UPDATE clientes SET pago_em = COALESCE(:pagoEm, :now), valor_pago = :valorPago,
             forma_pagamento = :formaPagamento, vencimento = :vencimento, plano = :plano,
             servidor = COALESCE(:servidorOrNull, servidor),
             valor = :valor, telas = :telas, creditos_gastos = :creditosGastos,
             custo_pagamento = :custoPagamento, observacao_pagamento = :observacaoPagamento,
             hora_vencimento = COALESCE(:horaVencimentoOrNull, hora_vencimento),
             status = 'Ativo'
          WHERE id = :id AND user_id = :userId`,
        {
          id, userId, pagoEm: toNullableString(pagoEm), now: appNowSql(), valorPago,
          formaPagamento: toNullableString(req.body.forma_pagamento), vencimento, plano,
          // Salva o nome resolvido (após prefix match) — limpa a inconsistência herdada.
          servidorOrNull: servidorResolvido || null,
          valor, telas, creditosGastos, custoPagamento,
          observacaoPagamento: toNullableString(req.body.observacao_pagamento),
          horaVencimentoOrNull: toNullableString(req.body.hora_vencimento),
        },
      );
      // Consome os créditos da renovação do saldo do servidor do cliente.
      if (creditosGastos > 0) {
        await execute(
          `UPDATE servidores s
              JOIN clientes c ON c.servidor = s.nome AND c.user_id = s.user_id
              SET s.creditos = s.creditos - :consumido
            WHERE c.id = :id AND s.user_id = :userId`,
          { consumido: creditosGastos, id, userId },
        );
      }
      // Registra a renovação na aba Transações.
      const cliTx = await queryOne<ClienteTxRow>(
        "SELECT nome, plano, servidor, telas, valor_pago AS valorPago, custo_pagamento AS custoPagamento, forma_pagamento AS formaPagamento FROM clientes WHERE id = :id AND user_id = :userId LIMIT 1",
        { id, userId },
      );
      if (cliTx) {
        await registrarTransacaoCliente({
          userId, clienteId: id, clienteNome: cliTx.nome, descricao: "Renovação",
          data: pagoEm || appTodayIso(),
          formaPagamento: cliTx.formaPagamento, plano: cliTx.plano, servidor: cliTx.servidor,
          telas: Number(cliTx.telas) || 1, creditos: creditosGastos,
          custo: Number(cliTx.custoPagamento) || 0, valorVenda: Number(cliTx.valorPago) || 0,
        });
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
          const sessao = await sessaoWhatsappPrincipal(userId);
          if (!sessao) {
            req.flash("error", "Pagamento salvo, mas você não tem dispositivo WhatsApp cadastrado — cadastre em WhatsApp antes de enviar mensagens.");
          } else {
            const result = await enviarMensagemModelo(sessao, cliente, mensagem);
            if (result.ok) {
              req.flash("success", "Pagamento salvo e mensagem enviada pelo WhatsApp.");
            } else {
              req.flash("error", `Pagamento salvo, mas não foi possível enviar a mensagem: ${result.error || "erro desconhecido"}`);
            }
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
      if (!sessao) {
        req.flash("error", "Cadastre um dispositivo em WhatsApp antes de enviar mensagens.");
        return res.redirect("/clientes");
      }
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
    const data: {
      id: number; userId: number; nome: string; user: string; telefone: string; vencimento: string;
      plano: string; valor: number; status: string; servidor: string; telas: number; creditosGastos: number;
      pagoEm: string | null; valorPago: number | null; formaPagamento: string | null; custoPagamento: number | null;
      observacaoPagamento: string | null; senha: string | null; idPainel: string | null; email: string | null;
      captacao: string | null; aniversario: string | null; linkM3u: string | null; timeCliente: string | null;
      telefoneSecundario: string | null; observacoes: string | null; dataInicio: string | null;
      horaVencimento: string | null; pontosFidelidade: number;
      enviarBoasVindas: number; dispositivo: string | null; aplicativo: string | null;
    } = {
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
      pontosFidelidade: toNumber(req.body.pontos_fidelidade),
      enviarBoasVindas: boolField(req.body.enviar_boas_vindas),
      dispositivo: toNullableString(req.body.dispositivo),
      aplicativo: toNullableString(req.body.aplicativo),
    };

    if (!data.nome || !data.telefone || !data.vencimento || !data.plano || !data.servidor) {
      req.flash("error", "Preencha nome, WhatsApp, vencimento, plano e servidor.");
      return res.redirect("/clientes");
    }

    if (String(req.body.pago_em ?? "").trim() && !pagoEm) {
      req.flash("error", "Data de pagamento inválida. Use dd/mm/aaaa.");
      return res.redirect("/clientes");
    }

    if (action === "update_cliente") {
      // Os campos de pagamento (pago_em, valor_pago, custo_pagamento, observacao_pagamento)
      // NÃO estão no formulário de edição — então só atualizamos se vierem no body, senão
      // ficaríamos zerando o histórico do cadastro/renovação anterior.
      await execute(
        `UPDATE clientes SET nome = :nome, user = :user, telefone = :telefone, vencimento = :vencimento,
             plano = :plano, valor = :valor, status = :status, servidor = :servidor, telas = :telas,
             creditos_gastos = :creditosGastos,
             pago_em = COALESCE(:pagoEm, pago_em),
             valor_pago = COALESCE(:valorPagoOrNull, valor_pago),
             forma_pagamento = COALESCE(:formaPagamento, forma_pagamento),
             custo_pagamento = COALESCE(:custoPagamentoOrNull, custo_pagamento),
             observacao_pagamento = COALESCE(:observacaoPagamento, observacao_pagamento),
             senha = :senha, id_painel = :idPainel, email = :email, captacao = :captacao,
             aniversario = :aniversario, link_m3u = :linkM3u, time_cliente = :timeCliente,
             telefone_secundario = :telefoneSecundario, observacoes = :observacoes, data_inicio = :dataInicio,
             hora_vencimento = :horaVencimento,
             pontos_fidelidade = :pontosFidelidade,
             enviar_boas_vindas = :enviarBoasVindas, dispositivo = :dispositivo, aplicativo = :aplicativo
          WHERE id = :id AND user_id = :userId`,
        {
          ...data,
          // toNumber() devolve 0 quando o campo não veio — converto para null aqui pra
          // que COALESCE preserve o valor antigo (em vez de sobrescrever com 0).
          valorPagoOrNull: req.body.valor_pago !== undefined && String(req.body.valor_pago).trim() ? data.valorPago : null,
          custoPagamentoOrNull: req.body.custo_pagamento !== undefined && String(req.body.custo_pagamento).trim() ? data.custoPagamento : null,
        },
      );
      req.flash("success", "Cliente atualizado.");
    } else {
      // Novo cliente conta como primeiro pagamento (a menos que o usuário desmarque a opção).
      // Checkbox desmarcado não aparece no body (undefined). boolField trata isso como false — comportamento correto.
      const registrarPagamento = boolField(req.body.registrar_pagamento);
      if (registrarPagamento) {
        if (!data.pagoEm) data.pagoEm = appNowSql();
        if (!data.valorPago) data.valorPago = data.valor;
        // Custo automático = valor do crédito (do servidor) × créditos consumidos.
        // Só calcula se o usuário não informou um custo manual (que veio 0 do form atual).
        if (!data.custoPagamento && data.servidor) {
          const srv = await resolverServidorDoCliente(userId, data.servidor);
          if (srv) data.servidor = srv.nome;
          const consumoCalc = data.creditosGastos > 0 ? data.creditosGastos : toNumber(data.telas, 1);
          if (srv?.valorCred) data.custoPagamento = Number((Number(srv.valorCred) * consumoCalc).toFixed(2));
        }
      } else {
        // Sem registro de pagamento: salva NULL (não 0) nos campos financeiros para não
        // inflar relatórios com "valor_pago = R$ 0,00" para clientes que nunca pagaram.
        data.pagoEm = null;
        data.valorPago = null;
        data.formaPagamento = null;
        data.custoPagamento = null;
      }
      const novo = await execute(
        `INSERT INTO clientes (user_id, nome, user, telefone, vencimento, plano, valor, status, servidor, telas,
             creditos_gastos, pago_em, valor_pago, forma_pagamento, custo_pagamento, observacao_pagamento,
             senha, id_painel, email, captacao, aniversario, link_m3u, time_cliente, telefone_secundario,
             observacoes, data_inicio, hora_vencimento, pontos_fidelidade,
             enviar_boas_vindas, dispositivo, aplicativo)
         VALUES (:userId, :nome, :user, :telefone, :vencimento, :plano, :valor, :status, :servidor, :telas,
             :creditosGastos, :pagoEm, :valorPago, :formaPagamento, :custoPagamento, :observacaoPagamento,
             :senha, :idPainel, :email, :captacao, :aniversario, :linkM3u, :timeCliente, :telefoneSecundario,
             :observacoes, :dataInicio, :horaVencimento, :pontosFidelidade,
             :enviarBoasVindas, :dispositivo, :aplicativo)`, data);
      // Consome os créditos (nº de telas) do saldo do servidor escolhido.
      const consumo = data.creditosGastos > 0 ? data.creditosGastos : toNumber(data.telas, 1);
      if (registrarPagamento && consumo > 0 && data.servidor) {
        await execute(
          "UPDATE servidores SET creditos = creditos - :consumido WHERE user_id = :userId AND nome = :servidor",
          { consumido: consumo, userId, servidor: data.servidor },
        );
      }
      // Registra o cadastro com pagamento na aba Transações.
      if (registrarPagamento) {
        await registrarTransacaoCliente({
          userId, clienteId: Number(novo.insertId), clienteNome: data.nome, descricao: "Cadastro",
          data: data.pagoEm ? String(data.pagoEm).slice(0, 10) : appTodayIso(),
          formaPagamento: data.formaPagamento, plano: data.plano, servidor: data.servidor,
          telas: data.telas, creditos: consumo, custo: data.custoPagamento || 0, valorVenda: data.valorPago || 0,
        });
      }
      // Dispara o template escolhido pelo WhatsApp (se o switch "Enviar mensagem" estiver ligado).
      if (data.enviarBoasVindas) {
        const templateId = Number(req.body.template_boas_vindas);
        const sessao = await sessaoWhatsappPrincipal(userId);
        if (templateId && !sessao) {
          req.flash("error", "Cliente criado, mas não enviei a mensagem de boas-vindas: cadastre um dispositivo em WhatsApp antes.");
        } else if (templateId) {
          const tpl = await queryOne<MensagemRow>(
            "SELECT id, titulo, mensagem, media_tipo AS mediaTipo, media_path AS mediaPath FROM mensagens WHERE id = :mensagemId AND user_id = :userId LIMIT 1",
            { mensagemId: templateId, userId },
          );
          if (tpl) {
            const clienteCriado = { ...data, telefone: data.telefone, nome: data.nome };
            // Não bloqueia o cadastro se o envio falhar, mas mostra o erro no flash
            // pra usuário não ficar achando que mandou quando não mandou.
            const send = await enviarMensagemModelo(sessao, clienteCriado, tpl).catch((error) => ({ ok: false, error: error instanceof Error ? error.message : String(error) }));
            if (!send.ok) req.flash("error", `Cliente criado, mas não enviei a mensagem de boas-vindas: ${send.error || "erro desconhecido"}.`);
          } else {
            req.flash("error", "Cliente criado, mas o template de boas-vindas selecionado não foi encontrado.");
          }
        }
      }
      req.flash("success", "Cliente criado.");
    }
    return res.redirect("/clientes");
  } catch (error) { next(error); }
});

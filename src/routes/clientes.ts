import crypto from "node:crypto";
import { Router } from "express";
import { execute, queryOne, queryRows, withTransaction } from "../db/mysql.js";
import { appNowSql, appTodayIso } from "../services/dates.js";
import { boolField, normalizeDateInput, toNullableString, toNumber } from "../services/format.js";
import { enviarMensagemModelo } from "../services/whatsapp.js";
import { getPixConfig } from "../services/pixConfig.js";
import { CreditosError, consumoRenovacao, debitarCreditos } from "../services/creditos.js";
import { verificarCreditosServidor } from "../services/autoRenovacao.js";
import { decryptSecret } from "../services/crypto.js";
import { sigmaLoginAndRenew } from "../services/sigma.js";
import { urlPagamentoDoCliente } from "./pagamento.js";
import { listarRenovacoesPendentes } from "../services/renovacoesPendentes.js";
import type { PoolConnection, RowDataPacket, ResultSetHeader } from "mysql2/promise";

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
interface PlanoRow extends RowDataPacket { id: number; nome: string; creditoGastos: number; periodo: number; tipo: string | null; ativo: number; }
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
}, conn?: PoolConnection) {
  const lucro = Number((p.valorVenda - p.custo).toFixed(2));
  const sql = `INSERT INTO transacoes (user_id, data, forma_pagamento, cliente_id, cliente_nome, descricao, plano,
         servidor, telas, creditos, custo, valor_venda, lucro)
     VALUES (:userId, :data, :formaPagamento, :clienteId, :clienteNome, :descricao, :plano,
         :servidor, :telas, :creditos, :custo, :valorVenda, :lucro)`;
  const params = { ...p, lucro };
  if (conn) await conn.execute(sql, params);
  else await execute(sql, params);
}

export const clientesRouter = Router();

clientesRouter.get("/clientes/preferencias/mensagem-pagamento", async (req, res, next) => {
  try {
    const preferencia = await queryOne<RowDataPacket & { mensagemId: number | null }>(
      `SELECT m.id AS mensagemId FROM users u
       LEFT JOIN mensagens m ON m.id = u.mensagem_pagamento_padrao_id AND m.user_id = u.id
       WHERE u.id = :userId`,
      { userId: req.session.user!.id },
    );
    res.set("Cache-Control", "no-store").json({ mensagemId: preferencia?.mensagemId ?? null });
  } catch (error) { next(error); }
});

clientesRouter.post("/clientes/preferencias/mensagem-pagamento", async (req, res, next) => {
  try {
    const userId = req.session.user!.id;
    const valor = req.body.mensagemId;
    const mensagemId = valor === "" || valor === null ? null : Number(valor);
    if (mensagemId !== null) {
      if (!Number.isSafeInteger(mensagemId) || mensagemId <= 0) {
        return res.status(400).json({ message: "Mensagem inválida." });
      }
      const mensagem = await queryOne<RowDataPacket>(
        "SELECT id FROM mensagens WHERE id = :mensagemId AND user_id = :userId",
        { mensagemId, userId },
      );
      if (!mensagem) return res.status(400).json({ message: "Mensagem não encontrada." });
    }
    await execute("UPDATE users SET mensagem_pagamento_padrao_id = :mensagemId WHERE id = :userId", { mensagemId, userId });
    res.json({ mensagemId });
  } catch (error) { next(error); }
});

// Devolve (e gera, se preciso) a URL de pagamento pública desse cliente.
// Chamado via fetch pelo botão "Copiar link de pagamento" no row menu.
clientesRouter.get("/clientes/:id/link-pagamento", async (req, res, next) => {
  try {
    const userId = req.session.user!.id;
    const id = Number(req.params.id);
    const dono = await queryOne<{ id: number } & RowDataPacket>(
      "SELECT id FROM clientes WHERE id = :id AND user_id = :userId LIMIT 1",
      { id, userId },
    );
    if (!dono) return res.status(404).json({ ok: false, error: "Cliente não encontrado." });
    const url = await urlPagamentoDoCliente(id);
    if (!url) return res.status(500).json({ ok: false, error: "Falha ao gerar link." });
    res.json({ ok: true, url });
  } catch (error) { next(error); }
});

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
                enviar_boas_vindas AS enviarBoasVindas, dispositivo, aplicativo, arquivado,
                sigma_customer_id AS sigmaCustomerId
           FROM clientes WHERE user_id = :userId AND arquivado = :arq ORDER BY nome ASC`, { userId, arq: verArquivados ? 1 : 0 }),
      queryRows<PlanoRow>("SELECT id, nome, credito_gastos AS creditoGastos, periodo, tipo, ativo FROM planos WHERE user_id = :userId ORDER BY nome ASC", { userId }),
      queryRows<ServidorRow>("SELECT id, nome, valor_cred AS valorCred, sessao, url_renovacao AS urlRenovacao FROM servidores WHERE user_id = :userId ORDER BY nome ASC", { userId }),
      queryRows<MensagemRow>("SELECT id, titulo, mensagem, media_tipo AS mediaTipo, media_path AS mediaPath FROM mensagens WHERE user_id = :userId ORDER BY titulo ASC", { userId }),
      queryRows<DispositivoNomeRow>("SELECT nome FROM dispositivos WHERE user_id = :userId AND status = 'Ativo' ORDER BY nome ASC", { userId }),
      queryRows<DispositivoNomeRow>("SELECT nome FROM aplicativos WHERE user_id = :userId AND status = 'Ativo' ORDER BY nome ASC", { userId }),
      queryRows<RowDataPacket & { nome: string; sessao: string }>("SELECT nome, sessao FROM whatsapp_devices WHERE user_id = :userId ORDER BY principal DESC, id ASC", { userId }),
    ]);
    const dispositivos = dispositivosRows.map((d) => d.nome);
    const aplicativos = aplicativosRows.map((a) => a.nome);
    const whatsappDevices = whatsappDevicesRows.map((d) => ({ nome: d.nome, sessao: d.sessao }));
    const renovacoesPendentes = await listarRenovacoesPendentes(userId);
    res.render("pages/clientes", {
      title: verArquivados ? "Clientes arquivados" : "Clientes",
      renovacoesPendentes,
      subtitle: verArquivados ? "Clientes que você arquivou" : "Gerencie todos os seus clientes",
      clientes, planos, servidores, mensagens, dispositivos, aplicativos, whatsappDevices, verArquivados,
      noticeSuccess: req.flash("modal-success"),
      noticeError: req.flash("modal-error"),
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
      // Dedup server-side: se ja existe uma "Renovacao" pra esse cliente nos
      // ultimos 30 segundos, considera duplicata (double-click, retry de rede,
      // botao fora do form que escapou do anti-double-click do front).
      // Idempotente: devolve sucesso sem reprocessar — nao consome credito
      // extra, nao cria transacao duplicada, nao re-envia WhatsApp.
      const dup = await queryOne<RowDataPacket & { id: number }>(
        `SELECT id FROM transacoes
          WHERE user_id = :userId AND cliente_id = :id AND descricao = 'Renovação'
            AND created_at >= DATE_SUB(NOW(), INTERVAL 30 SECOND)
          ORDER BY id DESC LIMIT 1`,
        { userId, id },
      );
      if (dup) {
        req.flash("modal-success", "Pagamento ja registrado.");
        return res.redirect("/clientes");
      }

      const vencimento = normalizeDateInput(req.body.vencimento);
      const pagoEm = normalizeDateInput(req.body.pago_em);
      if (!vencimento || (String(req.body.pago_em ?? "").trim() && !pagoEm)) {
        req.flash("modal-error", "Data inválida. Use dd/mm/aaaa.");
        return res.redirect("/clientes");
      }
      const plano = String(req.body.plano ?? "").trim();
      const servidor = String(req.body.servidor ?? "").trim();
      if (!plano || !servidor) {
        req.flash("modal-error", "Este cliente está sem plano e/ou servidor. Edite o cliente para preencher esses campos antes de renovar.");
        return res.redirect("/clientes");
      }
      const valor = toNumber(req.body.valor);
      // Se o usuário não preencheu "valor pago", assume = valor da venda.
      const valorPago = req.body.valor_pago !== undefined && String(req.body.valor_pago).trim()
        ? toNumber(req.body.valor_pago) : valor;
      const telas = Number(req.body.telas);
      const creditosGastos = Number(req.body.creditos_gastos);
      // Consumo = telas × períodos renovados × créditos configurados no plano.
      const planoRenovacao = await queryOne<PlanoRow>(
        "SELECT credito_gastos AS creditoGastos FROM planos WHERE user_id = :userId AND nome = :nome LIMIT 1",
        { userId, nome: plano },
      );
      if (!planoRenovacao) throw new CreditosError("Plano não encontrado. Selecione um plano cadastrado para renovar.");
      const consumo = consumoRenovacao(telas, creditosGastos, Number(planoRenovacao?.creditoGastos) || 1);
      const telasN = telas;

      // Custo automático = valor_cred do servidor × (telas × créditos).
      // `servidorResolvido` cobre o caso onde o cliente ficou com nome antigo (ex.
      // "UNITV") depois que o catálogo virou "UNITV 30 DIAS" — busca prefix match
      // e, se único, adota como o nome canônico daqui pra frente.
      let custoPagamento = toNumber(req.body.custo_pagamento);
      let servidorResolvido = servidor;
      if (servidor) {
        const srv = await resolverServidorDoCliente(userId, servidor);
        if (srv) {
          servidorResolvido = srv.nome;
          const consumoCalc = consumo > 0 ? consumo : telasN; // fallback antigo: telas
          if (!custoPagamento && srv.valorCred) custoPagamento = Number((Number(srv.valorCred) * consumoCalc).toFixed(2));
        }
      }

      const saldo = await withTransaction(async (conn) => {
        const [clientes] = await conn.query<RowDataPacket[]>(
          "SELECT id FROM clientes WHERE id = :id AND user_id = :userId FOR UPDATE", { id, userId });
        if (!clientes.length) throw new CreditosError("Cliente não encontrado.");
        const [duplicados] = await conn.query<RowDataPacket[]>(
          `SELECT id FROM transacoes WHERE user_id = :userId AND cliente_id = :id
             AND descricao = 'Renovação' AND created_at >= DATE_SUB(NOW(), INTERVAL 30 SECOND)`, { id, userId });
        if (duplicados.length) return null;
        const saldo = await debitarCreditos(conn, userId, servidorResolvido, consumo);
        // Empty-string check feito no JS (não no SQL com NULLIF). Antes, comparar
        // o valor mascarado pelo placeholder com a string literal '' disparava
        // "Illegal mix of collations" no MySQL quando a sessão usava utf8mb4_general_ci
        // mas a coluna está em utf8mb4_unicode_ci.
        await conn.execute(
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
            valor: Number((valor / creditosGastos).toFixed(2)), telas, creditosGastos, custoPagamento,
            observacaoPagamento: toNullableString(req.body.observacao_pagamento),
            horaVencimentoOrNull: toNullableString(req.body.hora_vencimento),
          },
        );
        // Registra a renovação na aba Transações.
        const [cliRows] = await conn.query<ClienteTxRow[]>(
          "SELECT nome, plano, servidor, telas, valor_pago AS valorPago, custo_pagamento AS custoPagamento, forma_pagamento AS formaPagamento FROM clientes WHERE id = :id AND user_id = :userId LIMIT 1",
          { id, userId },
        );
        const cliTx = cliRows[0];
        if (cliTx) {
          await registrarTransacaoCliente({
            userId, clienteId: id, clienteNome: cliTx.nome, descricao: "Renovação",
            data: pagoEm || appTodayIso(),
            formaPagamento: cliTx.formaPagamento, plano: cliTx.plano, servidor: cliTx.servidor,
            // creditos na transação = consumo real do servidor (telas × períodos).
            telas: Number(cliTx.telas) || 1, creditos: consumo > 0 ? consumo : creditosGastos,
            custo: Number(cliTx.custoPagamento) || 0, valorVenda: Number(cliTx.valorPago) || 0,
          }, conn);
        }
        return saldo;
      });
      if (!saldo) {
        req.flash("modal-success", "Pagamento já registrado.");
        return res.redirect("/clientes");
      }
      await verificarCreditosServidor(userId, servidorResolvido, saldo.antes, saldo.depois);
      // Integração Sigma: se o cliente estiver vinculado (sigma_customer_id) e
      // houver integração Sigma ativa + plano mapeado (sigma_package_id), renova
      // também no painel externo. Falha aqui NÃO derruba a renovação local —
      // só avisa (o painel pode estar bloqueado por Cloudflare, senha errada, etc).
      let sigmaOk = false;
      try {
        const cliMap = await queryOne<RowDataPacket & { sigmaCustomerId: string | null }>(
          "SELECT sigma_customer_id AS sigmaCustomerId FROM clientes WHERE id = :id AND user_id = :userId LIMIT 1",
          { id, userId },
        );
        const customerId = String(cliMap?.sigmaCustomerId ?? "").trim();
        if (customerId) {
          const planoMap = await queryOne<RowDataPacket & { sigmaPackageId: string | null; sigmaConnections: number }>(
            "SELECT sigma_package_id AS sigmaPackageId, sigma_connections AS sigmaConnections FROM planos WHERE nome = :nome AND user_id = :userId LIMIT 1",
            { nome: plano, userId },
          );
          const packageId = String(planoMap?.sigmaPackageId ?? "").trim();
          const integ = await queryOne<RowDataPacket & { apiUrl: string; username: string; senhaEnc: string | null }>(
            "SELECT api_url AS apiUrl, username, senha_enc AS senhaEnc FROM integracoes WHERE user_id = :userId AND tipo = 'sigma' AND status = 'ativo' ORDER BY id ASC LIMIT 1",
            { userId },
          );
          if (packageId && integ) {
            const r = await sigmaLoginAndRenew(
              { apiUrl: integ.apiUrl, username: integ.username, password: decryptSecret(String(integ.senhaEnc ?? "")) },
              customerId, packageId, Number(planoMap?.sigmaConnections) || 1,
            );
            if (r.ok) sigmaOk = true;
            else req.flash("modal-error", `Renovado no gestor, mas falhou no painel Sigma: ${r.error}`);
          } else if (!integ) {
            req.flash("modal-error", "Cliente vinculado ao Sigma, mas não há integração Sigma ativa (veja Integrações).");
          } else {
            req.flash("modal-error", "Cliente vinculado ao Sigma, mas o plano não tem package_id (edite o Plano).");
          }
        }
      } catch (e) {
        req.flash("modal-error", `Erro ao renovar no painel Sigma: ${e instanceof Error ? e.message : String(e)}`);
      }
      req.flash("modal-success", sigmaOk ? "Pagamento registrado e renovado no painel Sigma. ✅" : "Pagamento registrado.");
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
            req.flash("modal-error", "Pagamento salvo, mas você não tem dispositivo WhatsApp cadastrado — cadastre em WhatsApp antes de enviar mensagens.");
          } else {
            const result = await enviarMensagemModelo(sessao, cliente, mensagem, undefined, await getPixConfig(userId));
            if (result.ok) {
              req.flash("modal-success", "Pagamento salvo e mensagem enviada pelo WhatsApp.");
            } else {
              req.flash("modal-error", `Pagamento salvo, mas não foi possível enviar a mensagem: ${result.error || "erro desconhecido"}`);
            }
          }
        } else {
          req.flash("modal-error", "Pagamento salvo, mas a mensagem escolhida não foi encontrada.");
        }
      }
      return res.redirect("/clientes");
    }

    if (action === "send_whatsapp") {
      const sessaoEscolhida = String(req.body.dispositivo ?? "").trim();
      const sessao = sessaoEscolhida || await sessaoWhatsappPrincipal(userId);
      if (!sessao) {
        req.flash("modal-error", "Cadastre um dispositivo em WhatsApp antes de enviar mensagens.");
        return res.redirect("/clientes");
      }
      const templateId = Number(req.body.mensagem_id);
      const mediaTipo = String(req.body.media_tipo ?? "").trim().toLowerCase();
      const mediaUrl = String(req.body.media_url ?? "").trim();
      let texto = String(req.body.mensagem_texto ?? "").trim();

      const cliente = (await queryRows<ClienteRow>("SELECT * FROM clientes WHERE id = :id AND user_id = :userId LIMIT 1", { id, userId }))[0];
      if (!cliente) {
        req.flash("modal-error", "Cliente não encontrado.");
        return res.redirect("/clientes");
      }
      // Sem texto digitado, mas com template escolhido: usa o texto do template.
      if (!texto && templateId) {
        const tpl = (await queryRows<MensagemRow>("SELECT mensagem FROM mensagens WHERE id = :mensagemId AND user_id = :userId LIMIT 1", { mensagemId: templateId, userId }))[0];
        texto = String(tpl?.mensagem ?? "").trim();
      }
      if (!texto && !mediaUrl) {
        req.flash("modal-error", "Digite uma mensagem ou anexe uma mídia.");
        return res.redirect("/clientes");
      }

      const result = await enviarMensagemModelo(sessao, cliente, {
        mensagem: texto,
        mediaTipo: mediaUrl ? (mediaTipo || "image") : null,
        mediaPath: mediaUrl || null,
      }, undefined, await getPixConfig(userId));
      if (result.ok) {
        req.flash("modal-success", `Mensagem enviada para ${cliente.nome}.`);
      } else {
        req.flash("modal-error", `Não foi possível enviar para ${cliente.nome}: ${result.error || "erro desconhecido"}`);
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
      sigmaCustomerId: string | null;
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
      // O form tem UM campo de ID do painel; o schema tem duas colunas (id_painel
      // e sigma_customer_id) por histórico, guardando a mesma informação. Espelha
      // aqui: id_painel alimenta a listagem, sigmaCustomerId é o que a renovação
      // no painel Sigma consulta.
      sigmaCustomerId: toNullableString(req.body.id_painel),
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
      // Pelo mesmo motivo `enviar_boas_vindas` ficou FORA deste UPDATE: é um flag de
      // cadastro (só lido ao criar, pra disparar o template) e sumiu do form de edição —
      // mantê-lo aqui zeraria a coluna do cliente a cada vez que ele fosse editado.
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
             telefone_secundario = :telefoneSecundario, observacoes = :observacoes, data_inicio = :dataInicio,
             hora_vencimento = :horaVencimento,
             pontos_fidelidade = :pontosFidelidade,
             dispositivo = :dispositivo, aplicativo = :aplicativo,
             sigma_customer_id = :sigmaCustomerId
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
      // Dedup anti-duplo-submit (defesa em profundidade, além da trava de front):
      // se um cliente com o MESMO telefone foi criado por este usuário nos últimos
      // 15s, trata como reenvio duplicado — não cria de novo, não consome crédito,
      // não dispara a mensagem de boas-vindas 2×. Mesma ideia da dedup da renovação.
      const dupCliente = await queryOne<RowDataPacket & { id: number }>(
        `SELECT id FROM clientes
          WHERE user_id = :userId AND telefone = :telefone
            AND created_at >= DATE_SUB(NOW(), INTERVAL 15 SECOND)
          ORDER BY id DESC LIMIT 1`,
        { userId, telefone: data.telefone },
      );
      if (dupCliente) {
        req.flash("success", "Cliente criado.");
        return res.redirect("/clientes");
      }
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
      // Transação: INSERT cliente + UPDATE saldo + INSERT transação são atômicos.
      // Antes, se caísse entre INSERT cliente e INSERT transação, o cliente
      // ficava sem registro de pagamento (relatório financeiro desatualizado).
      const consumo = data.creditosGastos > 0 ? data.creditosGastos : toNumber(data.telas, 1);
      // Gera token único pro link público de pagamento já no cadastro — assim o
      // placeholder {link_pagamento} dos templates funciona desde a 1ª mensagem.
      (data as Record<string, unknown>).pagamentoToken = crypto.randomBytes(16).toString("hex");
      await withTransaction(async (conn) => {
        const [novo] = await conn.execute<ResultSetHeader>(
          `INSERT INTO clientes (user_id, nome, user, telefone, vencimento, plano, valor, status, servidor, telas,
               creditos_gastos, pago_em, valor_pago, forma_pagamento, custo_pagamento, observacao_pagamento,
               senha, id_painel, email, captacao, aniversario, link_m3u, time_cliente, telefone_secundario,
               observacoes, data_inicio, hora_vencimento, pontos_fidelidade,
               enviar_boas_vindas, dispositivo, aplicativo, sigma_customer_id, pagamento_token)
           VALUES (:userId, :nome, :user, :telefone, :vencimento, :plano, :valor, :status, :servidor, :telas,
               :creditosGastos, :pagoEm, :valorPago, :formaPagamento, :custoPagamento, :observacaoPagamento,
               :senha, :idPainel, :email, :captacao, :aniversario, :linkM3u, :timeCliente, :telefoneSecundario,
               :observacoes, :dataInicio, :horaVencimento, :pontosFidelidade,
               :enviarBoasVindas, :dispositivo, :aplicativo, :sigmaCustomerId, :pagamentoToken)`, data,
        );
        // Consome os créditos (nº de telas) do saldo do servidor escolhido.
        if (registrarPagamento && consumo > 0 && data.servidor) {
          await conn.execute(
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
          }, conn);
        }
      });
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
            const send = await enviarMensagemModelo(sessao, clienteCriado, tpl, undefined, await getPixConfig(userId)).catch((error) => ({ ok: false, error: error instanceof Error ? error.message : String(error) }));
            if (!send.ok) req.flash("error", `Cliente criado, mas não enviei a mensagem de boas-vindas: ${send.error || "erro desconhecido"}.`);
          } else {
            req.flash("error", "Cliente criado, mas o template de boas-vindas selecionado não foi encontrado.");
          }
        }
      }
      req.flash("success", "Cliente criado.");
    }
    return res.redirect("/clientes");
  } catch (error) {
    if (error instanceof CreditosError) {
      req.flash("modal-error", error.message);
      return res.redirect("/clientes");
    }
    next(error);
  }
});

import crypto from "node:crypto";
import { Router } from "express";
import rateLimit from "express-rate-limit";
import type { RowDataPacket } from "mysql2";
import { execute, queryOne } from "../db/mysql.js";
import { env } from "../config/env.js";
import {
  configDoProvider, escolherProvedor, getProvider, normalizeStatus,
  type ProviderName,
} from "../services/paymentProvider.js";
import { formatMoney, formatDateBr } from "../services/format.js";
import { registrarPagamentoPendente } from "../services/renovacoesPendentes.js";
import { enviarConfirmacaoPix } from "../services/mensagemPix.js";
import { tokenPagamentoOriginal } from "../services/linkPagamentoUrl.js";
import { opcoesRenovacao, type PlanoRenovacao } from "../services/renovacaoOpcoes.js";

interface ClienteRow extends RowDataPacket {
  id: number;
  userId: number;
  nome: string;
  telefone: string;
  plano: string;
  valor: number;
  vencimento: string;
  pagamentoToken: string | null;
}

interface PagamentoRow extends RowDataPacket {
  id: number;
  userId: number;
  clienteId: number;
  valor: number;
  provider: string;
  mpPaymentId: string | null;
  mpQrText: string | null;
  mpQrBase64: string | null;
  status: string;
  userNotificado: number;
}

export const pagamentoRouter = Router();
pagamentoRouter.get("/r/:alias", rateLimit({ windowMs: 60000, limit: 60, standardHeaders: "draft-7", legacyHeaders: false }), async (req, res, next) => {
  res.set("Cache-Control", "no-store");
  res.set("Referrer-Policy", "no-referrer");
  try {
    const alias = String(req.params.alias);
    const row = /^[A-Za-z0-9_-]{16}$/.test(alias) ? await queryOne<RowDataPacket>("SELECT id FROM clientes WHERE pagamento_curto = :alias AND arquivado = 0 AND portal_bloqueado = 0 LIMIT 1", { alias }) : null;
    if (!row) return res.status(404).render("pages/pagar-erro", { layout: false, title: "Link inválido", motivo: "Link de pagamento inválido ou indisponível." });
    return res.redirect(302, `/area-cliente/login?acesso=${encodeURIComponent(alias)}`);
  } catch (error) { next(error); }
});
pagamentoRouter.use(["/pagar", "/p"], (_req, res, next) => {
  res.set("Cache-Control", "no-store");
  res.set("Referrer-Policy", "no-referrer");
  next();
});

async function clienteByToken(token: string): Promise<ClienteRow | null> {
  if (!token || token.length < 16) return null;
  return queryOne<ClienteRow>(
    `SELECT id, user_id AS userId, nome, user, telas, hora_vencimento AS horaVencimento, telefone, plano, valor, vencimento,
            pagamento_token AS pagamentoToken
       FROM clientes
      WHERE pagamento_token = :token AND arquivado = 0
      LIMIT 1`,
    { token },
  );
}

async function planoDoCliente(cliente: ClienteRow) {
  return queryOne<RowDataPacket & PlanoRenovacao>(
    "SELECT periodo, tipo, credito_gastos AS creditoGastos FROM planos WHERE user_id = :userId AND nome = :nome LIMIT 1",
    { userId: cliente.userId, nome: cliente.plano },
  );
}

// Página pública: mostra dados do cliente + valor + botão pra gerar PIX.
pagamentoRouter.get(["/pagar/:token", "/p/:token"], async (req, res, next) => {
  try {
    const token = String(req.params.token);
    const cliente = await clienteByToken(req.path.startsWith('/p/') ? tokenPagamentoOriginal(token) : token);
    if (!cliente) return res.status(404).render("pages/pagar-erro", { layout: false, title: "Link inválido", motivo: "Link de pagamento inválido ou expirado." });

    const provider = await escolherProvedor(cliente.userId);
    if (!provider) {
      return res.status(503).render("pages/pagar-erro", { layout: false, title: "Indisponível", motivo: "Pagamento online ainda não foi configurado pelo seu provedor." });
    }

    const plano = await planoDoCliente(cliente);
    const renovacaoDados = JSON.stringify(plano || { periodo: 30, tipo: 'Dias', creditoGastos: 1 });
    const opcoes = opcoesRenovacao(plano, Number(cliente.valor));
    const periodos = Number(req.query.periodos ?? 1);
    const selecionada = opcoes.find(opcao => opcao.periodos === periodos) || opcoes[0];
    const pendente = await queryOne<PagamentoRow>(
      `SELECT id, user_id AS userId, cliente_id AS clienteId, valor, provider,
              mp_payment_id AS mpPaymentId, mp_qr_text AS mpQrText,
              mp_qr_base64 AS mpQrBase64, status, user_notificado AS userNotificado
         FROM pagamentos
        WHERE cliente_id = :clienteId AND status = 'pending' AND valor = :valor AND provider = :provider
          AND renovacao_periodos = :periodos
          AND renovacao_dados = :renovacaoDados
          AND created_at > DATE_SUB(NOW(), INTERVAL 30 MINUTE)
        ORDER BY id DESC LIMIT 1`,
      { clienteId: cliente.id, valor: selecionada.valor, provider: provider.provider, periodos: selecionada.periodos, renovacaoDados },
    );

    res.render("pages/pagar", {
      layout: false,
      title: "Pagamento",
      cliente,
      pagamento: pendente,
      valorFormatado: formatMoney(selecionada.valor),
      opcoesRenovacao: opcoes, periodosSelecionados: selecionada.periodos,
      vencimentoFormatado: formatDateBr(cliente.vencimento),
    });
  } catch (error) { next(error); }
});

// Rate limit no endpoint publico que gera PIX: 10 criacoes por IP a cada 5min.
// Sem isso, alguem com um link valido poderia martear a API do provedor (MP)
// e criar carga/custo na conta do dono. O reuso de pendente (30min) ja ajuda,
// mas trocar de cliente/token contornava — o limite por IP fecha o furo.
const criarPixRateLimit = rateLimit({
  windowMs: 5 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { ok: false, error: "Muitas tentativas. Aguarde alguns minutos e tente de novo." },
});

// Cria o pagamento PIX usando o provedor escolhido do user.
pagamentoRouter.post("/pagar/:token/criar", criarPixRateLimit, async (req, res) => {
  try {
    const cliente = await clienteByToken(String(req.params.token));
    if (!cliente) return res.status(404).json({ ok: false, error: "Link inválido." });

    const providerCfg = await escolherProvedor(cliente.userId);
    if (!providerCfg) return res.status(503).json({ ok: false, error: "Pagamento não configurado." });
    const provider = getProvider(providerCfg.provider);
    if (!provider) return res.status(503).json({ ok: false, error: "Provedor não suportado." });

    if (!cliente.valor || cliente.valor <= 0) {
      return res.status(400).json({ ok: false, error: "Valor do plano não definido." });
    }
    const plano = await planoDoCliente(cliente);
    const periodos = Number(req.body?.periodos ?? 1);
    const opcao = opcoesRenovacao(plano, Number(cliente.valor)).find(opcao => opcao.periodos === periodos);
    if (!opcao) return res.status(400).json({ ok: false, error: "Escolha uma duração de renovação válida." });
    const valor = opcao.valor;
    const renovacaoDados = JSON.stringify(plano || { periodo: 30, tipo: 'Dias', creditoGastos: 1 });

    // Reusa pagamento pendente da mesma sessão+provedor.
    const existente = await queryOne<PagamentoRow>(
      `SELECT id, provider, mp_payment_id AS mpPaymentId, mp_qr_text AS mpQrText, mp_qr_base64 AS mpQrBase64, status
         FROM pagamentos
        WHERE cliente_id = :clienteId AND status = 'pending'
          AND provider = :provider AND valor = :valor
          AND renovacao_periodos = :periodos AND renovacao_dados = :renovacaoDados
          AND created_at > DATE_SUB(NOW(), INTERVAL 30 MINUTE)
        ORDER BY id DESC LIMIT 1`,
      { clienteId: cliente.id, provider: providerCfg.provider, valor, periodos, renovacaoDados },
    );
    if (existente?.mpQrText) {
      return res.json({
        ok: true, pagamentoId: existente.id, mpPaymentId: existente.mpPaymentId,
        qrText: existente.mpQrText, qrBase64: existente.mpQrBase64, status: existente.status,
        provider: providerCfg.provider,
      });
    }

    const notificationUrl = `${env.appUrl.replace(/\/$/, "")}/webhook/${providerCfg.provider}`;
    const externalReference = `cliente=${cliente.id}`;

    const pix = await provider.criarPix(providerCfg.credenciais, {
      valor,
      descricao: `${cliente.plano || "Plano"} — ${cliente.nome} — ${opcao.label}`.slice(0, 250),
      payerNome: cliente.nome,
      notificationUrl,
      externalReference,
    });

    const insert = await execute(
      `INSERT INTO pagamentos
        (user_id, cliente_id, valor, descricao, provider, mp_payment_id, mp_qr_text, mp_qr_base64, status, expirado_em, renovacao_periodos, renovacao_dados)
       VALUES (:userId, :clienteId, :valor, :descricao, :provider, :mpId, :qrText, :qrBase64, :status, :expira, :periodos, :renovacaoDados)`,
      {
        userId: cliente.userId,
        clienteId: cliente.id,
        valor, periodos, renovacaoDados,
        descricao: `Renovação — ${cliente.plano || "plano"} — ${opcao.label}`,
        provider: providerCfg.provider,
        mpId: pix.id,
        qrText: pix.qrText,
        qrBase64: pix.qrBase64,
        status: normalizeStatus(pix.status) === "approved" ? "approved" : "pending",
        expira: pix.expiresAt ? new Date(pix.expiresAt).toISOString().slice(0, 19).replace("T", " ") : null,
      },
    );

    res.json({
      ok: true, pagamentoId: insert.insertId, mpPaymentId: pix.id,
      qrText: pix.qrText, qrBase64: pix.qrBase64, status: pix.status,
      provider: providerCfg.provider,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[pagar/criar]", msg);
    res.status(500).json({ ok: false, error: msg });
  }
});

pagamentoRouter.get("/pagar/:token/status/:pagamentoId", async (req, res) => {
  try {
    const cliente = await clienteByToken(String(req.params.token));
    if (!cliente) return res.status(404).json({ ok: false, error: "Link inválido." });
    const row = await queryOne<PagamentoRow>(
      `SELECT id, status FROM pagamentos WHERE id = :id AND cliente_id = :clienteId LIMIT 1`,
      { id: Number(req.params.pagamentoId), clienteId: cliente.id },
    );
    if (!row) return res.status(404).json({ ok: false, error: "Pagamento não encontrado." });
    res.json({ ok: true, status: row.status });
  } catch (error) {
    res.status(500).json({ ok: false, error: error instanceof Error ? error.message : String(error) });
  }
});

// ============================================================
// Webhooks
// ============================================================

// Handler comum: dado um payment_id no nosso banco, consulta o provedor de volta
// (defesa contra spoofing) e atualiza status. Se aprovado, dispara notificação.
async function processarPagamento(provider: ProviderName, providerPaymentId: string) {
  const pagamento = await queryOne<PagamentoRow>(
    `SELECT id, user_id AS userId, cliente_id AS clienteId, valor, provider, status,
            user_notificado AS userNotificado
       FROM pagamentos WHERE mp_payment_id = :mpId AND provider = :provider LIMIT 1`,
    { mpId: providerPaymentId, provider },
  );
  if (!pagamento) return;

  const cfg = await configDoProvider(pagamento.userId, provider);
  if (!cfg) return;
  const impl = getProvider(provider);
  if (!impl) return;

  const status = await impl.consultarPagamento(cfg.credenciais, providerPaymentId);
  const norm = normalizeStatus(status.status);

  await execute(
    `UPDATE pagamentos
        SET status = :status,
            pago_em = :pagoEm
      WHERE id = :id`,
    {
      id: pagamento.id,
      status: norm,
      pagoEm: norm === "approved" && status.pagoEm
        ? new Date(status.pagoEm).toISOString().slice(0, 19).replace("T", " ")
        : null,
    },
  );

  if (norm === "approved" && !pagamento.userNotificado) {
    await notificarPagamento(pagamento.id, pagamento.userId, pagamento.clienteId, Number(status.amount || pagamento.valor));
  }
}

// Mercado Pago: aceita Orders API (type=order, data.id = orderId) e legacy
// (type=payment) — assim funciona pra contas migradas e ainda nao migradas.
pagamentoRouter.post("/webhook/mercadopago", async (req, res) => {
  try {
    const body = req.body as { type?: string; action?: string; data?: { id?: string | number } };
    const tipo = String(body?.type ?? body?.action ?? "");
    const mpId = String(body?.data?.id ?? "");
    if (mpId && /^(order|payment)/i.test(tipo)) await processarPagamento("mercadopago", mpId);
  } catch (error) { console.error("[webhook/mp]", error); }
  res.sendStatus(200);
});

// Asaas: { event: "PAYMENT_RECEIVED", payment: { id, status, ... } }
pagamentoRouter.post("/webhook/asaas", async (req, res) => {
  try {
    const body = req.body as { event?: string; payment?: { id?: string } };
    const id = String(body?.payment?.id ?? "");
    if (id) await processarPagamento("asaas", id);
  } catch (error) { console.error("[webhook/asaas]", error); }
  res.sendStatus(200);
});

// OpenPix: { event: "OPENPIX:CHARGE_COMPLETED" | "OPENPIX:CHARGE_NEW", charge: { correlationID } }
pagamentoRouter.post("/webhook/openpix", async (req, res) => {
  try {
    const body = req.body as { event?: string; charge?: { correlationID?: string }; pix?: { charge?: { correlationID?: string } } };
    const id = String(body?.charge?.correlationID ?? body?.pix?.charge?.correlationID ?? "");
    if (id) await processarPagamento("openpix", id);
  } catch (error) { console.error("[webhook/openpix]", error); }
  res.sendStatus(200);
});

// PagBank: manda notificação com { id: "<order_id>" } ou { charges: [...] }. Em
// alguns formatos vem só um ID que a gente consulta via GET /orders/:id.
pagamentoRouter.post("/webhook/pagbank", async (req, res) => {
  try {
    const body = req.body as { id?: string; charges?: Array<{ id?: string }>; reference_id?: string };
    const id = String(body?.id ?? body?.charges?.[0]?.id ?? "");
    if (id) await processarPagamento("pagbank", id);
  } catch (error) { console.error("[webhook/pagbank]", error); }
  res.sendStatus(200);
});

// Pagar.me: { type: "charge.paid"|"charge.refunded"|..., data: { id: "ch_..." } }
pagamentoRouter.post("/webhook/pagarme", async (req, res) => {
  try {
    const body = req.body as { type?: string; data?: { id?: string } };
    const id = String(body?.data?.id ?? "");
    if (id) await processarPagamento("pagarme", id);
  } catch (error) { console.error("[webhook/pagarme]", error); }
  res.sendStatus(200);
});

async function notificarPagamento(pagamentoId: number, userId: number, clienteId: number, _valor: number) {
  const registrado = await registrarPagamentoPendente(pagamentoId, userId);
  if (!registrado) return;
  await enviarConfirmacaoPix(userId, clienteId).catch(error => console.warn("[confirmacaoPix] falhou:", error));
}

// ============================================================
// Helper exportado: garante token e retorna a URL pública do link.
// ============================================================
export { urlPagamentoDoCliente } from "../services/linkCliente.js";

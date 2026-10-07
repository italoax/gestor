import { fetchWithTimeout } from './http.js';
import crypto from 'node:crypto';
import { execute, queryOne } from '../db/mysql.js';
import { env } from '../config/env.js';
import { appTodayIso } from './dates.js';
// Servico de assinatura do gestor (SaaS billing). Usa Mercado Pago master
// (MP_MASTER_ACCESS_TOKEN do .env). Todos os users pagam pra essa conta.
const MP_BASE = 'https://api.mercadopago.com';
const PIX_VALIDADE_DIAS = 30;
function pixDaOrder(order) {
  const lista = order?.transactions?.payments ?? [];
  for (const p of lista) {
    if (p?.payment_method?.qr_code && p?.payment_method?.qr_code_base64)
      return p;
  }
  return lista[0] ?? null;
}
export function isAssinaturaConfigurada() {
  return Boolean(env.mpMaster.accessToken);
}
export async function getPlanoById(planoId) {
  return queryOne(
    `SELECT id, nome, preco, descricao, dias_validade AS diasValidade,
            ativo, ordem
       FROM assinatura_planos
      WHERE id = :id AND ativo = 1 LIMIT 1`,
    { id: planoId },
  );
}
export const MESES_VALIDOS = [1, 3, 6, 12];
export function isMesesValido(n) {
  return MESES_VALIDOS.includes(n);
}
// Tabela de descontos por periodo. Calculada do server pra evitar adulteracao
// no front. Multiplicador efetivo aplicado ao subtotal (preco * meses).
const DESCONTO_POR_MESES = {
  1: 0,
  3: 0.05,
  6: 0.1,
  12: 0.2,
};
export function descontoPorMeses(meses) {
  return DESCONTO_POR_MESES[meses] ?? 0;
}
export function calcularValorComDesconto(precoBase, meses) {
  const subtotal = Number((Number(precoBase) * meses).toFixed(2));
  const percentual = descontoPorMeses(meses);
  const desconto = Number((subtotal * percentual).toFixed(2));
  const total = Number((subtotal - desconto).toFixed(2));
  return { subtotal, desconto, total, percentual };
}
/**
 * Cria um pagamento PIX na conta master do MP pra um user renovar a assinatura.
 * meses: 1, 3, 6 ou 12 — multiplica o valor base e os dias de validade.
 * Reusa pagamento pendente recente (ultimas 24h, mesmo user/plano/meses) pra
 * nao spammar o MP com novos QRs a cada refresh.
 */
export async function criarPixAssinatura(userId, plano, meses, userInfo) {
  if (!isAssinaturaConfigurada()) {
    throw new Error(
      'Assinatura nao configurada. Defina MP_MASTER_ACCESS_TOKEN no .env do servidor.',
    );
  }
  const { total: valor, percentual } = calcularValorComDesconto(
    Number(plano.preco),
    meses,
  );
  const dias = plano.diasValidade * meses;
  // Reusa pendente recente do mesmo periodo (valor identico = mesma intencao)
  const existente = await queryOne(
    `SELECT id, mp_payment_id AS mpPaymentId, mp_qr_text AS mpQrText, mp_qr_base64 AS mpQrBase64
       FROM assinatura_pagamentos
      WHERE user_id = :userId AND plano_id = :planoId AND status = 'pending'
        AND dias_validade = :dias AND valor = :valor
        AND created_at > DATE_SUB(NOW(), INTERVAL 24 HOUR)
      ORDER BY id DESC LIMIT 1`,
    { userId, planoId: plano.id, dias, valor },
  );
  if (existente?.mpQrText && existente?.mpQrBase64 && existente?.mpPaymentId) {
    return {
      pagamentoId: existente.id,
      qrText: existente.mpQrText,
      qrBase64: existente.mpQrBase64,
      mpPaymentId: existente.mpPaymentId,
      valor,
      dias,
    };
  }
  const expira = new Date(Date.now() + PIX_VALIDADE_DIAS * 24 * 60 * 60000)
    .toISOString()
    .replace('Z', '-03:00');
  const notificationUrl = `${env.appUrl.replace(/\/$/, '')}/webhook/assinatura`;
  const externalReference = `assinatura:user=${userId}:plano=${plano.id}:meses=${meses}`;
  const labelMeses = meses === 1 ? '1 mes' : `${meses} meses`;
  const sufixoDesconto =
    percentual > 0 ? ` ${Math.round(percentual * 100)}% OFF` : '';
  const valorStr = valor.toFixed(2);
  const body = {
    type: 'online',
    processing_mode: 'automatic',
    total_amount: valorStr,
    description: `ixstreaming - ${plano.nome} (${labelMeses})${sufixoDesconto}`,
    external_reference: externalReference,
    notification_url: notificationUrl,
    payer: {
      email: userInfo.email || `user${userId}@gestor.local`,
      first_name: userInfo.nome || 'Usuario',
    },
    transactions: {
      payments: [
        {
          amount: valorStr,
          payment_method: { id: 'pix', type: 'bank_transfer' },
          expiration_date: expira,
        },
      ],
    },
  };
  const r = await fetchWithTimeout(`${MP_BASE}/v1/orders`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.mpMaster.accessToken}`,
      'Content-Type': 'application/json',
      'X-Idempotency-Key': crypto.randomUUID(),
    },
    body: JSON.stringify(body),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(`MP: ${j.message || `HTTP ${r.status}`}`);
  const payment = pixDaOrder(j);
  const pm = payment?.payment_method;
  if (!pm?.qr_code || !pm?.qr_code_base64) {
    throw new Error(
      'Resposta da Order sem QR PIX. Confira se sua conta tem PIX habilitado.',
    );
  }
  const insert = await execute(
    `INSERT INTO assinatura_pagamentos
       (user_id, plano_id, valor, dias_validade, mp_payment_id, mp_qr_text, mp_qr_base64, status, expira_em)
     VALUES (:userId, :planoId, :valor, :dias, :mpId, :qrText, :qrBase64, 'pending', :expira)`,
    {
      userId,
      planoId: plano.id,
      valor,
      dias,
      mpId: String(j.id ?? ''),
      qrText: pm.qr_code,
      qrBase64: pm.qr_code_base64,
      expira: j.date_of_expiration
        ? new Date(j.date_of_expiration)
            .toISOString()
            .slice(0, 19)
            .replace('T', ' ')
        : null,
    },
  );
  return {
    pagamentoId: insert.insertId,
    qrText: pm.qr_code,
    qrBase64: pm.qr_code_base64,
    mpPaymentId: String(j.id ?? ''),
    valor,
    dias,
  };
}
/**
 * Consulta a Order no MP (defesa contra spoofing de webhook) e, se aprovado,
 * estende o vencimento do user em plano.dias_validade. Idempotente via flag aplicado.
 */
export async function processarWebhookAssinatura(orderId) {
  if (!isAssinaturaConfigurada()) return;
  const pagamento = await queryOne(
    `SELECT id, user_id AS userId, plano_id AS planoId, valor,
            dias_validade AS diasValidade, status, aplicado
       FROM assinatura_pagamentos
      WHERE mp_payment_id = :mpId LIMIT 1`,
    { mpId: orderId },
  );
  if (!pagamento) return;
  const r = await fetchWithTimeout(
    `${MP_BASE}/v1/orders/${encodeURIComponent(orderId)}`,
    {
      headers: { Authorization: `Bearer ${env.mpMaster.accessToken}` },
    },
  );
  const j = await r.json();
  if (!r.ok) {
    console.error('[assinatura] MP consulta falhou:', j.message);
    return;
  }
  const payment = pixDaOrder(j);
  const paymentStatus = String(
    payment?.status ?? j.status ?? 'unknown',
  ).toLowerCase();
  const aprovado =
    paymentStatus === 'approved' || paymentStatus === 'processed';
  await execute(
    `UPDATE assinatura_pagamentos
        SET status = :status,
            pago_em = :pagoEm
      WHERE id = :id`,
    {
      id: pagamento.id,
      status: aprovado ? 'approved' : paymentStatus,
      pagoEm:
        aprovado && payment?.date_approved
          ? new Date(payment.date_approved)
              .toISOString()
              .slice(0, 19)
              .replace('T', ' ')
          : null,
    },
  );
  if (!aprovado || pagamento.aplicado) return;
  // Idempotencia: tenta marcar como aplicado primeiro. Se affectedRows = 0,
  // outro processo ja aplicou esse mesmo pagamento.
  const claim = await execute(
    `UPDATE assinatura_pagamentos SET aplicado = 1 WHERE id = :id AND aplicado = 0`,
    { id: pagamento.id },
  );
  if (claim.affectedRows === 0) return;
  // Estende vencimento do user: max(hoje, venc atual) + dias_validade.
  // Se ja estiver com venc futuro, soma em cima (acumula tempo pago).
  await execute(
    `UPDATE users
        SET plano_id = :planoId,
            assinatura_vencimento = DATE_ADD(
              GREATEST(CURDATE(), COALESCE(assinatura_vencimento, CURDATE())),
              INTERVAL :dias DAY
            )
      WHERE id = :userId`,
    {
      userId: pagamento.userId,
      planoId: pagamento.planoId,
      dias: pagamento.diasValidade,
    },
  );
}
/**
 * Retorna o status da assinatura do user: vencimento, dias restantes, e se
 * deve bloquear. Admin (is_admin=1) sempre tem ativo=true.
 */
export async function getStatusAssinatura(userId) {
  const row = await queryOne(
    `SELECT is_admin AS isAdmin, plano_id AS planoId, assinatura_vencimento AS vencimento
       FROM users WHERE id = :userId LIMIT 1`,
    { userId },
  );
  if (!row) {
    return {
      vencimento: null,
      diasRestantes: null,
      ativo: false,
      bloqueado: true,
      planoAtual: null,
    };
  }
  if (row.isAdmin) {
    return {
      vencimento: null,
      diasRestantes: null,
      ativo: true,
      bloqueado: false,
      planoAtual: null,
    };
  }
  const vencIso = row.vencimento ? String(row.vencimento).slice(0, 10) : null;
  let diasRestantes = null;
  let ativo = false;
  if (vencIso) {
    const today = appTodayIso();
    const [vy, vm, vd] = vencIso.split('-').map(Number);
    const [ty, tm, td] = today.split('-').map(Number);
    const vencDate = new Date(vy, vm - 1, vd);
    const todayDate = new Date(ty, tm - 1, td);
    diasRestantes = Math.floor(
      (vencDate.getTime() - todayDate.getTime()) / (24 * 60 * 60000),
    );
    ativo = diasRestantes >= 0;
  }
  const planoAtual = row.planoId ? await getPlanoById(row.planoId) : null;
  return {
    vencimento: vencIso,
    diasRestantes,
    ativo,
    bloqueado: !ativo,
    planoAtual,
  };
}

import { Router } from 'express';
import { queryOne } from '../db/mysql.js';
import { formatMoney, formatDateBr } from '../services/format.js';
import {
  criarPixAssinatura,
  getPlanoById,
  getStatusAssinatura,
  isAssinaturaConfigurada,
  processarWebhookAssinatura,
  isMesesValido,
  MESES_VALIDOS,
  descontoPorMeses,
} from '../services/assinatura.js';
// Router publico — so o webhook do MP master. Tem que ficar antes do
// requireAuth no server.js pra MP conseguir notificar sem sessao.
export const assinaturaWebhookRouter = Router();
assinaturaWebhookRouter.post('/webhook/assinatura', async (req, res) => {
  try {
    const body = req.body;
    const tipo = String(body?.type ?? body?.action ?? '');
    const mpId = String(body?.data?.id ?? '');
    // Aceita eventos Orders API (type=order) e legacy (type=payment).
    if (mpId && /^(order|payment)/i.test(tipo))
      await processarWebhookAssinatura(mpId);
  } catch (error) {
    console.error('[webhook/assinatura]', error);
  }
  res.sendStatus(200);
});
export const meuPlanoRouter = Router();
meuPlanoRouter.get('/meu-plano', async (req, res, next) => {
  try {
    const userId = req.session.user.id;
    const status = await getStatusAssinatura(userId);
    // Apenas o primeiro plano ativo. O front oferece seletor de meses
    // (1/3/6/12) que multiplica valor e validade.
    const plano =
      await queryOne(`SELECT id, nome, preco, descricao, dias_validade AS diasValidade, ativo, ordem
         FROM assinatura_planos WHERE ativo = 1
        ORDER BY ordem ASC, id ASC LIMIT 1`);
    const mesesOpcoes = MESES_VALIDOS.map((m) => ({
      meses: m,
      desconto: descontoPorMeses(m),
      descontoLabel: Math.round(descontoPorMeses(m) * 100),
    }));
    res.render('pages/meu-plano', {
      title: 'Meu Plano',
      subtitle: 'Assinatura mensal do gestor',
      status,
      plano,
      mesesOpcoes,
      mpConfigurado: isAssinaturaConfigurada(),
      formatMoney,
      formatDateBr,
    });
  } catch (error) {
    next(error);
  }
});
// Gera PIX para o plano + numero de meses escolhido. AJAX JSON.
meuPlanoRouter.post('/meu-plano/renovar/:planoId/:meses', async (req, res) => {
  try {
    const userId = req.session.user.id;
    if (!isAssinaturaConfigurada()) {
      return res
        .status(503)
        .json({
          ok: false,
          error:
            'Sistema de assinatura ainda nao configurado pelo administrador.',
        });
    }
    const meses = Number(req.params.meses);
    if (!isMesesValido(meses)) {
      return res
        .status(400)
        .json({
          ok: false,
          error: 'Periodo invalido. Use 1, 3, 6 ou 12 meses.',
        });
    }
    const plano = await getPlanoById(Number(req.params.planoId));
    if (!plano)
      return res
        .status(404)
        .json({ ok: false, error: 'Plano nao encontrado.' });
    const user = await queryOne(
      `SELECT name, email FROM users WHERE id = :id LIMIT 1`,
      { id: userId },
    );
    if (!user)
      return res
        .status(404)
        .json({ ok: false, error: 'Usuario nao encontrado.' });
    const pix = await criarPixAssinatura(userId, plano, meses, {
      nome: user.name,
      email: user.email,
    });
    res.json({ ok: true, ...pix, planoNome: plano.nome, meses });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[meu-plano/renovar]', msg);
    res.status(500).json({ ok: false, error: msg });
  }
});
// Polling de status do pagamento.
meuPlanoRouter.get('/meu-plano/status/:pagamentoId', async (req, res) => {
  try {
    const userId = req.session.user.id;
    const row = await queryOne(
      `SELECT id, user_id AS userId, status, aplicado
         FROM assinatura_pagamentos WHERE id = :id AND user_id = :userId LIMIT 1`,
      { id: Number(req.params.pagamentoId), userId },
    );
    if (!row)
      return res
        .status(404)
        .json({ ok: false, error: 'Pagamento nao encontrado.' });
    res.json({ ok: true, status: row.status, aplicado: Boolean(row.aplicado) });
  } catch (error) {
    res
      .status(500)
      .json({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
  }
});

import { randomUUID } from 'node:crypto';
import { Decimal } from 'decimal.js';
import {
  authenticateWebhook,
  webhookSecurityFor,
} from '../security/paymentWebhooks.ts';
// Regras de pagamento independentes do transporte HTTP e de conexoes reais.
import { safeError } from '../security/safeError.ts';
export function createPaymentWorkflow({
  execute,
  queryOne,
  env,
  configDoProvider,
  escolherProvedor,
  getProvider,
  normalizeStatus,
  formatMoney,
  formatDateBr,
  registrarPagamentoPendente,
  enviarConfirmacaoPix,
  tokenPagamentoOriginal,
  escolhasRenovacao,
  queryRows = undefined,
  withTransaction = undefined,
  webhookSecurity = webhookSecurityFor,
}) {
  const json = (status, data) => ({ kind: 'json' as const, status, data });
  const view = (status, name, data) => ({
    kind: 'view' as const,
    status,
    view: name,
    data,
  });
  const redirect = (status, path) => ({
    kind: 'redirect' as const,
    status,
    path,
  });
  async function clienteByToken(token) {
    if (!token || token.length < 16) return null;
    return queryOne(
      `SELECT id, user_id AS userId, nome, user, telas, servidor, sigma_customer_id, plano_adicional, hora_vencimento AS horaVencimento, telefone, plano, valor, vencimento,
            pagamento_token AS pagamentoToken
       FROM clientes
      WHERE pagamento_token = :token AND arquivado = 0
      LIMIT 1`,
      { token },
    );
  }
  async function planosDoCliente(cliente) {
    return escolhasRenovacao(cliente, (nome) =>
      queryOne(
        'SELECT periodo, tipo, credito_gastos AS creditoGastos FROM planos WHERE user_id = :userId AND nome = :nome LIMIT 1',
        { userId: cliente.userId, nome },
      ),
    );
  }
  async function processarPagamento(
    provider,
    providerPaymentId,
    body,
    request,
  ) {
    if (!queryRows || !withTransaction) return { status: 503 };
    const candidates = await queryRows(
      `SELECT id, user_id AS userId, cliente_id AS clienteId, valor, provider, status,
       external_reference AS externalReference, user_notificado AS userNotificado
       FROM pagamentos WHERE mp_payment_id = :mpId AND provider = :provider LIMIT 2`,
      { mpId: providerPaymentId, provider },
    );
    if (candidates.length === 0) return { status: 200 };
    if (candidates.length !== 1) return { status: 409 };
    const pagamento = candidates[0];
    if (provider === 'pagarme') return { status: 503 };
    const security = webhookSecurity(pagamento.userId, provider);
    if (!security) return { status: 503 };
    if (!authenticateWebhook(provider, body, request, security))
      return { status: 401 };
    const cfg = await configDoProvider(pagamento.userId, provider);
    const impl = getProvider(provider);
    if (!cfg || !impl) return { status: 503 };
    const status = await impl.consultarPagamento(
      cfg.credenciais,
      providerPaymentId,
    );
    const norm = normalizeStatus(status.status);
    const expectedReference =
      pagamento.externalReference || `cliente=${pagamento.clienteId}`;
    if (
      String(status.id) !== providerPaymentId ||
      status.currency !== 'BRL' ||
      !new Decimal(status.amount).isFinite() ||
      !new Decimal(status.amount).equals(pagamento.valor) ||
      status.externalReference !== expectedReference
    )
      return { status: 422 };
    let approved = false;
    await withTransaction(async (connection) => {
      const [rows] = await connection.query(
        'SELECT p.status FROM pagamentos p JOIN clientes c ON c.id=p.cliente_id AND c.user_id=p.user_id WHERE p.id=:id AND p.user_id=:userId AND p.cliente_id=:clienteId AND p.provider=:provider AND p.mp_payment_id=:mpId FOR UPDATE',
        {
          id: pagamento.id,
          userId: pagamento.userId,
          clienteId: pagamento.clienteId,
          provider,
          mpId: providerPaymentId,
        },
      );
      if (rows.length !== 1) throw new Error('Pagamento indispon?vel.');
      approved = rows[0].status === 'approved';
      // Entrega atrasada n?o reabre nem reaplica uma transi??o financeira.
      const refund =
        rows[0].status === 'approved' &&
        ['refunded', 'charged_back'].includes(
          String(status.status).toLowerCase(),
        );
      if ((rows[0].status !== 'pending' && !refund) || norm === 'pending')
        return;
      await connection.execute(
        `UPDATE pagamentos SET status=:status, pago_em=:pagoEm
        WHERE id=:id AND user_id=:userId AND cliente_id=:clienteId AND provider=:provider AND mp_payment_id=:mpId`,
        {
          status: norm,
          pagoEm:
            norm === 'approved' && status.pagoEm
              ? new Date(status.pagoEm)
                  .toISOString()
                  .slice(0, 19)
                  .replace('T', ' ')
              : null,
          id: pagamento.id,
          userId: pagamento.userId,
          clienteId: pagamento.clienteId,
          provider,
          mpId: providerPaymentId,
        },
      );
      approved = norm === 'approved';
    });
    // A implementa??o existente reivindica a notifica??o sob FOR UPDATE, com
    // unicidade persistida; novas entregas recuperam falhas sem dupla renova??o.
    if (approved)
      await notificarPagamento(
        pagamento.id,
        pagamento.userId,
        pagamento.clienteId,
        Number(status.amount),
      );
    return { status: 200 };
  }
  async function notificarPagamento(pagamentoId, userId, clienteId, _valor) {
    const registrado = await registrarPagamentoPendente(pagamentoId, userId);
    if (!registrado) return;
    await enviarConfirmacaoPix(userId, clienteId).catch((error) =>
      console.warn('[confirmacaoPix] falhou:', safeError(error)),
    );
  }

  return {
    async alias(aliasValue) {
      try {
        const alias = String(aliasValue);
        const row = /^[A-Za-z0-9_-]{16}$/.test(alias)
          ? await queryOne(
              'SELECT id FROM clientes WHERE pagamento_curto = :alias AND arquivado = 0 AND portal_bloqueado = 0 LIMIT 1',
              { alias },
            )
          : null;
        if (!row)
          return view(404, 'pages/pagar-erro', {
            layout: false,
            title: 'Link inválido',
            motivo: 'Link de pagamento inválido ou indisponível.',
          });
        return redirect(
          302,
          `/area-cliente/login?acesso=${encodeURIComponent(alias)}`,
        );
      } catch (error) {
        throw error;
      }
    },
    async page(tokenValue, short, query) {
      try {
        const token = String(tokenValue);
        const cliente = await clienteByToken(
          short ? tokenPagamentoOriginal(token) : token,
        );
        if (!cliente)
          return view(404, 'pages/pagar-erro', {
            layout: false,
            title: 'Link inválido',
            motivo: 'Link de pagamento inválido ou expirado.',
          });
        const provider = await escolherProvedor(cliente.userId);
        if (!provider) {
          return view(503, 'pages/pagar-erro', {
            layout: false,
            title: 'Indisponível',
            motivo:
              'Pagamento online ainda não foi configurado pelo seu provedor.',
          });
        }
        const escolhas = await planosDoCliente(cliente);
        const grupo =
          escolhas.find((g) => g.selecao === query.selecao) || escolhas[0];
        const renovacaoDados = JSON.stringify(grupo.dados);
        const opcoes = grupo.opcoes;
        const periodos = Number(query.periodos ?? 1);
        const selecionada =
          opcoes.find((opcao) => opcao.periodos === periodos) || opcoes[0];
        const pendente = await queryOne(
          `SELECT id, user_id AS userId, cliente_id AS clienteId, valor, provider,
              mp_payment_id AS mpPaymentId, mp_qr_text AS mpQrText,
              mp_qr_base64 AS mpQrBase64, status, user_notificado AS userNotificado
         FROM pagamentos
        WHERE cliente_id = :clienteId AND user_id = :userId AND status = 'pending' AND valor = :valor AND provider = :provider
          AND renovacao_periodos = :periodos
          AND renovacao_dados = :renovacaoDados
          AND created_at > DATE_SUB(NOW(), INTERVAL 30 MINUTE)
        ORDER BY id DESC LIMIT 1`,
          {
            clienteId: cliente.id,
            userId: cliente.userId,
            valor: selecionada.valor,
            provider: provider.provider,
            periodos: selecionada.periodos,
            renovacaoDados,
          },
        );
        return view(200, 'pages/pagar', {
          layout: false,
          title: 'Pagamento',
          cliente,
          escolhas,
          selecao: grupo.selecao,
          pagamento: pendente,
          valorFormatado: formatMoney(selecionada.valor),
          opcoesRenovacao: opcoes,
          periodosSelecionados: selecionada.periodos,
          vencimentoFormatado: formatDateBr(cliente.vencimento),
        });
      } catch (error) {
        throw error;
      }
    },
    async create(tokenValue, body) {
      try {
        const cliente = await clienteByToken(String(tokenValue));
        if (!cliente) return json(404, { ok: false, error: 'Link inválido.' });
        const providerCfg = await escolherProvedor(cliente.userId);
        if (!providerCfg)
          return json(503, { ok: false, error: 'Pagamento não configurado.' });
        const provider = getProvider(providerCfg.provider);
        if (!provider)
          return json(503, { ok: false, error: 'Provedor não suportado.' });
        if (!cliente.valor || cliente.valor <= 0) {
          return json(400, {
            ok: false,
            error: 'Valor do plano não definido.',
          });
        }
        const escolhas = await planosDoCliente(cliente);
        const grupo =
          body?.selecao === undefined
            ? escolhas[0]
            : escolhas.find((g) => g.selecao === body.selecao);
        if (!grupo)
          return json(400, {
            ok: false,
            error: 'Selecione os planos que deseja renovar.',
          });
        const periodos = Number(body?.periodos ?? 1);
        const opcao = grupo.opcoes.find((opcao) => opcao.periodos === periodos);
        if (!opcao)
          return json(400, {
            ok: false,
            error: 'Escolha uma duração de renovação válida.',
          });
        const valor = opcao.valor;
        const renovacaoDados = JSON.stringify(grupo.dados);
        // Reusa pagamento pendente da mesma sessão+provedor.
        const existente = await queryOne(
          `SELECT id, provider, mp_payment_id AS mpPaymentId, mp_qr_text AS mpQrText, mp_qr_base64 AS mpQrBase64, status
         FROM pagamentos
        WHERE cliente_id = :clienteId AND user_id = :userId AND status = 'pending'
          AND provider = :provider AND valor = :valor
          AND renovacao_periodos = :periodos AND renovacao_dados = :renovacaoDados
          AND created_at > DATE_SUB(NOW(), INTERVAL 30 MINUTE)
        ORDER BY id DESC LIMIT 1`,
          {
            clienteId: cliente.id,
            userId: cliente.userId,
            provider: providerCfg.provider,
            valor,
            periodos,
            renovacaoDados,
          },
        );
        if (existente?.mpQrText) {
          return json(200, {
            ok: true,
            pagamentoId: existente.id,
            mpPaymentId: existente.mpPaymentId,
            qrText: existente.mpQrText,
            qrBase64: existente.mpQrBase64,
            status: existente.status,
            provider: providerCfg.provider,
          });
        }
        const notificationUrl = `${env.appUrl.replace(/\/$/, '')}/webhook/${providerCfg.provider}`;
        const externalReference = `g${cliente.userId}-${cliente.id}-${randomUUID()}`;
        const pix = await provider.criarPix(providerCfg.credenciais, {
          valor,
          descricao: `${grupo.label} — ${cliente.nome} — ${opcao.label}`.slice(
            0,
            250,
          ),
          payerNome: cliente.nome,
          customerReference: `cliente=${cliente.id}`,
          notificationUrl,
          externalReference,
        });
        const insert = await execute(
          `INSERT INTO pagamentos
        (user_id, cliente_id, valor, descricao, provider, mp_payment_id, mp_qr_text, mp_qr_base64, status, expirado_em, renovacao_periodos, renovacao_dados, external_reference)
       VALUES (:userId, :clienteId, :valor, :descricao, :provider, :mpId, :qrText, :qrBase64, :status, :expira, :periodos, :renovacaoDados, :externalReference)`,
          {
            userId: cliente.userId,
            externalReference,
            clienteId: cliente.id,
            valor,
            periodos,
            renovacaoDados,
            descricao: `Renovação — ${grupo.label} — ${opcao.label}`.slice(
              0,
              250,
            ),
            provider: providerCfg.provider,
            mpId: pix.id,
            qrText: pix.qrText,
            qrBase64: pix.qrBase64,
            status:
              normalizeStatus(pix.status) === 'approved'
                ? 'approved'
                : 'pending',
            expira: pix.expiresAt
              ? new Date(pix.expiresAt)
                  .toISOString()
                  .slice(0, 19)
                  .replace('T', ' ')
              : null,
          },
        );
        return json(200, {
          ok: true,
          pagamentoId: insert.insertId,
          mpPaymentId: pix.id,
          qrText: pix.qrText,
          qrBase64: pix.qrBase64,
          status: pix.status,
          provider: providerCfg.provider,
        });
      } catch (error) {
        console.error('[pagar/criar]', safeError(error));
        return json(500, {
          ok: false,
          error:
            'Não foi possível gerar o pagamento. Tente novamente mais tarde.',
        });
      }
    },
    async status(tokenValue, paymentId) {
      try {
        const cliente = await clienteByToken(String(tokenValue));
        if (!cliente) return json(404, { ok: false, error: 'Link inválido.' });
        const row = await queryOne(
          `SELECT id, status FROM pagamentos WHERE id = :id AND cliente_id = :clienteId AND user_id = :userId LIMIT 1`,
          {
            id: Number(paymentId),
            clienteId: cliente.id,
            userId: cliente.userId,
          },
        );
        if (!row)
          return json(404, { ok: false, error: 'Pagamento não encontrado.' });
        return json(200, { ok: true, status: row.status });
      } catch (error) {
        return json(500, {
          ok: false,
          error:
            'Não foi possível consultar o pagamento. Tente novamente mais tarde.',
        });
      }
    },
    async webhook(provider, body, request = {}) {
      try {
        let id = '';
        if (provider === 'mercadopago') {
          if (
            /^(order|payment)/i.test(String(body?.type ?? body?.action ?? ''))
          )
            id = String(body?.data?.id ?? '');
        } else if (provider === 'asaas') id = String(body?.payment?.id ?? '');
        else if (provider === 'openpix')
          id = String(
            body?.charge?.correlationID ??
              body?.pix?.charge?.correlationID ??
              '',
          );
        else if (provider === 'pagbank')
          id = String(body?.id ?? body?.charges?.[0]?.id ?? '');
        else if (provider === 'pagarme') id = String(body?.data?.id ?? '');
        // Eventos sem recurso suportado são reconhecidos sem processamento,
        // preservando probes de configuração e tipos não utilizados.
        if (!id) return { status: 200 };
        if (id.length > 200 || /[\x00-\x1f]/.test(id)) return { status: 400 };
        return await processarPagamento(provider, id, body, request);
      } catch (error) {
        console.error('[webhook]', safeError(error));
        return { status: 503 };
      }
    },
  };
}

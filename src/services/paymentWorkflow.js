// Regras de pagamento independentes do transporte HTTP e de conexoes reais.
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
}) {
  const json = (status, data) => ({ kind: 'json', status, data });
  const view = (status, name, data) => ({
    kind: 'view',
    status,
    view: name,
    data,
  });
  const redirect = (status, path) => ({ kind: 'redirect', status, path });
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
  async function processarPagamento(provider, providerPaymentId) {
    const pagamento = await queryOne(
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
    const status = await impl.consultarPagamento(
      cfg.credenciais,
      providerPaymentId,
    );
    const norm = normalizeStatus(status.status);
    await execute(
      `UPDATE pagamentos
        SET status = :status,
            pago_em = :pagoEm
      WHERE id = :id`,
      {
        id: pagamento.id,
        status: norm,
        pagoEm:
          norm === 'approved' && status.pagoEm
            ? new Date(status.pagoEm)
                .toISOString()
                .slice(0, 19)
                .replace('T', ' ')
            : null,
      },
    );
    if (norm === 'approved' && !pagamento.userNotificado) {
      await notificarPagamento(
        pagamento.id,
        pagamento.userId,
        pagamento.clienteId,
        Number(status.amount || pagamento.valor),
      );
    }
  }
  async function notificarPagamento(pagamentoId, userId, clienteId, _valor) {
    const registrado = await registrarPagamentoPendente(pagamentoId, userId);
    if (!registrado) return;
    await enviarConfirmacaoPix(userId, clienteId).catch((error) =>
      console.warn('[confirmacaoPix] falhou:', error),
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
        WHERE cliente_id = :clienteId AND status = 'pending' AND valor = :valor AND provider = :provider
          AND renovacao_periodos = :periodos
          AND renovacao_dados = :renovacaoDados
          AND created_at > DATE_SUB(NOW(), INTERVAL 30 MINUTE)
        ORDER BY id DESC LIMIT 1`,
          {
            clienteId: cliente.id,
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
        WHERE cliente_id = :clienteId AND status = 'pending'
          AND provider = :provider AND valor = :valor
          AND renovacao_periodos = :periodos AND renovacao_dados = :renovacaoDados
          AND created_at > DATE_SUB(NOW(), INTERVAL 30 MINUTE)
        ORDER BY id DESC LIMIT 1`,
          {
            clienteId: cliente.id,
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
        const externalReference = `cliente=${cliente.id}`;
        const pix = await provider.criarPix(providerCfg.credenciais, {
          valor,
          descricao: `${grupo.label} — ${cliente.nome} — ${opcao.label}`.slice(
            0,
            250,
          ),
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
        const msg = error instanceof Error ? error.message : String(error);
        console.error('[pagar/criar]', msg);
        return json(500, { ok: false, error: msg });
      }
    },
    async status(tokenValue, paymentId) {
      try {
        const cliente = await clienteByToken(String(tokenValue));
        if (!cliente) return json(404, { ok: false, error: 'Link inválido.' });
        const row = await queryOne(
          `SELECT id, status FROM pagamentos WHERE id = :id AND cliente_id = :clienteId LIMIT 1`,
          { id: Number(paymentId), clienteId: cliente.id },
        );
        if (!row)
          return json(404, { ok: false, error: 'Pagamento não encontrado.' });
        return json(200, { ok: true, status: row.status });
      } catch (error) {
        return json(500, {
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    },
    async webhook(provider, body) {
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
        if (id) await processarPagamento(provider, id);
      } catch (error) {
        console.error('[webhook/' + provider + ']', error);
      }
    },
  };
}

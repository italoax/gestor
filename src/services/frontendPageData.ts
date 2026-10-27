import { paymentProviders } from '../frontend/paymentProviders.ts';
import { statusByVencimento } from './format.ts';

const pick = (object, keys) =>
  Object.fromEntries(keys.map((key) => [key, object?.[key] ?? null]));

const catalogs = {
  planos: [
    'id',
    'nome',
    'tipo',
    'periodo',
    'creditos',
    'clientes',
    'observacao',
    'ativo',
    'sigmaPackageId',
    'sigmaConnections',
  ],
  servidores: [
    'id',
    'nome',
    'identificador',
    'creditos',
    'valorCred',
    'clientesTotal',
    'observacaoServidor',
  ],
  aplicativos: ['id', 'nome', 'descricao', 'status', 'valorRenovacao'],
  dispositivos: ['id', 'nome', 'descricao', 'status'],
};

// Contratos pequenos para telas já convertidas. Não serializar account inteiro:
// sua consulta também retorna passwordHash, que pertence somente ao backend.
export function nativePageData(
  view,
  locals,
  options: Record<string, any> = {},
) {
  const data = { ...locals, ...options };
  const page = {
    csrfToken: data.csrfToken,
    ...(Number.isFinite(data.sessionExpiresAt)
      ? { sessionExpiresAt: data.sessionExpiresAt }
      : {}),
    ...(data.releaseNoticeLoginId
      ? { releaseNoticeLoginId: data.releaseNoticeLoginId }
      : {}),
  };
  if (view === 'pages/ix-streaming')
    return {
      view,
      contactReady: Boolean(data.contactReady),
      contacts: Object.fromEntries(
        ['none', '25', '30'].map((price) => [
          price,
          typeof data.contactUrl === 'function'
            ? data.contactUrl(price === 'none' ? undefined : Number(price))
            : '#contato',
        ]),
      ),
      year: new Date().getFullYear(),
    };
  if (view === 'pages/pagar-erro')
    return { view, title: data.title, motivo: data.motivo };
  if (view === 'pages/area-cliente' || view === 'pages/pagar') {
    const cliente = data.cliente;
    const opcoes = (items) =>
      (items || []).map((item) => pick(item, ['periodos', 'label', 'valor']));
    const escolhas = (data.escolhas || []).map((item) => ({
      selecao: item.selecao,
      label: item.label,
      opcoes: opcoes(item.opcoes),
    }));
    return {
      view,
      title: data.title || 'Área do cliente',
      csrfToken: data.csrfToken,
      cliente: cliente
        ? {
            ...pick(cliente, [
              'nome',
              'user',
              'plano',
              'valor',
              'telas',
              'vencimento',
              'aplicativo',
            ]),
            horaVencimento:
              cliente.horaVencimento || cliente.hora_vencimento || '',
            statusLabel: statusByVencimento(cliente.status, cliente.vencimento)
              .label,
          }
        : null,
      adicional: data.adicional
        ? pick(data.adicional, [
            'servidor',
            'plano',
            'valor',
            'vencimento',
            'telas',
            'user',
          ])
        : null,
      pix: Boolean(data.pix),
      erro: data.erro || '',
      loginValue: data.loginValue || '',
      escolhas,
      opcoesRenovacao: opcoes(
        data.opcoesRenovacao || [
          {
            periodos: 1,
            label: '1 período do plano',
            valor: cliente?.valor || 0,
          },
        ],
      ),
      selecao: data.selecao || escolhas[0]?.selecao || '',
      periodosSelecionados: data.periodosSelecionados || 1,
      // O token público identifica o endpoint PIX; o portal obtém sua URL após autenticar.
      pagamentoToken:
        view === 'pages/pagar' ? cliente?.pagamentoToken || '' : undefined,
      pagamento:
        view === 'pages/pagar' && data.pagamento
          ? pick(data.pagamento, ['id', 'mpQrText', 'mpQrBase64', 'status'])
          : null,
    };
  }
  if (view === 'pages/login')
    return {
      view,
      title: 'Login | Gestor IXTV',
      csrfToken: data.csrfToken,
      error: Array.isArray(data.error) ? data.error : [],
      twoFactorRequired: data.twoFactorRequired === true,
    };
  const catalog = view.replace(/^pages\//, '');
  if (catalogs[catalog])
    return {
      view,
      catalog,
      title: data.title,
      subtitle: data.subtitle || '',
      page,
      user: pick(data.user, ['id', 'name', 'isAdmin']),
      success: Array.isArray(data.success) ? data.success : [],
      error: Array.isArray(data.error) ? data.error : [],
      items: (data[catalog] || []).map((item) => pick(item, catalogs[catalog])),
    };
  if (
    [
      'pages/mensagens',
      'pages/transacoes',
      'pages/avisos',
      'pages/automacao',
      'pages/status',
      'pages/dashboard',
      'pages/whatsapp',
      'pages/integracoes',
      'pages/integracao-pagamento',
      'pages/acessos-clientes',
      'pages/em-breve',
    ].includes(view)
  ) {
    const base = {
      view,
      title: data.title,
      subtitle: data.subtitle || '',
      page,
      user: pick(data.user, ['id', 'name', 'isAdmin']),
      success: Array.isArray(data.success) ? data.success : [],
      error: Array.isArray(data.error) ? data.error : [],
    };
    if (view === 'pages/em-breve')
      return {
        ...base,
        recurso: pick(data.recurso, ['titulo', 'icon', 'descricao']),
      };
    if (view === 'pages/acessos-clientes')
      return {
        ...base,
        aviso: data.aviso || '',
        clientes: (data.clientes || []).map((item) => ({
          ...pick(item, ['id', 'nome', 'user']),
          blocked: Boolean(Number(item.portal_bloqueado)),
          hasPassword: Boolean(Number(item.temSenha)),
          hasLink: Boolean(item.pagamento_curto),
        })),
      };
    if (view === 'pages/integracao-pagamento')
      return {
        ...base,
        appUrl: data.appUrl || '',
        providerPadrao: data.providerPadrao || '',
        mensagemConfirmacaoId: data.mensagemConfirmacaoId ?? '',
        mensagens: (data.mensagens || []).map((item) =>
          pick(item, ['id', 'titulo']),
        ),
        providers: (data.providers || [])
          .filter((provider) => Object.hasOwn(paymentProviders, provider))
          .map((provider) => ({
            id: provider,
            nome: data.providerNomes?.[provider] || provider,
            ativo: Boolean(data.ativoPorProvider?.[provider]),
            configurado: Boolean(
              data.credPorProvider?.[provider] &&
              Object.keys(data.credPorProvider[provider]).length,
            ),
            credentials: pick(data.credPorProvider?.[provider], ['ambiente']),
            configuredFields: Object.fromEntries(
              paymentProviders[provider].fields.map(([name]) => [
                name,
                Boolean(data.credPorProvider?.[provider]?.[name]),
              ]),
            ),
          })),
      };
    if (view === 'pages/integracoes')
      return {
        ...base,
        integracoes: (data.integracoes || []).map((item) =>
          pick(item, ['id', 'tipo', 'nome', 'apiUrl', 'username', 'status']),
        ),
      };
    if (view === 'pages/whatsapp')
      return {
        ...base,
        stats: pick(data.stats, ['total', 'mensagensHoje', 'entrega']),
        devices: (data.devices || []).map((item) =>
          pick(item, ['id', 'nome', 'principal', 'bloqueioChamadas']),
        ),
      };
    if (view === 'pages/dashboard') return dashboardPageData(base, data);
    if (view === 'pages/status')
      return {
        ...base,
        temWhatsapp: Boolean(data.temWhatsapp),
        agendamentoAtivo: data.agendamentoAtivo === true,
        historico: statusHistoryData(data.historico || []),
      };
    if (view === 'pages/automacao')
      return {
        ...base,
        historico: data.historico
          ? pick(data.historico, [
              'dataLimite',
              'pagina',
              'porPagina',
              'temMais',
              'anteriorUrl',
              'proximaUrl',
            ])
          : null,
        agendamentoAtivo: data.agendamentoAtivo !== false,
        stats: pick(data.stats, [
          'regras',
          'ativas',
          'mensagensHoje',
          'entrega',
        ]),
        regras: (data.regras || []).map((item) => ({
          ...pick(item, [
            'id',
            'titulo',
            'descricao',
            'tipo',
            'periodo',
            'tipoPeriodo',
            'status',
            'mensagemId',
            'mensagemTexto',
            'horaEnvio',
            'diasSemanaLista',
            'minDelay',
            'maxDelay',
            'envioLotes',
            'loteTamanho',
            'lotePausa',
            'rodapeAntiban',
            'filtroServidor',
            'filtroPlano',
            'filtroArquivados',
            'recebedores',
            'campanha',
          ]),
          envioHoje: item.envioHoje
            ? pick(item.envioHoje, ['estado', 'rotulo', 'detalhe', 'pendentes'])
            : null,
        })),
        disparos: (data.disparos || []).map((item) => ({
          ...pick(item, [
            'id',
            'quando',
            'regraTitulo',
            'clientesCount',
            'clientesNomes',
            'status',
            'erro',
          ]),
          clientesPorServidor: (item.clientesPorServidor || []).map(
            (group) => ({
              servidor: String(group.servidor),
              clientes: (group.clientes || []).map((nome) => String(nome)),
            }),
          ),
        })),
        mensagens: (data.mensagens || []).map((item) =>
          pick(item, ['id', 'titulo', 'mensagem']),
        ),
        planos: (data.planos || []).map((item) => pick(item, ['id', 'nome'])),
        servidores: (data.servidores || []).map((item) =>
          pick(item, ['id', 'nome']),
        ),
      };
    if (view === 'pages/mensagens')
      return {
        ...base,
        mensagens: (data.mensagens || []).map((item) =>
          pick(item, [
            'id',
            'titulo',
            'descricao',
            'mensagem',
            'mediaTipo',
            'mediaPath',
          ]),
        ),
      };
    if (view === 'pages/transacoes')
      return {
        ...base,
        filtros: pick(data.filtros, ['busca', 'pagamento']),
        formasPagamento: (data.formasPagamento || []).map((value) =>
          String(value),
        ),
        paginacao: data.paginacao
          ? pick(data.paginacao, [
              'pagina',
              'porPagina',
              'temMais',
              'anteriorUrl',
              'proximaUrl',
            ])
          : null,
        stats: pick(data.stats, [
          'total',
          'telas',
          'creditos',
          'receita',
          'lucro',
        ]),
        transacoes: (data.transacoes || []).map((item) =>
          pick(item, [
            'id',
            'data',
            'clienteNome',
            'formaPagamento',
            'descricao',
            'duracao',
            'codigos',
            'servidor',
            'plano',
            'telas',
            'creditos',
            'custo',
            'valorVenda',
            'lucro',
          ]),
        ),
      };
    return base;
  }
  if (view !== 'pages/minha-conta') return null;
  return {
    view,
    title: 'Minha Conta',
    subtitle: '',
    page,
    user: pick(data.user, ['id', 'name', 'isAdmin']),
    success: Array.isArray(data.success) ? data.success : [],
    error: Array.isArray(data.error) ? data.error : [],
    account: pick(data.account, [
      'name',
      'username',
      'pixChave',
      'pixNome',
      'pixTipo',
    ]),
  };
}

function dashboardPageData(base, data) {
  const stats = data.stats || {};
  let chart: Record<string, any> = {};
  try {
    chart =
      typeof data.chart === 'string'
        ? JSON.parse(data.chart)
        : data.chart || {};
  } catch {
    /* sem série disponível */
  }
  const distribution = (name) =>
    (data[name] || []).map((item) =>
      pick(item, ['rotulo', 'total', 'valor', 'percent']),
    );
  const geography = (value, key) => ({
    total: value?.total || 0,
    top: (value?.top || []).map((item) => pick(item, [key, 'nome', 'total'])),
  });
  return {
    ...base,
    stats: {
      ...pick(stats, [
        'ativos',
        'vencidos',
        'clientesTotal',
        'servidoresCount',
      ]),
      receitaCusto: Object.fromEntries(
        ['hoje', 'mes', 'mesAnterior'].map((key) => [
          key,
          pick(stats.receitaCusto?.[key], ['receita', 'custo', 'lucro']),
        ]),
      ),
      vencimentos: Object.fromEntries(
        ['hoje', 'amanha', 'ontem'].map((key) => [
          key,
          pick(stats.vencimentos?.[key], ['total', 'valor']),
        ]),
      ),
      financeiro: pick(stats.financeiro, [
        'recebidoHoje',
        'recebidoMes',
        'recebidoMesAnterior',
        'projecao',
        'variacaoMes',
      ]),
    },
    acessos: data.acessos
      ? {
          ...pick(data.acessos, [
            'clientes',
            'comUm',
            'comDois',
            'total',
            'ativos',
            'vencidos',
            'inativos',
          ]),
          servidores: (data.acessos.servidores || []).map((item) =>
            pick(item, ['nome', 'total', 'ativos', 'vencidos', 'inativos']),
          ),
        }
      : null,
    ativosPercent: data.ativosPercent || 0,
    vencidosPercent: data.vencidosPercent || 0,
    periodo: ['mes', 'anterior'].includes(data.periodo)
      ? data.periodo
      : 'todos',
    novosNoMes: data.novosNoMes || 0,
    chart: Object.fromEntries(
      ['labels', 'receita', 'custo', 'lucro', 'novos'].map((key) => [
        key,
        Array.isArray(chart[key])
          ? chart[key]
              .slice(0, 31)
              .map((value) =>
                key === 'labels' ? String(value) : Number(value) || 0,
              )
          : [],
      ]),
    ),
    topAplicativos: distribution('topAplicativos'),
    topDispositivos: distribution('topDispositivos'),
    formasPagamento: distribution('formasPagamento'),
    planosDist: distribution('planosDist'),
    indicacoes: distribution('indicacoes'),
    performance: {
      ...pick(data.performance, ['faturamento', 'custo', 'lucro', 'margem']),
      itens: (data.performance?.itens || []).map((item) =>
        pick(item, [
          'servidor',
          'total',
          'faturamento',
          'custo',
          'lucro',
          'margem',
          'custoPercent',
          'lucroPercent',
        ]),
      ),
    },
    estados: geography(data.estados, 'uf'),
    paises: geography(data.paises, 'code'),
    proximos: (data.proximos || []).map((item) =>
      pick(item, ['id', 'nome', 'plano', 'dias']),
    ),
  };
}

export function statusHistoryData(items) {
  return items.map((item) =>
    pick(item, [
      'id',
      'tipo',
      'texto',
      'corFundo',
      'temImagem',
      'legenda',
      'status',
      'erro',
      'destinatarios',
      'postadoEm',
      'agendadoPara',
      'removerEm',
      'createdAt',
    ]),
  );
}

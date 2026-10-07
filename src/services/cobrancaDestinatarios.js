export function regraPorVencimento(regra) {
  return !['todos', 'apos cadastro'].includes(
    String(regra.tipo).toLowerCase().trim(),
  );
}
// Cada linha representa um acesso; id e telefone continuam sendo os do cadastro.
// A consulta compartilhada mantém a prévia, a contagem e o cron com os mesmos filtros.
export function consultaDestinatariosCobranca(userId, regra, today) {
  const json = (campo) =>
    `JSON_UNQUOTE(JSON_EXTRACT(plano_adicional, '$.${campo}')) COLLATE utf8mb4_unicode_ci`;
  const fonte = `(SELECT id, user_id, nome, telefone, vencimento, valor, plano, servidor, user, senha,
      pagamento_token AS pagamentoToken, status, arquivado, created_at,
      'principal' AS acessoChave, plano_adicional IS NOT NULL AS temMultiplosAcessos
    FROM clientes WHERE user_id = :userId
    UNION ALL
    SELECT id, user_id, nome, telefone, CAST(${json('vencimento')} AS DATE),
      CAST(${json('valor')} AS DECIMAL(12,2)), ${json('plano')}, ${json('servidor')}, ${json('user')}, NULL,
      pagamento_token, status, arquivado, created_at, ${json('id')}, 1
    FROM clientes WHERE user_id = :userId AND plano_adicional IS NOT NULL) acessos`;
  const tipo = String(regra.tipo).toLowerCase().trim();
  const params = { userId, today };
  let where = "user_id = :userId AND status = 'Ativo'";
  const arquivados = String(regra.filtroArquivados || '')
    .toLowerCase()
    .trim();
  if (arquivados === 'arquivado') where += ' AND arquivado = 1';
  else if (arquivados !== 'todos') where += ' AND arquivado = 0';
  if (tipo === 'apos cadastro') {
    where +=
      " AND DATEDIFF(:today, DATE(CONVERT_TZ(created_at, '+00:00', '-03:00'))) = :periodoCadastro";
    params.periodoCadastro = Math.abs(Number(regra.periodo) || 0);
  } else if (regraPorVencimento(regra)) {
    where += ' AND DATEDIFF(vencimento, :today) = :periodoAlvo';
    const dias = Math.abs(Number(regra.periodo) || 0);
    params.periodoAlvo =
      tipo === 'vence hoje'
        ? 0
        : tipo === 'vencidos'
          ? -dias
          : tipo === 'vencimento'
            ? dias
            : Number(regra.periodo) || 0;
  }
  if (regra.filtroServidor) {
    where += ' AND servidor = :filtroServidor';
    params.filtroServidor = regra.filtroServidor;
  }
  if (regra.filtroPlano) {
    where += ' AND plano = :filtroPlano';
    params.filtroPlano = regra.filtroPlano;
  }
  return { from: `FROM ${fonte} WHERE ${where}`, params };
}
// Campanhas gerais e de boas-vindas continuam enviando uma mensagem por cadastro.
export function selecionarDestinatarios(rows, regra) {
  if (regraPorVencimento(regra)) return rows;
  const ids = new Set();
  return rows.filter((row) =>
    ids.has(row.id) ? false : (ids.add(row.id), true),
  );
}
export function agruparAvisosCobranca(rows, regra) {
  const grupos = new Map();
  for (const row of selecionarDestinatarios(rows, regra)) {
    const data =
      row.vencimento instanceof Date
        ? row.vencimento.toISOString().slice(0, 10)
        : String(row.vencimento || '').slice(0, 10);
    const chave = `${row.id}/${regraPorVencimento(regra) ? data : ''}`;
    const grupo = grupos.get(chave) || [];
    grupo.push(row);
    grupos.set(chave, grupo);
  }
  return [...grupos.values()].map((acessos) => ({
    ...contextoAvisoCobranca(acessos),
    acessosCobranca: acessos,
  }));
}
export function contextoAvisoCobranca(acessos) {
  if (acessos.length === 1) return { ...acessos[0] };
  return {
    ...acessos[0],
    servidor: acessos
      .map((a) => a.servidor)
      .filter(Boolean)
      .join(' + '),
    plano: [...new Set(acessos.map((a) => a.plano).filter(Boolean))].join(
      ' + ',
    ),
    valor:
      acessos.reduce(
        (total, a) => total + Math.round(Number(a.valor || 0) * 100),
        0,
      ) / 100,
    user: acessos
      .map((a) => a.user)
      .filter(Boolean)
      .join(' / '),
    senha: null,
  };
}
export function mensagemCobrancaPorAcesso(template, cliente) {
  if ((cliente.acessosCobranca?.length || 0) > 1) {
    const money = (valor) =>
      valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const resumo =
      'Os dois servidores abaixo vencem em {vencimento}:\n' +
      cliente.acessosCobranca
        .map((a) => `${a.servidor} — ${money(Number(a.valor || 0))}`)
        .join('\n') +
      `\nTotal: ${money(Number(contextoAvisoCobranca(cliente.acessosCobranca).valor))}`;
    if (/\{\s*resumo_acessos\s*\}/i.test(template))
      return template.replace(/\{\s*resumo_acessos\s*\}/gi, resumo);
    return template;
  }
  return template;
}

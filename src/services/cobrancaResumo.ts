// A consulta agrupa os acessos por cliente. Só há confirmação completa quando
// todos os acessos elegíveis daquele cliente foram enviados nesta regra hoje.
export function resumirEnviosCobranca(rows) {
  const resumo = {
    total: rows.length,
    enviados: 0,
    pendentes: 0,
    falhas: 0,
    emEnvio: 0,
    semConfirmacao: 0,
  };
  for (const row of rows) {
    if (Number(row.acessos) > 0 && Number(row.enviados) === Number(row.acessos))
      resumo.enviados++;
    else if (Number(row.semConfirmacao) > 0) resumo.semConfirmacao++;
    else if (Number(row.falhas) > 0) resumo.falhas++;
    else if (Number(row.emEnvio) > 0) resumo.emEnvio++;
    else resumo.pendentes++;
  }
  const { total, enviados, pendentes, falhas, emEnvio, semConfirmacao } =
    resumo;
  const [estado, rotulo] = !total
    ? ['vazio', 'Sem destinatários hoje']
    : semConfirmacao
      ? ['incerto', 'Sem confirmação']
      : falhas
        ? ['erro', 'Falha no envio']
        : emEnvio
          ? ['enviando', 'Envio em andamento']
          : enviados === total
            ? ['enviado', 'Enviado hoje']
            : enviados
              ? ['parcial', 'Envio parcial']
              : ['pendente', 'Não enviado hoje'];
  const detalhes = [
    enviados ? `${enviados} enviado${enviados === 1 ? '' : 's'}` : '',
    pendentes ? `${pendentes} pendente${pendentes === 1 ? '' : 's'}` : '',
    falhas ? `${falhas} com falha` : '',
    emEnvio ? `${emEnvio} em andamento` : '',
    semConfirmacao ? `${semConfirmacao} sem confirmação` : '',
  ].filter(Boolean);
  return {
    ...resumo,
    estado,
    rotulo,
    detalhe: total
      ? detalhes.join(' · ')
      : 'Nenhum cliente atende à regra hoje.',
  };
}

import {
  consultaDestinatariosCobranca,
  agruparAvisosCobranca,
  mensagemCobrancaPorAcesso,
  regraPorVencimento,
} from './cobrancaDestinatarios.ts';
import { dataReservaCampanha, lerCampanha } from './campanhas.ts';
import { normalizeDateInput } from './format.ts';
import { normalizeMessageVariables } from '../shared/messageVariables.ts';

class PreviewError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export { PreviewError };

// Deliberadamente recebe apenas leitores: simular não reserva envios nem gera links.
export function createAutomationPreview({
  queryRows,
  queryOne,
  appTodayIso,
  renderMessage,
  getPixConfig,
  appUrl = '',
  enabled = true,
}) {
  return async (userId, body) => {
    const id = Number(body.id || 0);
    if (!Number.isSafeInteger(id) || id < 0)
      throw new PreviewError('Regra inválida.');
    let rule: any = id
      ? await queryOne(
          `SELECT c.id,c.titulo,c.tipo,c.periodo,c.status,c.automatica,
      c.hora_envio AS horaEnvio,c.dias_semana AS diasSemana,c.campanha_config AS campanhaConfig,
      c.filtro_servidor AS filtroServidor,c.filtro_plano AS filtroPlano,c.filtro_arquivados AS filtroArquivados,
      m.mensagem,m.media_tipo AS mediaTipo,m.media_path AS mediaPath
      FROM cobrancas c LEFT JOIN mensagens m ON m.id=c.mensagem_id AND m.user_id=c.user_id
      WHERE c.id=:id AND c.user_id=:userId LIMIT 1`,
          { id, userId },
        )
      : null;
    if (id && !rule) throw new PreviewError('Regra não encontrada.', 404);
    if (String(body.rascunho) === '1') {
      if (rule?.campanhaConfig)
        throw new PreviewError('Use a prévia do envio salvo.');
      const type = String(body.tipo || 'Vencimento');
      const period = Number(body.periodo || 0);
      if (
        ![
          'Todos',
          'Vencimento',
          'Vence hoje',
          'Vencidos',
          'Apos cadastro',
        ].includes(type) ||
        !Number.isFinite(period) ||
        Math.abs(period) > 36500
      )
        throw new PreviewError('Confira o gatilho e o período da regra.');
      const messageId = Number(body.mensagem_id || 0);
      if (!Number.isSafeInteger(messageId) || messageId <= 0)
        throw new PreviewError(
          'Selecione um template para visualizar a mensagem.',
        );
      const template = await queryOne(
        'SELECT mensagem,media_tipo AS mediaTipo,media_path AS mediaPath FROM mensagens WHERE id=:messageId AND user_id=:userId LIMIT 1',
        { messageId, userId },
      );
      if (!template) throw new PreviewError('Template não encontrado.');
      const rawDays = body['dias_semana[]'] ?? body.dias_semana ?? [];
      const days = Array.isArray(rawDays) ? rawDays : [rawDays];
      rule = {
        id,
        ...template,
        titulo: String(body.nome || 'Nova regra').slice(0, 160),
        tipo: type,
        periodo: period,
        status: body.ativa === '1' ? 'Ativo' : 'Inativo',
        automatica: body.ativa === '1' ? 1 : 0,
        horaEnvio: String(body.hora_envio || '09:00'),
        diasSemana: days.map(String).join(','),
        filtroServidor: String(body.filtro_servidor || '').slice(0, 255),
        filtroPlano: String(body.filtro_plano || '').slice(0, 255),
        filtroArquivados: String(body.filtro_arquivados || ''),
      };
    }
    if (!rule) throw new PreviewError('Selecione uma regra para visualizar.');
    let campaign;
    try {
      campaign = lerCampanha(rule.campanhaConfig);
    } catch {
      throw new PreviewError('Confira a configuração do envio automático.');
    }
    const date =
      body.data_referencia ||
      (campaign?.modo === 'unico' ? campaign.data : appTodayIso());
    if (
      typeof date !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      normalizeDateInput(date) !== date ||
      new Date(date + 'T12:00:00Z').toISOString().slice(0, 10) !== date
    )
      throw new PreviewError('Informe uma data válida para a prévia.');
    const page = Math.min(
      100000,
      Math.max(1, Math.floor(Number(body.pagina) || 1)),
    );
    const group = body.grupo === 'ignorados' ? 'ignorados' : 'elegiveis';
    const { source, conditions, params } = consultaDestinatariosCobranca(
      userId,
      rule,
      date,
    );
    Object.assign(params, {
      regraId: id,
      reservaData: dataReservaCampanha(rule.campanhaConfig, date),
    });
    const reasons = conditions
      .map(({ sql, reason }, index) => {
        params['reason' + index] = reason;
        return `WHEN NOT COALESCE((${sql}),0) THEN :reason${index}`;
      })
      .join(' ');
    const filtered = `SELECT acessos.*,CASE ${reasons} ELSE '' END AS motivoFiltro FROM ${source} WHERE user_id=:userId`;
    const classified = `SELECT acessos.*,ce.status AS envioStatus,CASE WHEN motivoFiltro<>'' THEN motivoFiltro
      WHEN ce.status='enviado' THEN 'Envio já confirmado nesta data'
      WHEN ce.status='pendente' THEN 'Envio em andamento'
      WHEN ce.status IN ('incerto','erro') THEN 'Envio anterior exige conferência no WhatsApp'
      WHEN ce.status IS NOT NULL AND ce.status<>'nao_enviado' THEN 'Envio anterior bloqueia nova tentativa'
      ELSE '' END AS motivo
      FROM (${filtered}) acessos LEFT JOIN cobrancas_envios ce ON ce.cobranca_id=:regraId AND ce.cliente_id=acessos.id
        AND ce.acesso_chave=${regraPorVencimento(rule) ? 'acessos.acessoChave' : "'principal'"} AND ce.data_envio=:reservaData
      WHERE acessos.user_id=:userId`;
    const totals = await queryOne(
      `SELECT COUNT(*) AS total,COALESCE(SUM(disponivel),0) AS elegiveis FROM (
      SELECT id,MAX(motivo='') AS disponivel FROM (${classified}) classificados GROUP BY id) clientesPrevia`,
      params,
    );
    const clients = await queryRows(
      `SELECT id,nome,MAX(motivo='') AS disponivel FROM (${classified}) classificados
      GROUP BY id,nome HAVING disponivel=${group === 'elegiveis' ? 1 : 0} ORDER BY nome,id LIMIT 41 OFFSET ${(page - 1) * 40}`,
      params,
    );
    const pageClients = clients.slice(0, 40);
    const placeholders = pageClients.map((client, index) => {
      params['previewClient' + index] = client.id;
      return ':previewClient' + index;
    });
    const rows = placeholders.length
      ? await queryRows(
          `SELECT * FROM (${classified}) classificados WHERE id IN (${placeholders.join(',')}) ORDER BY id,acessoChave='principal' DESC`,
          params,
        )
      : [];
    const pix = await getPixConfig(userId);
    const template = normalizeMessageVariables(
      campaign?.mensagem ||
        rule.mensagem ||
        'Olá {nome}, seu plano {plano} vence em {vencimento}. Valor: {valor}.',
    );
    const warnings: string[] = [];
    if (!enabled)
      warnings.push('O envio automático está desativado no servidor.');
    if (rule.status !== 'Ativo' || !Number(rule.automatica))
      warnings.push(
        'Regra inativa. A prévia simula os destinatários caso ela seja ativada.',
      );
    const weekday = new Date(date + 'T12:00:00Z').getUTCDay();
    const days = String(rule.diasSemana || '')
      .split(',')
      .filter(Boolean)
      .map(Number);
    if (
      campaign?.modo !== 'unico' &&
      days.length &&
      !days.includes(weekday) &&
      !(weekday === 0 && days.includes(7))
    )
      warnings.push('A data escolhida está fora dos dias de envio da regra.');
    if (campaign?.modo === 'unico' && date !== campaign.data)
      warnings.push('Este envio único está agendado para outra data.');
    if (template.includes('{link_cliente}'))
      warnings.push(
        'Links ainda não existentes serão gerados somente no envio.',
      );
    if (template.includes('{senha}'))
      warnings.push('Senhas ficam ocultas na prévia.');
    if (template.includes('{saudacao}'))
      warnings.push(
        'A saudação considera o horário atual e pode mudar no envio.',
      );
    if (
      template.includes('{cobranca_pix}') &&
      (!pix?.pixChave || !pix?.pixNome || !pix?.pixTipo)
    )
      warnings.push(
        'Complete a chave, o titular e o tipo do Pix em Minha Conta antes de enviar.',
      );
    if (template.includes('{cobranca_pix}') && rule.mediaPath)
      warnings.push('A cobrança Pix precisa de um template sem anexo.');
    return {
      ok: true,
      titulo: rule.titulo,
      data: date,
      horario: String(rule.horaEnvio || '').slice(0, 5),
      pagina: page,
      grupo: group,
      temMais: clients.length > 40,
      resumo: {
        total: Number(totals?.total || 0),
        elegiveis: Number(totals?.elegiveis || 0),
        ignorados: Number(totals?.total || 0) - Number(totals?.elegiveis || 0),
      },
      avisos: warnings,
      clientes: pageClients.map((client) => {
        const accesses = rows.filter(
          (row) => Number(row.id) === Number(client.id),
        );
        const available = accesses.filter((row) => !row.motivo);
        const messages = agruparAvisosCobranca(available, rule).map(
          (recipient) => {
            const context = {
              ...recipient,
              ...pix,
              senha: null,
              linkPagamentoCurto: recipient.pagamentoCurto
                ? `${appUrl.replace(/\/$/, '')}/r/${encodeURIComponent(recipient.pagamentoCurto)}`
                : '[link individual gerado no envio]',
            };
            const text = regraPorVencimento(rule)
              ? mensagemCobrancaPorAcesso(template, recipient)
              : template;
            return {
              texto:
                rule.mediaPath && rule.mediaTipo === 'audio'
                  ? ''
                  : renderMessage(
                      text.replace(/\{senha\}/gi, '••••••'),
                      context,
                    ),
              anexo: rule.mediaPath ? String(rule.mediaTipo || 'image') : null,
              cobrancaPix: template.includes('{cobranca_pix}'),
              valor: Number(recipient.valor || 0),
            };
          },
        );
        return {
          id: Number(client.id),
          nome: String(client.nome),
          elegivel: available.length > 0,
          motivos: [
            ...new Set(
              accesses
                .filter((row) => row.motivo)
                .map((row) => String(row.motivo)),
            ),
          ],
          mensagens: messages,
          avisos: [
            ...(available.length && !String(available[0].telefone || '').trim()
              ? ['Cliente sem telefone cadastrado. Corrija antes de enviar.']
              : []),
            ...(template.includes('{cobranca_pix}') &&
            messages.some(
              (message) =>
                !/^\d{1,10}(\.\d{1,2})?$/.test(String(message.valor)) ||
                message.valor <= 0,
            )
              ? [
                  'Informe um valor maior que zero com até duas casas decimais para a cobrança Pix.',
                ]
              : []),
          ],
        };
      }),
    };
  };
}

import { regraPorVencimento } from '../services/cobrancaDestinatarios.ts';
import { resumirEnviosCobranca } from '../services/cobrancaResumo.ts';
import {
  workflowResult,
  raiseWorkflowError,
} from '../services/workflowReply.ts';
export function createAutomationWorkflow({
  execute,
  queryOne,
  queryRows,
  consultaDestinatariosCobranca,
  agruparAvisosCobranca,
  appTodayIso,
  boolField,
  toNullableString,
  toNumber,
  dispararRegraManual,
  ensureCobrancasEnviosTable,
  jaSemeou,
  marcarSemeado,
  seedMensagensPadrao,
}) {
  function descricaoRegra(tipo, periodo) {
    const t = String(tipo).toLowerCase();
    const d = Math.abs(Number(periodo) || 0);
    if (t === 'vencimento') return `${d} dia(s) antes do venc. do plano`;
    if (t === 'vence hoje') return 'No dia do vencimento do plano';
    if (t === 'vencidos') return `${d} dia(s) após venc. do plano`;
    if (t === 'apos cadastro') return `${d} dia(s) após cadastro`;
    return 'Todos os clientes';
  }
  async function carregarEnvioHoje(userId, regra, today, historicoHoje) {
    const { from, params } = consultaDestinatariosCobranca(
      userId,
      regra,
      today,
    );
    const rows = await queryRows(
      `SELECT alvo.id AS clienteId, COUNT(*) AS acessos,
              SUM(ce.status = 'enviado') AS enviados,
              SUM(ce.status IN ('erro', 'nao_enviado')) AS falhas,
              SUM(ce.status = 'pendente') AS emEnvio,
              SUM(ce.status = 'incerto') AS semConfirmacao
         FROM (SELECT id, acessoChave ${from}) alvo
         LEFT JOIN cobrancas_envios ce
           ON ce.cobranca_id = :regraId AND ce.cliente_id = alvo.id
          AND ce.acesso_chave = ${regraPorVencimento(regra) ? 'alvo.acessoChave' : "'principal'"}
          AND ce.data_envio = :today
        GROUP BY alvo.id`,
      { ...params, regraId: regra.id },
    );
    // Uma renovação pode retirar um cliente dos elegíveis depois do envio.
    // Conserva a confirmação de hoje sem confundi-la com novos destinatários.
    const clientes = new Map(rows.map((row) => [String(row.clienteId), row]));
    for (const row of historicoHoje) {
      if (!clientes.has(String(row.clienteId)))
        clientes.set(String(row.clienteId), row);
    }
    return {
      ...resumirEnviosCobranca([...clientes.values()]),
      recebedores: rows.length,
    };
  }
  const REGRAS_PADRAO = [
    {
      titulo: 'Follow-up 5 dias após cadastro',
      tipo: 'Apos cadastro',
      periodo: 5,
      msg: 'Follow-up pós-cadastro',
    },
    {
      titulo: 'Feedback 5 dias após vencimento',
      tipo: 'Vencidos',
      periodo: 5,
      msg: 'Como está o serviço?',
    },
    {
      titulo: 'Cobrança 1 dia após vencimento',
      tipo: 'Vencidos',
      periodo: 1,
      msg: 'Acesso expirado',
    },
    {
      titulo: 'Lembrete 1 dia antes',
      tipo: 'Vencimento',
      periodo: 1,
      msg: 'Aviso de vencimento',
    },
    { titulo: 'Vence hoje', tipo: 'Vence hoje', periodo: 0, msg: 'Vence hoje' },
    {
      titulo: 'Lembrete 3 dias antes',
      tipo: 'Vencimento',
      periodo: 3,
      msg: 'Aviso de vencimento',
    },
  ];
  async function seedRegrasPadrao(userId) {
    // Semeia as 6 regras padrão UMA ÚNICA VEZ (não recria as apagadas depois).
    if (await jaSemeou(userId, 'regras')) return;
    await seedMensagensPadrao(userId);
    const [existentes, mensagens] = await Promise.all([
      queryRows('SELECT titulo FROM cobrancas WHERE user_id = :userId', {
        userId,
      }),
      queryRows('SELECT id, titulo FROM mensagens WHERE user_id = :userId', {
        userId,
      }),
    ]);
    const titulos = new Set(
      existentes.map((r) => String(r.titulo).trim().toLowerCase()),
    );
    const idPorTitulo = new Map(mensagens.map((m) => [m.titulo, m.id]));
    for (const r of REGRAS_PADRAO) {
      if (titulos.has(r.titulo.toLowerCase())) continue;
      await execute(
        `INSERT INTO cobrancas (user_id, titulo, descricao, tipo, gatilho, tipo_periodo, periodo, status, automatica,
            mensagem_id, hora_envio, dias_semana, rodape_antiban)
       VALUES (:userId, :titulo, :descricao, :tipo, 'plano', 'Dias', :periodo, 'Inativo', 0,
            :mensagemId, '09:00:00', '0,1,2,3,4,5,6', 1)`,
        {
          userId,
          titulo: r.titulo,
          descricao: descricaoRegra(r.tipo, r.periodo),
          tipo: r.tipo,
          periodo: r.periodo,
          mensagemId: idPorTitulo.get(r.msg) ?? null,
        },
      );
    }
    await marcarSemeado(userId, 'regras');
  }
  function formatDateTimeBr(value) {
    if (!value) return '-';
    let date;
    if (value instanceof Date) {
      date = value;
    } else {
      // String do MySQL "YYYY-MM-DD HH:MM:SS" — a conexão está em UTC, então
      // tratamos como UTC adicionando o "Z" antes de o JS interpretar.
      const raw = String(value).trim();
      const iso =
        /\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(raw) &&
        !/[zZ+\-]\d{2}:?\d{2}$/.test(raw)
          ? raw.replace(' ', 'T') + 'Z'
          : raw;
      date = new Date(iso);
    }
    if (Number.isNaN(date.getTime())) return '-';
    return date.toLocaleString('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
  return {
    list: (input) =>
      workflowResult(input, async (reply) => {
        try {
          const userId = input.session.user.id;
          await ensureCobrancasEnviosTable();
          await seedRegrasPadrao(userId);
          const today = appTodayIso();
          const [
            regrasRows,
            enviosHoje,
            disparos,
            clientesCount,
            planos,
            servidores,
            mensagens,
          ] = await Promise.all([
            queryRows(
              `SELECT c.id, c.titulo, c.descricao, c.tipo, c.gatilho, c.periodo, c.tipo_periodo AS tipoPeriodo, c.status, c.automatica,
                c.mensagem_id AS mensagemId, c.hora_envio AS horaEnvio, c.dias_semana AS diasSemana,
                c.min_delay AS minDelay, c.max_delay AS maxDelay, c.envio_lotes AS envioLotes,
                c.lote_tamanho AS loteTamanho, c.lote_pausa AS lotePausa, c.rodape_antiban AS rodapeAntiban,
                c.filtro_servidor AS filtroServidor, c.filtro_plano AS filtroPlano, c.filtro_arquivados AS filtroArquivados,
                m.titulo AS mensagemTitulo, m.mensagem AS mensagemTexto
           FROM cobrancas c LEFT JOIN mensagens m ON m.id = c.mensagem_id AND m.user_id = c.user_id
          WHERE c.user_id = :userId ORDER BY c.id DESC`,
              { userId },
            ),
            queryRows(
              `SELECT ce.cobranca_id AS regraId, ce.cliente_id AS clienteId,
                COUNT(*) AS acessos,
                SUM(ce.status = 'enviado') AS enviados,
                SUM(ce.status IN ('erro', 'nao_enviado')) AS falhas,
                SUM(ce.status = 'pendente') AS emEnvio,
                SUM(ce.status = 'incerto') AS semConfirmacao
           FROM cobrancas_envios ce JOIN cobrancas c ON c.id = ce.cobranca_id
          WHERE c.user_id = :userId AND ce.data_envio = :today
          GROUP BY ce.cobranca_id, ce.cliente_id`,
              { userId, today },
            ),
            queryRows(
              // Agrupa por regra + dia + status + erro: 3 clientes que receberam a MESMA
              // mensagem da MESMA regra hoje aparecem como UMA linha ("Nicole, Walana,
              // Marcos") em vez de três entradas idênticas.
              `SELECT MAX(ce.updated_at) AS atualizadoEm,
                co.titulo AS regraTitulo,
                ce.status,
                ce.erro,
                COUNT(*) AS clientesCount,
                GROUP_CONCAT(CONCAT(cl.nome, ' (', COALESCE(
                  CASE WHEN ce.acesso_chave = 'principal' THEN cl.servidor
                    ELSE JSON_UNQUOTE(JSON_EXTRACT(cl.plano_adicional, '$.servidor')) END, 'acesso removido'), ')')
                  ORDER BY cl.nome SEPARATOR ', ') AS clientesNomes
           FROM cobrancas_envios ce JOIN cobrancas co ON co.id = ce.cobranca_id
           LEFT JOIN clientes cl ON cl.id = ce.cliente_id AND cl.user_id = co.user_id
          WHERE co.user_id = :userId
          GROUP BY ce.cobranca_id, ce.data_envio, ce.status, ce.erro, co.titulo
          ORDER BY atualizadoEm DESC LIMIT 100`,
              { userId },
            ),
            queryRows(
              'SELECT COUNT(*) AS total FROM clientes WHERE user_id = :userId',
              { userId },
            ),
            queryRows(
              'SELECT id, nome FROM planos WHERE user_id = :userId ORDER BY nome ASC',
              { userId },
            ),
            queryRows(
              'SELECT id, nome FROM servidores WHERE user_id = :userId ORDER BY nome ASC',
              { userId },
            ),
            queryRows(
              'SELECT id, titulo, mensagem FROM mensagens WHERE user_id = :userId ORDER BY titulo ASC',
              { userId },
            ),
          ]);
          const enviosPorRegra = new Map<string, typeof enviosHoje>();
          for (const envio of enviosHoje) {
            const key = String(envio.regraId);
            const rows = enviosPorRegra.get(key) || [];
            rows.push(envio);
            enviosPorRegra.set(key, rows);
          }
          const regras = await Promise.all(
            regrasRows.map(async (r) => {
              const envioHoje = await carregarEnvioHoje(
                userId,
                r,
                today,
                enviosPorRegra.get(String(r.id)) || [],
              );
              return {
                ...r,
                recebedores: envioHoje.recebedores,
                envioHoje,
                diasSemanaLista: String(r.diasSemana ?? '')
                  .split(',')
                  .map((x) => x.trim())
                  .filter(Boolean),
              };
            }),
          );
          const enviados = enviosHoje.reduce(
            (total, row) => total + Number(row.enviados || 0),
            0,
          );
          const erros = enviosHoje.reduce(
            (total, row) =>
              total + Number(row.falhas || 0) + Number(row.semConfirmacao || 0),
            0,
          );
          const stats = {
            regras: regras.length,
            ativas: regras.filter((r) => r.status === 'Ativo').length,
            mensagensHoje: enviados,
            entrega:
              enviados + erros > 0
                ? Math.round((enviados / (enviados + erros)) * 100)
                : 0,
          };
          reply.render('pages/automacao', {
            title: 'Automação',
            subtitle: 'Envie mensagens automáticas para seus clientes',
            stats,
            regras,
            disparos: disparos.map((d) => ({
              ...d,
              quando: formatDateTimeBr(d.atualizadoEm),
            })),
            clientesCount: Number(clientesCount[0]?.total ?? 0),
            planos,
            servidores,
            mensagens,
          });
        } catch (error) {
          raiseWorkflowError(error);
        }
      }),
    change: (input) =>
      workflowResult(input, async (reply) => {
        try {
          const userId = input.session.user.id;
          const action = String(input.body.action ?? '');
          const id = Number(input.body.id);
          if (action === 'delete_regra') {
            await execute(
              'DELETE FROM cobrancas WHERE id = :id AND user_id = :userId',
              { id, userId },
            );
            input.flash('success', 'Regra apagada.');
            return reply.redirect('/automacao');
          }
          if (action === 'toggle_regra') {
            await execute(
              "UPDATE cobrancas SET status = IF(status = 'Ativo', 'Inativo', 'Ativo'), automatica = IF(status = 'Ativo', 0, 1) WHERE id = :id AND user_id = :userId",
              { id, userId },
            );
            return reply.redirect('/automacao');
          }
          if (action === 'dispatch_regra') {
            // Dispara a regra na hora, ignorando hora_envio/dias da semana/jaRodouHoje.
            // Mantém a reserva em cobrancas_envios — então clientes já enviados hoje
            // por essa mesma regra não recebem duas vezes.
            const resultado = await dispararRegraManual(userId, id);
            if (!resultado.ok) {
              input.flash(
                'error',
                resultado.error ?? 'Não foi possível disparar a regra.',
              );
            } else if (resultado.enviados === 0 && resultado.elegiveis === 0) {
              input.flash(
                'error',
                'Nenhum cliente bate com os critérios da regra hoje.',
              );
            } else if (resultado.enviados === 0) {
              input.flash(
                'error',
                'Nenhuma mensagem repetida: os envios de hoje já foram confirmados, estão em andamento ou exigem conferência no WhatsApp.',
              );
            } else {
              input.flash(
                'success',
                `Disparo concluído: ${resultado.enviados} mensagem(ns) enviada(s).`,
              );
            }
            return reply.redirect('/automacao');
          }
          const ativa = boolField(input.body.ativa);
          const tipo = String(input.body.tipo || 'Vencimento');
          const periodo = toNumber(input.body.periodo);
          const diasInput =
            input.body['dias_semana[]'] ?? input.body.dias_semana;
          const data = {
            userId,
            id,
            titulo: String(input.body.nome ?? input.body.titulo ?? '').trim(),
            descricao: descricaoRegra(tipo, periodo),
            tipo,
            gatilho: 'plano',
            tipoPeriodo: String(input.body.tipo_periodo || 'Dias'),
            periodo,
            status: ativa ? 'Ativo' : 'Inativo',
            automatica: ativa,
            mensagemId: input.body.mensagem_id
              ? Number(input.body.mensagem_id)
              : null,
            horaEnvio: toNullableString(input.body.hora_envio) ?? '09:00',
            diasSemana: Array.isArray(diasInput)
              ? diasInput.join(',')
              : toNullableString(diasInput),
            minDelay: input.body.min_delay
              ? toNumber(input.body.min_delay)
              : null,
            maxDelay: input.body.max_delay
              ? toNumber(input.body.max_delay)
              : null,
            envioLotes: boolField(input.body.envio_lotes),
            loteTamanho: input.body.lote_tamanho
              ? toNumber(input.body.lote_tamanho, 20)
              : 20,
            lotePausa: input.body.lote_pausa
              ? toNumber(input.body.lote_pausa, 60)
              : 60,
            rodapeAntiban: boolField(input.body.rodape_antiban),
            filtroServidor: toNullableString(input.body.filtro_servidor),
            filtroPlano: toNullableString(input.body.filtro_plano),
            filtroArquivados: toNullableString(input.body.filtro_arquivados),
          };
          if (!data.titulo) {
            input.flash('error', 'Informe o nome da regra.');
            return reply.redirect('/automacao');
          }
          const campos = `titulo = :titulo, descricao = :descricao, tipo = :tipo, gatilho = :gatilho, tipo_periodo = :tipoPeriodo,
      periodo = :periodo, status = :status, automatica = :automatica, mensagem_id = :mensagemId, hora_envio = :horaEnvio,
      dias_semana = :diasSemana, min_delay = :minDelay, max_delay = :maxDelay, envio_lotes = :envioLotes,
      lote_tamanho = :loteTamanho, lote_pausa = :lotePausa,
      rodape_antiban = :rodapeAntiban, filtro_servidor = :filtroServidor, filtro_plano = :filtroPlano, filtro_arquivados = :filtroArquivados`;
          if (action === 'update_regra') {
            await execute(
              `UPDATE cobrancas SET ${campos} WHERE id = :id AND user_id = :userId`,
              data,
            );
            input.flash('success', 'Regra atualizada.');
          } else {
            await execute(
              `INSERT INTO cobrancas (user_id, titulo, descricao, tipo, gatilho, tipo_periodo, periodo, status, automatica,
              mensagem_id, hora_envio, dias_semana, min_delay, max_delay, envio_lotes, lote_tamanho, lote_pausa, rodape_antiban,
              filtro_servidor, filtro_plano, filtro_arquivados, ultima_execucao)
         VALUES (:userId, :titulo, :descricao, :tipo, :gatilho, :tipoPeriodo, :periodo, :status, :automatica,
              :mensagemId, :horaEnvio, :diasSemana, :minDelay, :maxDelay, :envioLotes, :loteTamanho, :lotePausa, :rodapeAntiban,
              :filtroServidor, :filtroPlano, :filtroArquivados, '1970-01-01 00:00:00')`,
              data,
            );
            input.flash('success', 'Regra criada.');
          }
          return reply.redirect('/automacao');
        } catch (error) {
          raiseWorkflowError(error);
        }
      }),
    recipients: (input) =>
      workflowResult(input, async (reply) => {
        try {
          const userId = input.session.user.id;
          const id = Number(input.params.id);
          const regra = await queryOne(
            'SELECT tipo, periodo, filtro_servidor AS filtroServidor, filtro_plano AS filtroPlano, filtro_arquivados AS filtroArquivados FROM cobrancas WHERE id = :id AND user_id = :userId LIMIT 1',
            { id, userId },
          );
          if (!regra) return reply.json({ ok: false, clientes: [] });
          const { from, params } = consultaDestinatariosCobranca(
            userId,
            regra,
            appTodayIso(),
          );
          const clientes = await queryRows(
            `SELECT id, nome, telefone, vencimento, plano, servidor, valor, acessoChave ${from} ORDER BY nome ASC, acessoChave = 'principal' DESC LIMIT 300`,
            params,
          );
          reply.json({
            ok: true,
            clientes: agruparAvisosCobranca(clientes, regra),
          });
        } catch (error) {
          raiseWorkflowError(error);
        }
      }),
  };
}

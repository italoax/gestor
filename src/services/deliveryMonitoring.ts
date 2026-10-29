import { appTodayIso, appWeekday } from './dates.ts';
import {
  consultaDestinatariosCobranca,
  regraPorVencimento,
} from './cobrancaDestinatarios.ts';
import { dataReservaCampanha } from './campanhas.ts';
import { resumirEnviosCobranca } from './cobrancaResumo.ts';
import {
  deliveryState,
  scheduledDelivery,
  sqlInstant,
  MONITOR_CONFIRM_MS,
  utcSql,
} from '../shared/deliveryMonitoring.ts';

export function deliveryIssues(
  snapshot,
  whatsapp: 'connected' | 'disconnected' | 'unknown' | 'missing',
) {
  if (!snapshot.enabled) return [];
  const active = snapshot.rules.some((rule) => rule.active);
  const issues: Array<{
    key: string;
    title: string;
    message: string;
    url: string;
    confirmMs: number;
  }> = [];
  const add = (
    key,
    title,
    message,
    confirmMs = 0,
    url = '/automacao?aba=central',
  ) => issues.push({ key, title, message, url, confirmMs });
  if (
    active &&
    ['stale', 'stopped', 'unconfirmed', 'error'].includes(
      snapshot.scheduler.state,
    )
  )
    add(
      'scheduler',
      'Agendador precisa de atenção',
      'O agendador não confirmou uma verificação recente. Os próximos envios podem atrasar.',
      MONITOR_CONFIRM_MS,
    );
  if (active && whatsapp !== 'connected')
    add(
      'whatsapp',
      whatsapp === 'missing'
        ? 'WhatsApp não cadastrado'
        : 'WhatsApp sem conexão confirmada',
      whatsapp === 'missing'
        ? 'Cadastre um dispositivo para realizar os envios automáticos.'
        : 'Confira a conexão do WhatsApp para evitar falhas nos próximos envios.',
      MONITOR_CONFIRM_MS,
      '/whatsapp',
    );
  for (const rule of snapshot.rules) {
    if (rule.configurationError) {
      if (rule.active)
        add(
          `configuration:${rule.id}`,
          `Confira a regra: ${rule.title}`,
          'A configuração desta regra precisa ser revisada.',
        );
      continue;
    }
    if (!rule.total) continue;
    if (rule.state === 'falha' || rule.state === 'incerto') {
      add(
        `failure:${rule.id}`,
        `Confira os envios: ${rule.title}`,
        rule.state === 'incerto'
          ? 'Há mensagens sem confirmação. Confira no WhatsApp; elas não serão repetidas automaticamente.'
          : 'Há falhas no lote. Corrija a causa e recupere somente os pendentes.',
      );
      continue;
    }
    if (!rule.active) continue;
    if (!rule.automatic)
      add(
        `configuration:${rule.id}`,
        `Automático desativado: ${rule.title}`,
        'A regra está ativa, mas o envio automático está desligado. Edite e salve a regra para corrigir.',
      );
    else if (rule.state === 'atrasado')
      add(
        `late:${rule.id}`,
        `Envio atrasado: ${rule.title}`,
        `${rule.pending} cliente(s) ainda aguardam o envio previsto. Confira os pendentes antes de recuperar.`,
      );
    else if (
      rule.state === 'enviando' &&
      rule.lastAttemptAt &&
      Date.parse(snapshot.serverNow) - Date.parse(rule.lastAttemptAt) >
        15 * 60_000
    )
      add(
        `stalled:${rule.id}`,
        `Envio sem atualização: ${rule.title}`,
        'Uma tentativa está sem resultado há mais de 15 minutos. Confira no WhatsApp antes de repetir.',
      );
  }
  return issues;
}

export function createDeliveryMonitoring({
  queryRows,
  ensureSchema,
  getHealth,
  enabled,
  externalStatus = async () => null,
  now = () => new Date(),
}) {
  return {
    async snapshot(userId: number, requestedPage = 1) {
      await ensureSchema();
      const date = now();
      const today = appTodayIso(date);
      const page =
        Number.isSafeInteger(requestedPage) && requestedPage > 0
          ? Math.min(100000, requestedPage)
          : 1;
      const [scheduler, external, rules, attempts, incidents] =
        await Promise.all([
          getHealth(),
          externalStatus(),
          queryRows(
            `SELECT c.id,c.titulo,c.tipo,c.periodo,c.status,c.automatica,c.hora_envio AS horaEnvio,c.dias_semana AS diasSemana,
          c.campanha_config AS campanhaConfig,c.filtro_servidor AS filtroServidor,c.filtro_plano AS filtroPlano,c.filtro_arquivados AS filtroArquivados,
          (SELECT MAX(a.iniciado_em) FROM automation_delivery_attempts a WHERE a.cobranca_id=c.id AND a.user_id=c.user_id) AS lastAttemptAt
          FROM cobrancas c WHERE c.user_id=:userId ORDER BY c.hora_envio,c.id`,
            { userId },
          ),
          queryRows(
            `SELECT a.id,a.cobranca_id AS ruleId,a.regra_titulo AS title,a.origem AS origin,a.programado_em AS scheduledAt,
          a.iniciado_em AS startedAt,a.concluido_em AS finishedAt,a.status,a.erro AS error,COALESCE(cl.nome,'Cliente removido') AS clientName
          FROM automation_delivery_attempts a LEFT JOIN clientes cl ON cl.id=a.cliente_id AND cl.user_id=a.user_id
          WHERE a.user_id=:userId AND a.iniciado_em >= DATE_SUB(UTC_TIMESTAMP(),INTERVAL 3 MONTH)
          ORDER BY a.iniciado_em DESC,a.id DESC LIMIT 51 OFFSET ${(page - 1) * 50}`,
            { userId },
          ),
          queryRows(
            `SELECT incident_key AS incidentKey,titulo AS title,mensagem AS message,url,first_seen AS firstSeen FROM automation_incidents
          WHERE user_id=:userId AND resolved_at IS NULL ORDER BY first_seen,id LIMIT 100`,
            { userId },
          ),
        ]);
      const summaries = [];
      for (const rule of rules) {
        let summary = resumirEnviosCobranca([]),
          invalid = false;
        try {
          const reference = dataReservaCampanha(rule.campanhaConfig, today);
          const { from, params } = consultaDestinatariosCobranca(
            userId,
            rule,
            today,
          );
          const rows = await queryRows(
            `SELECT alvo.id AS clienteId,COUNT(*) AS acessos,
            SUM(ce.status='enviado') AS enviados,SUM(ce.status IN ('erro','nao_enviado')) AS falhas,
            SUM(ce.status='pendente') AS emEnvio,SUM(ce.status='incerto') AS semConfirmacao
            FROM (SELECT id,acessoChave ${from}) alvo LEFT JOIN cobrancas_envios ce ON ce.cobranca_id=:ruleId
            AND ce.cliente_id=alvo.id AND ce.acesso_chave=${regraPorVencimento(rule) ? 'alvo.acessoChave' : "'principal'"} AND ce.data_envio=:reference GROUP BY alvo.id`,
            { ...params, ruleId: rule.id, reference },
          );
          summary = resumirEnviosCobranca(rows);
        } catch (error) {
          // Configuration failures belong to one rule; database failures must remain visible.
          if (error?.code) throw error;
          invalid = true;
        }
        const scheduledAt = scheduledDelivery(rule, today, appWeekday(date));
        summaries.push({
          id: Number(rule.id),
          title: String(rule.titulo),
          active: rule.status === 'Ativo',
          automatic: Boolean(Number(rule.automatica)),
          scheduledAt,
          lastAttemptAt: sqlInstant(rule.lastAttemptAt),
          state: invalid
            ? 'falha'
            : deliveryState(rule, summary, scheduledAt, date.getTime()),
          total: summary.total,
          sent: summary.enviados,
          pending: summary.pendentes,
          failed: summary.falhas,
          uncertain: summary.semConfirmacao,
          configurationError: invalid,
          detail: invalid
            ? 'A configuração desta regra precisa ser revisada.'
            : summary.detalhe,
          recoverable:
            !rule.campanhaConfig && summary.pendentes + summary.falhas > 0,
        });
      }
      return {
        enabled: enabled(),
        serverNow: date.toISOString(),
        scheduler,
        external,
        rules: summaries,
        alerts: incidents.map((item) => ({
          key: String(item.incidentKey),
          title: String(item.title),
          message: String(item.message),
          url: String(item.url),
          firstSeen: sqlInstant(item.firstSeen),
        })),
        history: { page, hasMore: attempts.length > 50 },
        attempts: attempts.slice(0, 50).map((item) => ({
          id: String(item.id),
          ruleId: Number(item.ruleId),
          title: String(item.title),
          origin: item.origin === 'manual' ? 'manual' : 'automatico',
          clientName: String(item.clientName),
          scheduledAt: sqlInstant(item.scheduledAt),
          startedAt: sqlInstant(item.startedAt),
          finishedAt: sqlInstant(item.finishedAt),
          status: String(item.status),
          error: item.error ? String(item.error) : null,
          delayMinutes:
            item.origin === 'automatico' &&
            item.scheduledAt &&
            sqlInstant(item.startedAt)
              ? Math.max(
                  0,
                  Math.floor(
                    (Date.parse(sqlInstant(item.startedAt)!) -
                      Date.parse(sqlInstant(item.scheduledAt)!)) /
                      60_000,
                  ),
                )
              : null,
        })),
      };
    },
  };
}

export function createIncidentSynchronizer({
  withTransaction,
  push,
  now = () => new Date(),
}) {
  return async function synchronize(
    userId: number,
    issues: ReturnType<typeof deliveryIssues>,
  ) {
    const date = now(),
      timestamp = utcSql(date);
    const notifications = await withTransaction(async (connection) => {
      await connection.query(
        'SELECT id FROM users WHERE id=:userId FOR UPDATE',
        { userId },
      );
      const [previous] = await connection.query(
        'SELECT * FROM automation_incidents WHERE user_id=:userId FOR UPDATE',
        { userId },
      );
      const keys = new Set(issues.map((issue) => issue.key));
      for (const old of previous)
        if (!old.resolved_at && !keys.has(old.incident_key)) {
          await connection.execute(
            'UPDATE automation_incidents SET resolved_at=:timestamp,last_seen=:timestamp WHERE id=:id AND user_id=:userId',
            { id: old.id, userId, timestamp },
          );
          if (old.notification_id)
            await connection.execute(
              "UPDATE notificacoes SET lida=1 WHERE id=:id AND user_id=:userId AND tipo='automacao' AND lida=0",
              { id: old.notification_id, userId },
            );
        }
      const notifications = [];
      for (const issue of issues) {
        const old = previous.find((item) => item.incident_key === issue.key);
        const continuing = old && !old.resolved_at;
        const firstSeen = continuing
          ? sqlInstant(old.first_seen)
          : date.toISOString();
        const notificationId = continuing ? old.notification_id : null;
        await connection.execute(
          `INSERT INTO automation_incidents (user_id,incident_key,titulo,mensagem,url,first_seen,last_seen)
          VALUES (:userId,:key,:title,:message,:url,:firstSeen,:timestamp)
          ON DUPLICATE KEY UPDATE titulo=VALUES(titulo),mensagem=VALUES(mensagem),url=VALUES(url),
          first_seen=VALUES(first_seen),last_seen=VALUES(last_seen),resolved_at=NULL,notification_id=:notificationId`,
          {
            userId,
            ...issue,
            firstSeen: utcSql(new Date(firstSeen!)),
            timestamp,
            notificationId,
          },
        );
        if (
          notificationId ||
          date.getTime() - Date.parse(firstSeen!) < issue.confirmMs
        )
          continue;
        const [insert] = await connection.execute(
          `INSERT INTO notificacoes (user_id,titulo,mensagem,tipo,url,icone)
          VALUES (:userId,:title,:message,'automacao',:url,'alert')`,
          { userId, ...issue },
        );
        await connection.execute(
          'UPDATE automation_incidents SET notification_id=:notificationId WHERE user_id=:userId AND incident_key=:key',
          { userId, key: issue.key, notificationId: insert.insertId },
        );
        notifications.push({
          title: issue.title,
          body: issue.message,
          url: issue.url,
          tag: `automacao-${issue.key}`,
        });
      }
      return notifications;
    });
    for (const notification of notifications) await push(userId, notification);
  };
}

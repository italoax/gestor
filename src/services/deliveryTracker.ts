import { randomUUID } from 'node:crypto';
import { appTodayIso, appWeekday } from './dates.ts';
import {
  scheduledDelivery,
  utcSql,
  deliveryFailureMessage,
  type DeliveryTracker,
} from '../shared/deliveryMonitoring.ts';

export function createDeliveryTracker({
  ensureSchema,
  execute,
  now = () => new Date(),
}): DeliveryTracker {
  return {
    async begin(rule, client, origin, reference) {
      await ensureSchema();
      const id = randomUUID();
      const scheduled =
        origin === 'automatico'
          ? scheduledDelivery(
              rule,
              appTodayIso(reference),
              appWeekday(reference),
            )
          : null;
      await execute(
        `INSERT INTO automation_delivery_attempts
        (id,user_id,cobranca_id,cliente_id,regra_titulo,origem,programado_em,iniciado_em,status)
        VALUES (:id,:userId,:ruleId,:clientId,:title,:origin,:scheduled,:started,'pendente')`,
        {
          id,
          userId: rule.userId,
          ruleId: rule.id,
          clientId: client.id,
          title: String(rule.titulo || `Regra ${rule.id}`).slice(0, 190),
          origin,
          scheduled: scheduled ? utcSql(new Date(scheduled)) : null,
          started: utcSql(now()),
        },
      );
      return id;
    },
    async finish(id, result) {
      await execute(
        `UPDATE automation_delivery_attempts SET status=:status, erro=:error, concluido_em=:finished WHERE id=:id AND status='pendente'`,
        {
          id,
          finished: utcSql(now()),
          status: result.ok
            ? 'enviado'
            : result.retrySafe === true
              ? 'nao_enviado'
              : 'incerto',
          error: result.ok ? null : deliveryFailureMessage(result.error),
        },
      );
    },
  };
}

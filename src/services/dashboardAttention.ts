export interface DashboardAttention {
  date: string;
  renewals: { count: number; amount: number };
  deliveries: { failed: number; uncertain: number };
  dueToday: { count: number; amount: number };
  dueTomorrow: { count: number; amount: number };
}

export async function loadDashboardAttention(
  queryRows,
  userId: number,
  today: string,
): Promise<DashboardAttention> {
  const [payments, deliveries, clients] = await Promise.all([
    queryRows(
      `SELECT COUNT(*) AS total, COALESCE(SUM(p.valor), 0) AS amount
         FROM pagamentos p
         JOIN clientes c ON c.id = p.cliente_id AND c.user_id = p.user_id
        WHERE p.user_id = :userId AND p.status = 'approved' AND p.renovado_em IS NULL
          AND EXISTS (SELECT 1 FROM notificacoes n
                       WHERE n.pagamento_id = p.id AND n.user_id = p.user_id)`,
      { userId },
    ),
    queryRows(
      `SELECT COALESCE(SUM(ce.status IN ('erro', 'nao_enviado')), 0) AS failed,
              COALESCE(SUM(ce.status = 'incerto'), 0) AS uncertain
         FROM cobrancas_envios ce
         JOIN cobrancas r ON r.id = ce.cobranca_id
         JOIN clientes c ON c.id = ce.cliente_id AND c.user_id = r.user_id
        WHERE r.user_id = :userId AND ce.status IN ('erro', 'nao_enviado', 'incerto')
          AND (ce.data_envio = :today OR
            (JSON_UNQUOTE(JSON_EXTRACT(r.campanha_config, '$.modo')) = 'unico'
             AND DATE(ce.updated_at - INTERVAL 3 HOUR) = :today))`,
      { userId, today },
    ),
    queryRows(
      `SELECT COALESCE(SUM(vencimento = :today), 0) AS todayCount,
              COALESCE(SUM(CASE WHEN vencimento = :today THEN valor ELSE 0 END), 0) AS todayAmount,
              COALESCE(SUM(vencimento = DATE_ADD(:today, INTERVAL 1 DAY)), 0) AS tomorrowCount,
              COALESCE(SUM(CASE WHEN vencimento = DATE_ADD(:today, INTERVAL 1 DAY) THEN valor ELSE 0 END), 0) AS tomorrowAmount
         FROM clientes WHERE user_id = :userId AND arquivado = 0 AND status = 'Ativo'
          AND vencimento BETWEEN :today AND DATE_ADD(:today, INTERVAL 1 DAY)`,
      { userId, today },
    ),
  ]);
  const payment = payments[0] || {};
  const delivery = deliveries[0] || {};
  const client = clients[0] || {};
  return {
    date: today,
    renewals: {
      count: Number(payment.total || 0),
      amount: Number(payment.amount || 0),
    },
    deliveries: {
      failed: Number(delivery.failed || 0),
      uncertain: Number(delivery.uncertain || 0),
    },
    dueToday: {
      count: Number(client.todayCount || 0),
      amount: Number(client.todayAmount || 0),
    },
    dueTomorrow: {
      count: Number(client.tomorrowCount || 0),
      amount: Number(client.tomorrowAmount || 0),
    },
  };
}

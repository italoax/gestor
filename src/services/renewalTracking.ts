import { utcTimestamp } from '../shared/displayDate.ts';
export function renewalTrackingData(row: any) {
  return {
    id: Number(row.id),
    stage: row.renovadoEm ? 'renewed' : 'waiting',
    amount: Number(row.valor || 0),
    paidAt: utcTimestamp(row.pagoEm),
    renewedAt: utcTimestamp(row.renovadoEm),
  };
}

export async function portalRenewals(
  queryRows,
  userId: number,
  clientId: number,
) {
  const rows = await queryRows(
    `SELECT id, valor, pago_em AS pagoEm, renovado_em AS renovadoEm
       FROM pagamentos WHERE user_id = :userId AND cliente_id = :clientId AND status = 'approved'
       ORDER BY (renovado_em IS NULL) DESC, id DESC LIMIT 5`,
    { userId, clientId },
  );
  return rows.map(renewalTrackingData);
}

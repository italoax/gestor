export const DELIVERY_LATE_MS = 5 * 60_000;
export const MONITOR_CONFIRM_MS = 2 * 60_000;
export type DeliveryOrigin = 'automatico' | 'manual';
export type DeliveryState =
  | 'agendado'
  | 'atrasado'
  | 'enviando'
  | 'enviado'
  | 'falha'
  | 'incerto'
  | 'inativo'
  | 'vazio';

export function utcSql(date = new Date()) {
  return date.toISOString().slice(0, 19).replace('T', ' ');
}
export function sqlInstant(value: unknown): string | null {
  if (!value) return null;
  const raw =
    value instanceof Date
      ? value.toISOString()
      : String(value).trim().replace(' ', 'T');
  const date = new Date(/(?:Z|[+-]\d{2}:?\d{2})$/i.test(raw) ? raw : raw + 'Z');
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}
export function scheduledDelivery(
  rule,
  today: string,
  weekday: number,
): string | null {
  let campaign;
  try {
    campaign =
      typeof rule.campanhaConfig === 'string'
        ? JSON.parse(rule.campanhaConfig)
        : rule.campanhaConfig;
  } catch {
    return null;
  }
  const date = campaign?.modo === 'unico' ? campaign.data : today;
  if (date > today) return null;
  if (campaign?.modo !== 'unico') {
    const days = String(rule.diasSemana ?? '')
      .split(',')
      .filter((day) => day.trim() !== '')
      .map(Number);
    if (
      days.length &&
      !days.includes(weekday) &&
      !(weekday === 0 && days.includes(7))
    )
      return null;
  }
  const time = String(rule.horaEnvio || '00:00').slice(0, 5);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)
  )
    return null;
  return new Date(`${date}T${time}:00-03:00`).toISOString();
}
export function deliveryState(
  rule,
  summary,
  scheduledAt: string | null,
  now: number,
): DeliveryState {
  if (summary.semConfirmacao) return 'incerto';
  if (summary.falhas) return 'falha';
  if (rule.status !== 'Ativo' || !Number(rule.automatica)) return 'inativo';
  if (!summary.total) return 'vazio';
  if (summary.emEnvio) return 'enviando';
  if (summary.enviados === summary.total) return 'enviado';
  return scheduledAt && now >= Date.parse(scheduledAt) + DELIVERY_LATE_MS
    ? 'atrasado'
    : 'agendado';
}
export function deliveryFailureMessage(value: unknown) {
  const text = String(value || '');
  if (/sem.*dispositivo|dispositivo.*cadastrad/i.test(text))
    return 'Cadastre um dispositivo WhatsApp para realizar o envio.';
  if (/token|unauthor|forbidden|autentic/i.test(text))
    return 'A API recusou a autenticação. Confira a integração do WhatsApp.';
  if (/conect|socket|timeout|timedout|fetch|network|ECONN|abort/i.test(text))
    return 'O WhatsApp não confirmou o envio. Confira a conexão antes de recuperar os pendentes.';
  if (/telefone|número|numero|destinat.rio/i.test(text))
    return 'Confira o telefone do destinatário.';
  if (/pix|chave|titular/i.test(text))
    return 'Confira os dados da chave PIX nas configurações.';
  return 'Não foi possível confirmar o envio. Confira a integração e os dados do cliente.';
}
export interface DeliveryTracker {
  begin(
    rule: any,
    client: any,
    origin: DeliveryOrigin,
    reference: Date,
  ): Promise<string>;
  finish(
    id: string,
    result: { ok: boolean; error?: string; retrySafe?: boolean },
  ): Promise<void>;
}

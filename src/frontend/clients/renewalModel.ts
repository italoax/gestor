import { formatDateBr, normalizeDateInput } from '../../services/format.ts';
import { consumoRenovacao } from '../../services/creditos.ts';

export function todayInSaoPaulo(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const get = (type) => parts.find((part) => part.type === type).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export function periodInMonths(type) {
  return /^mes/.test(
    String(type || '')
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .toLowerCase()
      .trim(),
  );
}

export function addRenewalPeriod(value, period, type, count = 1) {
  const iso = normalizeDateInput(value);
  if (!iso) return '';
  const [year, month, day] = iso.split('-').map(Number);
  const amount = Number(period) * Number(count);
  let date;
  if (periodInMonths(type)) {
    const first = new Date(Date.UTC(year, month - 1 + amount, 1));
    const lastDay = new Date(
      Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0),
    ).getUTCDate();
    date = new Date(
      Date.UTC(
        first.getUTCFullYear(),
        first.getUTCMonth(),
        Math.min(day, lastDay),
      ),
    );
  } else date = new Date(Date.UTC(year, month - 1, day + amount));
  return date.toISOString().slice(0, 10);
}

export function renewalBase(expiration, today = todayInSaoPaulo()) {
  const iso = normalizeDateInput(expiration);
  return iso && iso > today ? iso : today;
}

export function calculateRenewal(single, plans, servers) {
  const plan =
    plans.find((p) => p.nome === single.plano) || single.originalPlan;
  const server =
    servers.find((s) => s.nome === single.servidor) || single.originalServer;
  const count = Number(single.creditos_gastos);
  if (!Number.isSafeInteger(count) || count < 1) return single;
  const credits = consumoRenovacao(
    Math.max(1, Number(single.telas) || 1),
    count,
    Number(plan?.creditoGastos) || 1,
  );
  const period = Number(plan?.periodo) || 30;
  const duration = period * count;
  const unit = periodInMonths(plan?.tipo)
    ? duration === 1
      ? 'mês'
      : 'meses'
    : duration === 1
      ? 'dia'
      : 'dias';
  return {
    ...single,
    vencimento: formatDateBr(
      addRenewalPeriod(single.base, period, plan?.tipo, count),
    ),
    valor: (Number(single.basePrice) * count).toFixed(2),
    custo_pagamento: (credits * (Number(server?.valorCred) || 0)).toFixed(2),
    summary: `Renova por ${duration} ${unit}. Consumo: ${credits.toLocaleString('pt-BR')} créditos do servidor.`,
  };
}

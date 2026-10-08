import {
  badgeStatusByVencimento,
  formatDateBr,
  formatDateInput,
  formatMoney,
  statusByVencimento,
  statusUrgency,
} from '../services/format.js';

export function exposeFormatLocals(_req, res, next) {
  res.locals.formatMoney = formatMoney;
  res.locals.formatDateBr = formatDateBr;
  res.locals.formatDateInput = formatDateInput;
  res.locals.badgeStatusByVencimento = badgeStatusByVencimento;
  res.locals.statusByVencimento = statusByVencimento;
  res.locals.statusUrgency = statusUrgency;
  next();
}

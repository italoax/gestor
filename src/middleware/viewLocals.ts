import { renderClientPage } from '../services/clientPage.ts';
import { describeNoticeError } from '../browser/assets/js/ui/panel-feedback.ts';
import {
  badgeStatusByVencimento,
  formatDateBr,
  formatDateInput,
  formatMoney,
  statusByVencimento,
  statusUrgency,
} from '../services/format.ts';

export function exposeFormatLocals(_req, res, next) {
  res.locals.describeNoticeError = describeNoticeError;
  res.locals.renderClientPage = renderClientPage;
  res.locals.formatMoney = formatMoney;
  res.locals.formatDateBr = formatDateBr;
  res.locals.formatDateInput = formatDateInput;
  res.locals.badgeStatusByVencimento = badgeStatusByVencimento;
  res.locals.statusByVencimento = statusByVencimento;
  res.locals.statusUrgency = statusUrgency;
  next();
}

import { createPaymentConfirmationWorkflow } from '../services/paymentConfirmation.js';
import { queryOne } from '../db/mysql.js';
import { renovarClienteAutomatico } from '../services/autoRenovacao.js';
import { renovarPlanosDoCliente } from '../services/renovacaoConjunta.js';
import { CreditosError } from '../services/creditos.js';
import { sincronizarAlertasCreditos } from '../services/notificacoes.js';
export function createDefaultPaymentConfirmation() {
  return createPaymentConfirmationWorkflow({
    queryOne,
    renovarClienteAutomatico,
    renovarPlanosDoCliente,
    CreditosError,
    sincronizarAlertasCreditos,
  });
}

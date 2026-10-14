import { createPaymentConfirmationWorkflow } from '../services/paymentConfirmation.ts';
import { queryOne } from '../db/mysql.ts';
import { renovarClienteAutomatico } from '../services/autoRenovacao.ts';
import { renovarPlanosDoCliente } from '../services/renovacaoConjunta.ts';
import { CreditosError } from '../services/creditos.ts';
import { sincronizarAlertasCreditos } from '../services/notificacoes.ts';
export function createDefaultPaymentConfirmation() {
  return createPaymentConfirmationWorkflow({
    queryOne,
    renovarClienteAutomatico,
    renovarPlanosDoCliente,
    CreditosError,
    sincronizarAlertasCreditos,
  });
}

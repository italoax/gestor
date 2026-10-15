import { createPaymentWorkflow } from '../services/paymentWorkflow.ts';
import { execute, queryOne, queryRows, withTransaction } from '../db/mysql.ts';
import { env } from '../config/env.ts';
import {
  configDoProvider,
  escolherProvedor,
  getProvider,
  normalizeStatus,
} from '../services/paymentProvider.ts';
import { formatMoney, formatDateBr } from '../services/format.ts';
import { registrarPagamentoPendente } from '../services/renovacoesPendentes.ts';
import { enviarConfirmacaoPix } from '../services/mensagemPix.ts';
import { tokenPagamentoOriginal } from '../services/linkPagamentoUrl.ts';
import { escolhasRenovacao } from '../services/renovacaoOpcoes.ts';
export function createDefaultPaymentWorkflow() {
  return createPaymentWorkflow({
    execute,
    queryOne,
    queryRows,
    withTransaction,
    env,
    configDoProvider,
    escolherProvedor,
    getProvider,
    normalizeStatus,
    formatMoney,
    formatDateBr,
    registrarPagamentoPendente,
    enviarConfirmacaoPix,
    tokenPagamentoOriginal,
    escolhasRenovacao,
  });
}
export { urlPagamentoDoCliente } from '../services/linkCliente.ts';

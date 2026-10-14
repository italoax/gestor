import { createPaymentWorkflow } from '../services/paymentWorkflow.js';
import { execute, queryOne } from '../db/mysql.js';
import { env } from '../config/env.js';
import {
  configDoProvider,
  escolherProvedor,
  getProvider,
  normalizeStatus,
} from '../services/paymentProvider.js';
import { formatMoney, formatDateBr } from '../services/format.js';
import { registrarPagamentoPendente } from '../services/renovacoesPendentes.js';
import { enviarConfirmacaoPix } from '../services/mensagemPix.js';
import { tokenPagamentoOriginal } from '../services/linkPagamentoUrl.js';
import { escolhasRenovacao } from '../services/renovacaoOpcoes.js';
export function createDefaultPaymentWorkflow() {
  return createPaymentWorkflow({
    execute,
    queryOne,
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
export { urlPagamentoDoCliente } from '../services/linkCliente.js';

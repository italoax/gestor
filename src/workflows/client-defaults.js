import { createClientMutationWorkflow } from '../services/clientMutations.js';
import crypto from 'node:crypto';
import { execute, queryOne, queryRows, withTransaction } from '../db/mysql.js';
import { appNowSql, appTodayIso } from '../services/dates.js';
import {
  boolField,
  normalizeDateInput,
  toNullableString,
  toNumber,
} from '../services/format.js';
import { enviarMensagemModelo } from '../services/whatsapp.js';
import { getPixConfig } from '../services/pixConfig.js';
import {
  CreditosError,
  consumoRenovacao,
  debitarCreditos,
} from '../services/creditos.js';
import { verificarCreditosServidor } from '../services/autoRenovacao.js';
import { decryptSecret } from '../services/crypto.js';
import { sigmaLoginAndRenew } from '../services/sigma.js';
import { lerPlanoAdicional } from '../services/renovacaoOpcoes.js';
import {
  renovarPlanosDoCliente,
  validarPlanoAdicional,
} from '../services/renovacaoConjunta.js';
export function createDefaultClientMutationWorkflow() {
  return createClientMutationWorkflow({
    crypto,
    execute,
    queryOne,
    queryRows,
    withTransaction,
    appNowSql,
    appTodayIso,
    boolField,
    normalizeDateInput,
    toNullableString,
    toNumber,
    enviarMensagemModelo,
    getPixConfig,
    CreditosError,
    consumoRenovacao,
    debitarCreditos,
    verificarCreditosServidor,
    decryptSecret,
    sigmaLoginAndRenew,
    lerPlanoAdicional,
    renovarPlanosDoCliente,
    validarPlanoAdicional,
  });
}

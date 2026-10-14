import { createClientMutationWorkflow } from '../services/clientMutations.ts';
import crypto from 'node:crypto';
import { execute, queryOne, queryRows, withTransaction } from '../db/mysql.ts';
import { appNowSql, appTodayIso } from '../services/dates.ts';
import {
  boolField,
  normalizeDateInput,
  toNullableString,
  toNumber,
} from '../services/format.ts';
import { enviarMensagemModelo } from '../services/whatsapp.ts';
import { getPixConfig } from '../services/pixConfig.ts';
import {
  CreditosError,
  consumoRenovacao,
  debitarCreditos,
} from '../services/creditos.ts';
import { verificarCreditosServidor } from '../services/autoRenovacao.ts';
import { decryptSecret } from '../services/crypto.ts';
import { sigmaLoginAndRenew } from '../services/sigma.ts';
import { lerPlanoAdicional } from '../services/renovacaoOpcoes.ts';
import {
  renovarPlanosDoCliente,
  validarPlanoAdicional,
} from '../services/renovacaoConjunta.ts';
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

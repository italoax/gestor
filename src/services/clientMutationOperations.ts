import { createHash, randomUUID } from 'node:crypto';

const guardedActions = new Set([
  'create_cliente',
  'add_pagamento',
  'renovar_planos',
]);

export function clientOperationHash(body: Record<string, unknown>) {
  // Tokens de sessão e chaves de modal mudam ao reabrir a mesma operação.
  // Guarda somente o hash; senhas e conteúdo do formulário não vão para o registro.
  const fields = Object.entries(body)
    .filter(
      ([key, value]) =>
        !['_csrf', 'chave', 'userId', 'senha'].includes(key) &&
        value !== undefined &&
        value !== null &&
        String(value) !== '',
    )
    .map(([key, value]) => [key, String(value)])
    .sort(([left], [right]) => left.localeCompare(right));
  return createHash('sha256').update(JSON.stringify(fields)).digest('hex');
}

export function createClientOperationGuard({
  ensureSchema,
  queryOne,
  execute,
  sendMessage,
}) {
  return async (userId, body, run) => {
    if (!guardedActions.has(String(body.action))) return run(sendMessage);
    await ensureSchema();
    // Somente operações concluídas expiram. Um processo interrompido pode ter
    // enviado a mensagem: reservas pendentes/incertas nunca são reenviadas por timeout.
    await execute(
      `DELETE FROM client_mutation_operations
       WHERE status = 'concluido' AND completed_at < DATE_SUB(NOW(), INTERVAL 10 MINUTE)
       LIMIT 100`,
    );
    const params = {
      userId,
      operationHash: clientOperationHash(body),
      claimToken: randomUUID(),
    };
    // Autocommit antes da transação de negócio: rollback da renovação não pode
    // apagar a reserva de uma mensagem que já saiu para um serviço externo.
    await execute(
      `INSERT IGNORE INTO client_mutation_operations
       (user_id, operation_hash, claim_token, status)
       VALUES (:userId, :operationHash, :claimToken, 'pendente')`,
      params,
    );
    const claim = await queryOne(
      `SELECT claim_token AS claimToken, status, result_json AS resultJson
       FROM client_mutation_operations WHERE user_id = :userId AND operation_hash = :operationHash`,
      params,
    );
    if (!claim) throw new Error('Não foi possível reservar a operação.');
    if (claim.claimToken !== params.claimToken) {
      if (claim.resultJson) return JSON.parse(claim.resultJson);
      return {
        redirect: '/clientes',
        notices: [
          {
            type: 'modal-error',
            message:
              'Esta operação já está em processamento ou aguarda confirmação. Confira o cadastro e a conversa antes de tentar novamente.',
          },
        ],
      };
    }
    let mayHaveSent = false;
    let unconfirmed = false;
    const guardedSend = async (...args) => {
      // Mesmo uma exceção pode ocorrer depois de o WhatsApp aceitar o envio.
      const previouslySent = mayHaveSent;
      mayHaveSent = true;
      const result = await sendMessage(...args);
      const rejected =
        !result.ok && result.retrySafe === true && !result.pending;
      mayHaveSent = previouslySent || !rejected;
      unconfirmed ||= !rejected && !(result.ok && result.confirmed === true);
      return result;
    };
    const release = () =>
      execute(
        `DELETE FROM client_mutation_operations
       WHERE user_id = :userId AND operation_hash = :operationHash AND claim_token = :claimToken`,
        params,
      );
    const finish = (status, result) =>
      execute(
        `UPDATE client_mutation_operations SET status = :status, result_json = :resultJson, completed_at = CURRENT_TIMESTAMP
       WHERE user_id = :userId AND operation_hash = :operationHash AND claim_token = :claimToken`,
        {
          ...params,
          status,
          resultJson: result ? JSON.stringify(result) : null,
        },
      );
    try {
      const result = await run(guardedSend);
      const succeeded = result.notices.some(({ type }) =>
        ['success', 'modal-success'].includes(type),
      );
      if (!succeeded && !mayHaveSent) await release();
      else
        await finish(
          unconfirmed || !succeeded ? 'incerto' : 'concluido',
          result,
        );
      return result;
    } catch (error) {
      if (mayHaveSent) await finish('incerto', null);
      else await release();
      throw error;
    }
  };
}

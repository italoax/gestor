export function createPaymentConfirmationWorkflow({
  queryOne,
  renovarClienteAutomatico,
  renovarPlanosDoCliente,
  CreditosError,
  sincronizarAlertasCreditos,
}) {
  const json = (status, data) => ({ kind: 'json' as const, status, data });
  return async function confirm(userId, paymentId) {
    try {
      const id = Number(paymentId);
      if (!Number.isSafeInteger(id) || id <= 0)
        return json(400, { ok: false, error: 'Pagamento inválido.' });
      const pagamento = await queryOne(
        "SELECT cliente_id AS clienteId, renovacao_dados AS dados FROM pagamentos WHERE id = :id AND user_id = :userId AND status = 'approved' AND renovado_em IS NULL",
        { id, userId },
      );
      if (!pagamento)
        return json(404, {
          ok: false,
          error: 'Pagamento não encontrado ou renovação já confirmada.',
        });
      if (pagamento.dados && JSON.parse(pagamento.dados).versao === 1) {
        try {
          const resultado = await renovarPlanosDoCliente(
            userId,
            Number(pagamento.clienteId),
            { pagamentoId: id },
          );
          await sincronizarAlertasCreditos(userId);
          return json(200, {
            ok: true,
            vencimentos: resultado.itens.map((item) => ({
              plano: item.plano,
              vencimento: item.vencimento,
            })),
          });
        } catch (error) {
          if (error instanceof CreditosError)
            return json(409, { ok: false, error: error.message });
          throw error;
        }
      }
      const resultado = await renovarClienteAutomatico(
        userId,
        Number(pagamento.clienteId),
        0,
        1,
        undefined,
        id,
      );
      if (!resultado.renovado)
        return json(409, {
          ok: false,
          error: resultado.motivo || 'Não foi possível confirmar a renovação.',
        });
      return json(200, { ok: true, novoVencimento: resultado.novoVencimento });
    } catch (error) {
      throw error;
    }
  };
}

export class CreditosError extends Error {}
export function consumoRenovacao(telas, periodos, creditosPorPeriodo = 1) {
  if (
    !Number.isSafeInteger(telas) ||
    telas < 1 ||
    !Number.isSafeInteger(periodos) ||
    periodos < 1 ||
    !Number.isSafeInteger(telas * periodos)
  ) {
    throw new CreditosError(
      'Informe telas e períodos inteiros, maiores que zero.',
    );
  }
  if (!Number.isFinite(creditosPorPeriodo) || creditosPorPeriodo <= 0) {
    throw new CreditosError('Consumo de créditos do plano inválido.');
  }
  const consumo = Number((telas * periodos * creditosPorPeriodo).toFixed(2));
  if (!Number.isFinite(consumo) || consumo <= 0)
    throw new CreditosError('Consumo de créditos inválido.');
  return consumo;
}
// Deve rodar na mesma transação da renovação e do lançamento financeiro.
export async function debitarCreditos(conn, userId, nome, consumo) {
  if (!Number.isFinite(consumo) || consumo <= 0)
    throw new CreditosError('Consumo de créditos inválido.');
  const [rows] = await conn.query(
    'SELECT id, creditos FROM servidores WHERE user_id = :userId AND nome = :nome LIMIT 1 FOR UPDATE',
    { userId, nome },
  );
  const servidor = rows[0];
  if (!servidor)
    throw new CreditosError(
      'Servidor não encontrado. Selecione um servidor válido antes de renovar.',
    );
  const antes = Number(servidor.creditos);
  if (!Number.isFinite(antes) || antes < consumo) {
    throw new CreditosError(
      `Créditos insuficientes no painel ${nome}. Saldo: ${antes}; necessário: ${consumo}. Recarregue para renovar.`,
    );
  }
  const [result] = await conn.execute(
    'UPDATE servidores SET creditos = creditos - :consumo WHERE id = :id AND user_id = :userId AND creditos >= :consumo',
    { id: servidor.id, userId, consumo },
  );
  if (result.affectedRows !== 1)
    throw new CreditosError(
      'Saldo insuficiente. Recarregue os créditos do painel para renovar.',
    );
  return { antes, depois: antes - consumo };
}

// O contador por conta é compartilhado entre processos e sobrevive a reinícios.
// Só cria registros para IDs existentes; nomes arbitrários não enchem a tabela.
export function createLoginAttempts(
  { execute, queryOne, audit = async (..._args: any[]) => {} },
  now = Date.now,
) {
  return {
    async consume(userId: number) {
      const time = now();
      await execute(
        `INSERT INTO auth_login_attempts (user_id, attempts, reset_at) VALUES (:userId, 1, :resetAt)
         ON DUPLICATE KEY UPDATE attempts = IF(reset_at <= :time, 1, LEAST(attempts + 1, 11)),
         reset_at = IF(reset_at <= :time, :resetAt, reset_at)`,
        { userId, time, resetAt: time + 15 * 60_000 },
      );
      const row = await queryOne(
        'SELECT attempts FROM auth_login_attempts WHERE user_id = :userId',
        { userId },
      );
      const allowed = Boolean(row) && Number(row.attempts) <= 10;
      if (row && !allowed)
        await audit('login.rate_limited', {
          userId,
          reason: 'account',
          count: Number(row.attempts),
        });
      return allowed;
    },
    async reset(userId: number) {
      await execute('DELETE FROM auth_login_attempts WHERE user_id = :userId', {
        userId,
      });
    },
  };
}

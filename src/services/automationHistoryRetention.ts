import { automationHistoryCutoff } from './automationHistory.ts';

// A exclusão usa também a data da reserva para preservar envios atuais ou futuros.
// Não altera regras, clientes ou agendamentos.
export function createAutomationHistoryRetention({
  enabled,
  today,
  ensureSchema,
  execute,
  onError,
  onCleanup = (_deleted: number, _cutoff: string) => {},
}) {
  let timer: ReturnType<typeof setInterval> | undefined;
  let pending: Promise<void> | undefined;
  let stopping = false;
  let lastCleanedDay: string | undefined;

  function check() {
    if (stopping || !enabled()) return Promise.resolve();
    if (pending) return pending;
    const day = today();
    if (lastCleanedDay === day) return Promise.resolve();
    const cutoff = automationHistoryCutoff(day);
    pending = Promise.resolve()
      .then(async () => {
        await ensureSchema();
        let deleted = 0;
        while (!stopping && enabled()) {
          const result = await execute(
            `DELETE FROM cobrancas_envios
            WHERE data_envio < :historyCutoff
              AND updated_at < CONVERT_TZ(CONCAT(:historyCutoff, ' 00:00:00'), '-03:00', '+00:00')
            ORDER BY id LIMIT 1000`,
            { historyCutoff: cutoff },
          );
          deleted += result.affectedRows;
          if (result.affectedRows < 1000) {
            lastCleanedDay = day;
            if (deleted > 0) onCleanup(deleted, cutoff);
            return;
          }
        }
      })
      .catch(onError)
      .finally(() => {
        pending = undefined;
      });
    return pending;
  }

  return {
    check,
    start() {
      if (stopping || !enabled() || timer) return;
      // Executa ao iniciar e uma vez por dia; falhas podem tentar novamente a cada hora.
      timer = setInterval(() => void check(), 60 * 60 * 1000);
      timer.unref?.();
      void check();
    },
    async stop() {
      stopping = true;
      clearInterval(timer);
      timer = undefined;
      await pending;
    },
  };
}

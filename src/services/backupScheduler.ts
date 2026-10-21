import { env } from '../config/env.ts';
import { safeError } from '../security/safeError.ts';
import { rodarBackupAgendado } from './backup.ts';

export function createBackupScheduler({ enabled, run, onError }) {
  let timer: ReturnType<typeof setInterval> | undefined;
  let pending: Promise<void> | undefined;
  let stopping = false;

  function tick() {
    if (!enabled() || stopping || pending) return;
    pending = Promise.resolve()
      .then(run)
      .catch(onError)
      .then(() => undefined)
      .finally(() => {
        pending = undefined;
      });
    return pending;
  }

  return {
    start() {
      if (!enabled() || stopping || timer) return;
      // O backup é diário; a verificação também retoma o dia após um reinício.
      timer = setInterval(tick, 60000);
      void tick();
    },
    async stop() {
      stopping = true;
      clearInterval(timer);
      timer = undefined;
      await pending;
    },
  };
}

const scheduler = createBackupScheduler({
  enabled: () => !env.localMode,
  run: rodarBackupAgendado,
  onError: (error) =>
    console.error('Erro no backup automático:', safeError(error)),
});

export const startBackupScheduler = () => scheduler.start();
export const stopBackupScheduler = () => scheduler.stop();

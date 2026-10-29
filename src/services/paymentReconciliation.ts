export function createPaymentReconciliation({
  reconcile,
  onError = (_error: unknown) => {},
}: {
  reconcile: (afterId: number, signal: AbortSignal) => Promise<number>;
  onError?: (error: unknown) => void;
}) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pending: Promise<void> | undefined;
  let stopped = true;
  let cursor = 0;
  let controller = new AbortController();
  const tick = () => {
    if (stopped) return;
    pending = reconcile(cursor, controller.signal)
      .then((next) => {
        cursor = next;
      })
      .catch(onError)
      .finally(() => {
        pending = undefined;
        if (!stopped) timer = setTimeout(tick, 61000);
      });
  };
  return {
    start() {
      if (!stopped) return;
      stopped = false;
      controller = new AbortController();
      tick();
    },
    async stop() {
      stopped = true;
      controller.abort();
      clearTimeout(timer);
      await pending;
    },
  };
}

'use client';
import { useEffect, useRef } from 'react';
import { Icon } from '../../../../src/frontend/clients/ui.tsx';
import { initSchedulerStatus } from '../../../../src/browser/assets/js/ui/scheduler-status.ts';

export function SchedulerStatus({
  showRefresh = true,
  refreshKey = 0,
}: { showRefresh?: boolean; refreshKey?: number } = {}) {
  const container = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const controller = new AbortController();
    initSchedulerStatus(container.current, controller.signal);
    return () => controller.abort();
  }, [refreshKey]);
  return (
    <div ref={container} data-scheduler-react="">
      <section
        className="scheduler-status"
        data-scheduler-status=""
        data-state="neutral"
        aria-label="Status do agendador"
      >
        <div
          className="scheduler-status-summary"
          role="status"
          aria-live="polite"
        >
          <span className="scheduler-status-icon" aria-hidden="true">
            <Icon name="bolt" />
          </span>
          <div className="scheduler-status-copy">
            <strong data-scheduler-label="">Verificando agendador</strong>
            <span data-scheduler-check="">
              Última verificação: aguardando confirmação
            </span>
          </div>
        </div>
        {showRefresh && (
          <button
            className="scheduler-status-refresh"
            type="button"
            data-scheduler-refresh=""
            aria-label="Atualizar status do agendador"
          >
            Atualizar
          </button>
        )}
        <p
          className="scheduler-status-alert"
          data-scheduler-alert=""
          role="alert"
          hidden
        />
      </section>
    </div>
  );
}

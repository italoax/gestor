import { Icon } from '../../../../src/frontend/clients/ui.tsx';

export function SchedulerStatus() {
  return (
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
      <button
        className="scheduler-status-refresh"
        type="button"
        data-scheduler-refresh=""
        aria-label="Atualizar status do agendador"
      >
        Atualizar
      </button>
      <p
        className="scheduler-status-alert"
        data-scheduler-alert=""
        role="alert"
        hidden
      />
    </section>
  );
}

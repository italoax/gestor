import {
  SCHEDULER_STALE_MS,
  type SchedulerHealth,
} from '../../../../shared/schedulerHealth.js';

const labels: Record<SchedulerHealth['state'] | 'unavailable', string> = {
  idle: 'Agendador ativo',
  running: 'Agendador em execução',
  starting: 'Agendador iniciando',
  error: 'Falha no agendador',
  stopped: 'Agendador parado',
  stale: 'Agendador sem resposta',
  unconfirmed: 'Agendador sem confirmação',
  disabled: 'Agendador desativado',
  unavailable: 'Verificação indisponível',
};
const messages: Partial<Record<keyof typeof labels, string>> = {
  error:
    'A última verificação do agendador falhou. Os envios automáticos podem atrasar.',
  stopped:
    'O agendador foi encerrado. Os envios automáticos precisam que ele volte a funcionar.',
  stale:
    'O agendador não confirma atividade há mais de 90 segundos. Os envios automáticos podem atrasar.',
  unconfirmed:
    'Ainda não há confirmação de atividade do agendador. Os envios automáticos podem atrasar.',
  disabled: 'Os envios automáticos estão desativados neste ambiente.',
  unavailable:
    'Não foi possível consultar o agendador. Confira sua conexão e tente atualizar.',
};

function validHealth(value: any): value is SchedulerHealth {
  return (
    value &&
    Object.hasOwn(labels, value.state) &&
    value.state !== 'unavailable' &&
    Number.isFinite(Date.parse(value.serverNow)) &&
    value.staleAfterMs === SCHEDULER_STALE_MS &&
    [value.lastCheckAt, value.lastHeartbeatAt].every(
      (date) =>
        date === null ||
        (typeof date === 'string' && Number.isFinite(Date.parse(date))),
    ) &&
    (!['idle', 'running'].includes(value.state) ||
      (value.lastCheckAt !== null && value.lastHeartbeatAt !== null))
  );
}

export function initSchedulerStatus(
  shell: HTMLElement | null,
  signal: AbortSignal,
) {
  const root = shell?.querySelector<HTMLElement>('[data-scheduler-status]');
  if (!root || signal.aborted) return;
  const label = root.querySelector<HTMLElement>('[data-scheduler-label]')!;
  const timestamp = root.querySelector<HTMLElement>('[data-scheduler-check]')!;
  const alert = root.querySelector<HTMLElement>('[data-scheduler-alert]')!;
  const refresh = root.querySelector<HTMLButtonElement>(
    '[data-scheduler-refresh]',
  )!;
  let snapshot: SchedulerHealth | undefined;
  let receivedAt = 0;
  let unavailable = false;
  let pending = false;
  let unauthorized = false;
  const startedAt = Date.now();
  let timer: number;
  const format = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  function render() {
    if (signal.aborted) return;
    if (!snapshot && Date.now() - startedAt >= SCHEDULER_STALE_MS)
      unavailable = true;
    let state: keyof typeof labels = unavailable
      ? 'unavailable'
      : snapshot?.state || 'starting';
    if (
      snapshot?.lastHeartbeatAt &&
      ['idle', 'running', 'starting'].includes(state)
    ) {
      const age =
        Date.parse(snapshot.serverNow) -
        Date.parse(snapshot.lastHeartbeatAt!) +
        Math.max(0, Date.now() - receivedAt);
      if (age >= snapshot.staleAfterMs) state = 'stale';
    }
    const tone = ['idle', 'running'].includes(state)
      ? 'ok'
      : state === 'disabled' || state === 'starting'
        ? 'neutral'
        : 'warning';
    root.dataset.state = tone;
    const title =
      snapshot || unavailable ? labels[state] : 'Verificando agendador';
    if (label.textContent !== title) label.textContent = title;
    const checked = snapshot?.lastCheckAt
      ? `Última verificação: ${format.format(new Date(snapshot.lastCheckAt))} (Brasília)`
      : 'Última verificação: aguardando confirmação';
    if (timestamp.textContent !== checked) timestamp.textContent = checked;
    const message = messages[state] || '';
    if (alert.textContent !== message) alert.textContent = message;
    alert.hidden = !message;
    refresh.disabled = pending || unauthorized;
  }
  async function check() {
    if (signal.aborted || pending || unauthorized || document.hidden) return;
    if (window.gestorPolling && !window.gestorPolling.canFetch()) {
      render();
      return;
    }
    pending = true;
    render();
    try {
      const response = await fetch('/api/automacao/status', {
        headers: { Accept: 'application/json', 'x-gestor-background': '1' },
        cache: 'no-store',
        signal: AbortSignal.any([signal, AbortSignal.timeout(10_000)]),
      });
      if (signal.aborted) return;
      window.gestorPolling?.recordResponse(response);
      if (response.status === 401 || response.status === 403)
        unauthorized = true;
      if (!response.ok || response.redirected) throw new Error('Unavailable');
      const value = await response.json();
      if (signal.aborted) return;
      if (!validHealth(value)) throw new Error('Invalid status');
      snapshot = value;
      receivedAt = Date.now();
      unavailable = false;
    } catch {
      if (!signal.aborted) unavailable = true;
    } finally {
      pending = false;
      render();
    }
  }
  refresh.addEventListener('click', () => void check(), { signal });
  document.addEventListener(
    'visibilitychange',
    () => {
      render();
      if (!document.hidden) void check();
    },
    { signal },
  );
  window.addEventListener(
    'pageshow',
    () => {
      render();
      void check();
    },
    { signal },
  );
  window.addEventListener('online', () => void check(), { signal });
  let nextCheck = Date.now() + 30_000;
  timer = window.setInterval(() => {
    render();
    if (Date.now() >= nextCheck) {
      nextCheck = Date.now() + 30_000;
      void check();
    }
  }, 5000);
  signal.addEventListener('abort', () => window.clearInterval(timer), {
    once: true,
  });
  void check();
}

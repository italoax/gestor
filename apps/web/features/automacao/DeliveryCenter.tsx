'use client';
import { useEffect, useState } from 'react';
import { CsrfInput, Icon } from '../../../../src/frontend/clients/ui.tsx';
import { SchedulerStatus } from '../../components/layout/SchedulerStatus.tsx';
import { useNativeSubmit } from '../../hooks/useNativeSubmit.ts';

const labels = {
  agendado: 'Aguardando horário',
  atrasado: 'Atrasado',
  enviando: 'Em andamento',
  enviado: 'Enviado',
  falha: 'Falha no envio',
  incerto: 'Sem confirmação',
  inativo: 'Desativado',
  vazio: 'Sem destinatários',
};
const attemptLabels = {
  enviado: 'Enviado',
  pendente: 'Em andamento',
  nao_enviado: 'Não enviado',
  incerto: 'Sem confirmação',
};
function dateTime(value, timeOnly = false) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        ...(timeOnly ? {} : { day: '2-digit', month: '2-digit' }),
        hour: '2-digit',
        minute: '2-digit',
      }).format(date)
    : '—';
}
function Recover({ rule, token }) {
  const submit = useNativeSubmit(
    'Recuperar os pendentes desta regra? Envios confirmados, em andamento ou sem confirmação segura não serão repetidos.',
  );
  return (
    <form
      method="post"
      action="/automacao"
      onSubmit={submit}
      className="action-form"
    >
      <CsrfInput token={token} />
      <input type="hidden" name="action" value="dispatch_regra" />
      <input type="hidden" name="id" value={rule.id} />
      <input type="hidden" name="origem_tela" value="central" />
      <button
        className="btn btn-muted"
        type="submit"
        data-loading-text="Recuperando..."
      >
        Recuperar pendentes
      </button>
    </form>
  );
}
export function DeliveryCenter({ token }: { token?: string }) {
  const [page, setPage] = useState(1),
    [revision, setRevision] = useState(0);
  const [data, setData] = useState<any>(null),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(true);
  useEffect(() => {
    const controller = new AbortController();
    let alive = true,
      inFlight = false,
      timer: ReturnType<typeof setTimeout>,
      nextAllowed = 0;
    const load = async () => {
      if (!alive || document.hidden || inFlight) return;
      clearTimeout(timer);
      if (Date.now() < nextAllowed) {
        timer = setTimeout(load, nextAllowed - Date.now());
        return;
      }
      inFlight = true;
      try {
        const response = await fetch(`/api/automacao/central?pagina=${page}`, {
          cache: 'no-store',
          headers: { Accept: 'application/json', 'x-gestor-background': '1' },
          signal: AbortSignal.any([
            controller.signal,
            AbortSignal.timeout(15000),
          ]),
        });
        if (response.status === 429)
          nextAllowed =
            Date.now() +
            Math.max(
              60,
              Math.min(300, Number(response.headers.get('retry-after')) || 60),
            ) *
              1000;
        if (!response.ok)
          throw Error(
            'Não foi possível verificar os envios. Tente atualizar novamente.',
          );
        const value = await response.json();
        if (
          !Array.isArray(value.rules) ||
          !Array.isArray(value.attempts) ||
          !Array.isArray(value.alerts) ||
          !value.history
        )
          throw Error('Resposta de monitoramento inválida.');
        if (alive) {
          setData(value);
          setError('');
        }
      } catch (error) {
        if (alive && !controller.signal.aborted)
          setError(
            'Não foi possível verificar os envios. Tente atualizar novamente.',
          );
      } finally {
        inFlight = false;
        if (alive) {
          setLoading(false);
          timer = setTimeout(load, Math.max(60_000, nextAllowed - Date.now()));
        }
      }
    };
    setLoading(true);
    void load();
    const resume = () => {
      if (!document.hidden) void load();
    };
    document.addEventListener('visibilitychange', resume);
    return () => {
      alive = false;
      clearTimeout(timer);
      controller.abort();
      document.removeEventListener('visibilitychange', resume);
    };
  }, [page, revision]);
  const late =
    data?.rules.filter((rule) => rule.state === 'atrasado').length || 0;
  const failed =
    data?.rules.filter((rule) => ['falha', 'incerto'].includes(rule.state))
      .length || 0;
  return (
    <section className="delivery-center" aria-label="Central de envios">
      <header className="delivery-center-heading">
        <div>
          <h2>Central de envios</h2>
          <p>Acompanhe os horários e recupere os pendentes com segurança.</p>
        </div>
        <button
          className="btn btn-muted"
          type="button"
          onClick={() => setRevision((value) => value + 1)}
          disabled={loading}
        >
          <Icon name="clock" />
          {loading ? 'Verificando…' : 'Atualizar'}
        </button>
      </header>
      <SchedulerStatus showRefresh={false} refreshKey={revision} />
      {error && (
        <p className="delivery-center-alert" role="alert">
          {error} Os dados anteriores podem estar desatualizados.
        </p>
      )}
      {!data && loading && <p role="status">Carregando os envios…</p>}
      {data && (
        <>
          <div
            className="delivery-center-metrics"
            aria-label="Resumo dos envios"
          >
            <div>
              <span>Regras automáticas</span>
              <strong>
                {
                  data.rules.filter((rule) => rule.active && rule.automatic)
                    .length
                }
              </strong>
            </div>
            <div data-attention={late > 0}>
              <span>Com atraso</span>
              <strong>{late}</strong>
            </div>
            <div data-attention={failed > 0}>
              <span>Precisam de conferência</span>
              <strong>{failed}</strong>
            </div>
          </div>
          <div className="delivery-center-monitor">
            <Icon name="shield" />
            <div>
              <strong>Alertas no sino do painel</strong>
              <p>
                Para receber avisos fora do painel,{' '}
                <a href="/minha-conta#account-push-title">
                  ative as notificações neste dispositivo
                </a>
                .
              </p>
              <p>
                Envios com mais de 5 minutos de atraso geram um aviso. Falhas de
                conexão são confirmadas antes de notificar.
              </p>
              <p>
                {data.external?.active
                  ? `Verificação independente confirmada em ${dateTime(data.external.checkedAt)}.`
                  : 'Verificação independente ainda sem confirmação. O monitor da aplicação continua acompanhando o agendador.'}
              </p>
            </div>
          </div>
          {data.alerts.length > 0 && (
            <div
              className="delivery-center-alerts"
              aria-label="Alertas em aberto"
            >
              {data.alerts.map((alert) => (
                <article className="delivery-center-alert" key={alert.key}>
                  <strong>{alert.title}</strong>
                  <p>{alert.message}</p>
                  <a href={alert.url}>Conferir</a>
                </article>
              ))}
            </div>
          )}
          <section className="delivery-center-section">
            <h3>Agenda e pendências de hoje</h3>
            <p className="delivery-center-caption">
              Horários de Brasília. Sem destinatários, a regra não gera alerta
              de atraso.
            </p>
            {!data.rules.length ? (
              <p>Nenhuma regra cadastrada. Crie uma regra na aba Regras.</p>
            ) : (
              <div className="delivery-center-table-wrap">
                <table className="delivery-center-table">
                  <thead>
                    <tr>
                      <th>Regra</th>
                      <th>Programado</th>
                      <th>Situação</th>
                      <th>Clientes</th>
                      <th>Ação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.rules.map((rule) => (
                      <tr key={rule.id}>
                        <td data-label="Regra">
                          <strong>{rule.title}</strong>
                          {rule.active && !rule.automatic && (
                            <small>Automático desligado</small>
                          )}
                        </td>
                        <td data-label="Programado">
                          {dateTime(rule.scheduledAt)}
                        </td>
                        <td data-label="Situação">
                          <span
                            className="delivery-state"
                            data-state={rule.state}
                          >
                            {!rule.scheduledAt && rule.state === 'agendado'
                              ? 'Sem agenda hoje'
                              : labels[rule.state] || rule.state}
                          </span>
                        </td>
                        <td data-label="Clientes">
                          <span>{rule.detail}</span>
                        </td>
                        <td data-label="Ação">
                          {rule.recoverable ? (
                            <Recover rule={rule} token={token} />
                          ) : rule.uncertain > 0 ? (
                            <small>Confira no WhatsApp</small>
                          ) : (
                            <span>—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
          <section className="delivery-center-section">
            <h3>Envios realizados e tentativas</h3>
            <p className="delivery-center-caption">
              A origem é registrada a partir da atualização da central. Os
              registros anteriores continuam preservados.
            </p>
            {!data.attempts.length ? (
              <div className="auto-empty-state">
                <Icon name="message" />
                <h3>Nenhuma tentativa registrada</h3>
                <p>
                  Os próximos envios aparecerão aqui com a origem e os horários.
                </p>
              </div>
            ) : (
              <div className="delivery-center-table-wrap">
                <table className="delivery-center-table">
                  <thead>
                    <tr>
                      <th>Regra e cliente</th>
                      <th>Origem</th>
                      <th>Programado</th>
                      <th>Iniciado</th>
                      <th>Concluído</th>
                      <th>Resultado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.attempts.map((attempt) => (
                      <tr key={attempt.id}>
                        <td data-label="Regra e cliente">
                          <strong>{attempt.title}</strong>
                          <small>{attempt.clientName}</small>
                        </td>
                        <td data-label="Origem">
                          <span className="delivery-origin">
                            {attempt.origin === 'manual'
                              ? 'Manual'
                              : 'Automático'}
                          </span>
                        </td>
                        <td data-label="Programado">
                          {dateTime(attempt.scheduledAt)}
                        </td>
                        <td data-label="Iniciado">
                          {dateTime(attempt.startedAt)}
                          {attempt.delayMinutes >= 5 && (
                            <small className="delivery-center-delay">
                              {attempt.delayMinutes} min de atraso
                            </small>
                          )}
                        </td>
                        <td data-label="Concluído">
                          {dateTime(attempt.finishedAt)}
                        </td>
                        <td data-label="Resultado">
                          <span
                            className="delivery-state"
                            data-state={
                              attempt.status === 'enviado'
                                ? 'enviado'
                                : attempt.status === 'incerto'
                                  ? 'incerto'
                                  : attempt.status === 'pendente'
                                    ? 'enviando'
                                    : 'falha'
                            }
                          >
                            {attemptLabels[attempt.status] || attempt.status}
                          </span>
                          {attempt.error && <small>{attempt.error}</small>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {(page > 1 || data.history.hasMore) && (
              <nav
                className="auto-history-pagination"
                aria-label="Páginas da central de envios"
              >
                <button
                  type="button"
                  className="btn btn-muted"
                  disabled={loading || page === 1}
                  onClick={() => setPage((value) => value - 1)}
                >
                  Anterior
                </button>
                <span>Página {data.history.page}</span>
                <button
                  type="button"
                  className="btn btn-muted"
                  disabled={loading || !data.history.hasMore}
                  onClick={() => setPage((value) => value + 1)}
                >
                  Próxima
                </button>
              </nav>
            )}
          </section>
          <p className="delivery-center-caption">
            Última leitura: {dateTime(data.serverNow)} · Atualização automática
            a cada minuto enquanto esta aba estiver visível.
          </p>
        </>
      )}
    </section>
  );
}

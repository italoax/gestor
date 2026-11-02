'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { formatMoney } from '../../../../src/services/format.ts';
import { displayTimestamp } from '../../../../src/shared/displayDate.ts';

export function usePortalRenewals(data: any) {
  const [snapshot, setSnapshot] = useState({
    renovacoes: data.renovacoes || [],
    assinatura: null,
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const request = useRef<AbortController | null>(null);
  const alive = useRef(false);
  const enabled = Boolean(data.cliente);
  const identity = data.cliente?.user;
  useEffect(() => {
    setSnapshot({ renovacoes: data.renovacoes || [], assinatura: null });
  }, [data]);
  const refresh = useCallback(async () => {
    if (!enabled || !alive.current || request.current || document.hidden)
      return;
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    try {
      const response = await fetch('/area-cliente/renovacoes', {
        headers: { Accept: 'application/json' },
        cache: 'no-store',
        signal: AbortSignal.any([
          controller.signal,
          AbortSignal.timeout(15000),
        ]),
      });
      if (!response.ok || response.redirected) throw Error();
      const result = await response.json();
      if (!result.ok || !Array.isArray(result.renovacoes) || !result.assinatura)
        throw Error();
      if (!controller.signal.aborted && alive.current) {
        setSnapshot(result);
        setError('');
      }
    } catch {
      if (!controller.signal.aborted && alive.current)
        setError(
          'Não foi possível atualizar. Os dados anteriores continuam visíveis.',
        );
    } finally {
      if (request.current === controller) {
        request.current = null;
        if (alive.current) setBusy(false);
      }
    }
  }, [enabled, identity]);
  useEffect(() => {
    alive.current = true;
    if (!enabled)
      return () => {
        alive.current = false;
      };
    const timer = setInterval(() => void refresh(), 20000);
    const resume = () => void refresh();
    window.addEventListener('focus', resume);
    document.addEventListener('visibilitychange', resume);
    return () => {
      alive.current = false;
      clearInterval(timer);
      request.current?.abort();
      request.current = null;
      window.removeEventListener('focus', resume);
      document.removeEventListener('visibilitychange', resume);
    };
  }, [enabled, refresh]);
  return { ...snapshot, error, busy, refresh };
}

export function RenewalTracking({
  tracking,
}: {
  tracking: ReturnType<typeof usePortalRenewals>;
}) {
  return (
    <section
      className="portal-card portal-tracking"
      aria-labelledby="portal-tracking-title"
    >
      <div className="portal-tracking-heading">
        <h2 id="portal-tracking-title">Acompanhar renovação</h2>
        <button
          type="button"
          className="portal-button portal-button-secondary"
          disabled={tracking.busy}
          onClick={() => void tracking.refresh()}
        >
          {tracking.busy ? 'Atualizando…' : 'Atualizar'}
        </button>
      </div>
      <div role="status" aria-live="polite" aria-atomic="true">
        {!tracking.renovacoes.length && (
          <p className="portal-help">
            As etapas da renovação aparecerão aqui quando um pagamento for
            confirmado.
          </p>
        )}
        {tracking.renovacoes.map((item) => {
          const renewed = item.stage === 'renewed';
          return (
            <article
              className="portal-renewal-entry"
              key={item.id}
              data-renewal-stage={item.stage}
            >
              <div className="portal-tracking-heading">
                <strong>{formatMoney(item.amount)}</strong>
                <span
                  className={`portal-renewal-state${renewed ? ' is-renewed' : ''}`}
                >
                  {renewed ? 'Acesso renovado' : 'Aguardando renovação'}
                </span>
              </div>
              <p className="portal-help">
                Recebido em {displayTimestamp(item.paidAt)}
              </p>
              <ol
                className="portal-renewal-steps"
                aria-label="Etapas da renovação"
              >
                <li data-complete="true">
                  <span aria-hidden="true">✓</span> Pagamento recebido
                </li>
                <li
                  data-complete={renewed}
                  aria-current={renewed ? undefined : 'step'}
                >
                  <span aria-hidden="true">{renewed ? '✓' : '2'}</span>{' '}
                  {renewed ? 'Renovação confirmada' : 'Aguardando renovação'}
                </li>
                <li
                  data-complete={renewed}
                  aria-current={renewed ? 'step' : undefined}
                >
                  <span aria-hidden="true">{renewed ? '✓' : '3'}</span> Acesso
                  renovado
                </li>
              </ol>
              <p className="portal-help">
                {renewed
                  ? `O responsável confirmou a renovação em ${displayTimestamp(item.renewedAt)}. Confira a validade na sua assinatura.`
                  : 'O pagamento foi confirmado. O responsável fará a renovação e confirmará a conclusão aqui.'}
              </p>
            </article>
          );
        })}
      </div>
      {tracking.error && (
        <p role="alert" className="portal-help">
          {tracking.error}
        </p>
      )}
    </section>
  );
}

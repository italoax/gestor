'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Icon } from '../../../../src/frontend/clients/ui.tsx';
import { formatMoney } from '../../../../src/services/format.ts';
import type { DashboardAttention as AttentionData } from '../../../../src/services/dashboardAttention.ts';

export function DashboardAttention({
  data: initialData,
}: {
  data?: AttentionData;
}) {
  const [data, setAttention] = useState(initialData);
  const [refreshing, setRefreshing] = useState(false);
  const available = Boolean(initialData);
  useEffect(() => setAttention(initialData), [initialData]);
  useEffect(() => {
    if (!available) return;
    const controller = new AbortController();
    let inFlight = false,
      lastAttempt = 0,
      nextAllowed = 0;
    const load = async () => {
      if (
        controller.signal.aborted ||
        document.hidden ||
        navigator.onLine === false ||
        inFlight ||
        Date.now() < nextAllowed
      )
        return;
      inFlight = true;
      lastAttempt = Date.now();
      setRefreshing(true);
      try {
        const response = await fetch('/api/dashboard/pendencias', {
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
        if (!response.ok) return;
        const result = await response.json();
        const value = result.attention;
        if (
          !controller.signal.aborted &&
          result.ok &&
          /^\d{4}-\d{2}-\d{2}$/.test(value?.date) &&
          [
            value?.renewals?.count,
            value?.renewals?.amount,
            value?.deliveries?.failed,
            value?.deliveries?.uncertain,
            value?.dueToday?.count,
            value?.dueToday?.amount,
            value?.dueTomorrow?.count,
            value?.dueTomorrow?.amount,
          ].every(Number.isFinite)
        )
          setAttention(value);
      } catch {
        // Mantém os últimos dados confirmados e tenta novamente no próximo ciclo.
      } finally {
        inFlight = false;
        if (!controller.signal.aborted) setRefreshing(false);
      }
    };
    const resume = () => {
      if (Date.now() - lastAttempt >= 5000) void load();
    };
    const timer = setInterval(() => void load(), 60_000);
    document.addEventListener('visibilitychange', resume);
    window.addEventListener('focus', resume);
    window.addEventListener('online', resume);
    return () => {
      clearInterval(timer);
      controller.abort();
      document.removeEventListener('visibilitychange', resume);
      window.removeEventListener('focus', resume);
      window.removeEventListener('online', resume);
    };
  }, [available]);
  if (!data) return null;
  const deliveries = data.deliveries.failed + data.deliveries.uncertain;
  const groups = [
    {
      key: 'renewals',
      count: data.renewals.count,
      tone: 'urgent',
      icon: 'card',
      title: 'Pagamentos aguardando renovação',
      badge: 'Prioridade',
      description: `${formatMoney(data.renewals.amount)} já recebidos. Renove os acessos e confirme no painel.`,
      href: '/clientes#renovacoes-pendentes',
      action: 'Ver renovações',
    },
    {
      key: 'deliveries',
      count: deliveries,
      tone: 'warning',
      icon: 'message',
      title: 'Cobranças para revisar',
      badge: 'Revisar',
      description: `${data.deliveries.failed} com falha e ${data.deliveries.uncertain} sem confirmação hoje. Confira antes de reenviar.`,
      href: '/automacao?aba=central',
      action: 'Revisar envios',
    },
    {
      key: 'today',
      count: data.dueToday.count,
      tone: 'warning',
      icon: 'calendar',
      title: 'Clientes que vencem hoje',
      badge: 'Hoje',
      description: `${formatMoney(data.dueToday.amount)} em vencimentos. Confira os clientes ativos e acompanhe as renovações.`,
      href: '/clientes?situacao=ativos&vencimento=hoje',
      action: 'Ver clientes',
    },
    {
      key: 'tomorrow',
      count: data.dueTomorrow.count,
      tone: 'info',
      icon: 'clock',
      title: 'Clientes que vencem amanhã',
      badge: 'Amanhã',
      description: `${formatMoney(data.dueTomorrow.amount)} em vencimentos. Antecipe o contato com os clientes ativos.`,
      href: '/clientes?situacao=ativos&vencimento=amanha',
      action: 'Ver clientes',
    },
  ].filter((group) => group.count > 0);
  const [year, month, day] = data.date.split('-');
  return (
    <section
      className="dash-attention"
      aria-labelledby="dash-attention-title"
      aria-busy={refreshing}
    >
      <header className="dash-attention-heading">
        <div>
          <p className="dash-attention-eyebrow">
            Seu dia no gestor ·{' '}
            <time dateTime={data.date}>
              {day}/{month}/{year}
            </time>
          </p>
          <h2 id="dash-attention-title">O que precisa de atenção hoje</h2>
          <p>Comece pelos pagamentos recebidos e siga com as próximas ações.</p>
        </div>
      </header>
      {groups.length ? (
        <ul className="dash-attention-list">
          {groups.map((group) => (
            <li
              className="dash-attention-item"
              data-priority={group.tone}
              data-attention-group={group.key}
              key={group.key}
            >
              <span className="dash-attention-icon" aria-hidden="true">
                <Icon name={group.icon} />
              </span>
              <div className="dash-attention-copy">
                <div className="dash-attention-label">
                  <h3>{group.title}</h3>
                  <span>{group.badge}</span>
                </div>
                <p>{group.description}</p>
              </div>
              <strong
                className="dash-attention-count"
                aria-label={`${group.count} ${group.key === 'renewals' ? 'pagamentos' : group.key === 'deliveries' ? 'envios' : 'clientes'}`}
              >
                {group.count}
              </strong>
              <Link
                className="dash-attention-action"
                href={group.href}
                prefetch={false}
                aria-label={`${group.action}: ${group.title.toLowerCase()}`}
              >
                {group.action} <span aria-hidden="true">→</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <div className="dash-attention-empty" role="status">
          <strong>Nenhuma pendência nesta lista</strong>
          <p>
            Sem renovações aguardando confirmação, falhas de cobrança hoje ou
            clientes ativos vencendo hoje e amanhã.
          </p>
        </div>
      )}
      <p className="dash-attention-note">
        Pagamentos pendentes incluem dias anteriores. Vencimentos consideram o
        acesso principal de clientes ativos.
      </p>
    </section>
  );
}

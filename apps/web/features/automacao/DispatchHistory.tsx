'use client';
import { useState, useTransition } from 'react';
import { Icon } from '../../../../src/frontend/clients/ui.tsx';
import { PanelSearch } from '../../../../src/frontend/components/PanelSearch.tsx';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  AUTOMATION_HISTORY_PAGE_SIZE,
  AUTOMATION_HISTORY_PAGE_SIZES,
  automationHistoryUrl,
  type AutomationHistory,
} from '../../../../src/services/automationHistory.ts';

const statuses = {
  enviado: { label: 'Enviado', tone: 'success' },
  pendente: { label: 'Pendente', tone: 'warning' },
  nao_enviado: { label: 'Não enviado', tone: 'muted' },
  incerto: { label: 'Sem confirmação', tone: 'warning' },
  erro: { label: 'Erro', tone: 'danger' },
};

function searchable(value: unknown) {
  return String(value || '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase();
}

export function DispatchHistory({
  rows = [],
  history,
}: {
  rows?: any[];
  history?: AutomationHistory;
}) {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const router = useRouter();
  const [changingSize, startSizeChange] = useTransition();
  const query = searchable(search.trim());
  const filtered = rows.filter(
    (row) =>
      (!status || row.status === status) &&
      searchable(
        [
          row.regraTitulo,
          row.clientesNomes,
          row.quando,
          ...(row.clientesPorServidor || []).flatMap((group) => [
            group.servidor,
            ...group.clientes,
          ]),
        ].join(' '),
      ).includes(query),
  );
  const filteredView = Boolean(query || status);
  const days = new Map<string, { row: any; time: string }[]>();
  for (const row of filtered) {
    const when = String(row.quando || '').match(
      /^(\d{2}\/\d{2}(?:\/\d{4})?)[,\s]+(\d{2}:\d{2})/,
    );
    const date = when?.[1] || 'Data não informada';
    const entries = days.get(date) || [];
    entries.push({ row, time: when?.[2] || row.quando || '—' });
    days.set(date, entries);
  }
  const reset = () => {
    setSearch('');
    setStatus('');
  };

  return (
    <section className="auto-history" aria-label="Histórico de envios">
      {(rows.length > 0 || history?.pagina > 1) && (
        <div className="auto-history-filters">
          <div className="auto-history-field auto-history-search">
            <label htmlFor="auto-history-search">Buscar</label>
            <PanelSearch
              id="auto-history-search"
              value={search}
              onChange={setSearch}
              placeholder={
                history?.temMais || history?.pagina > 1
                  ? 'Buscar nesta página...'
                  : 'Cliente, servidor ou regra...'
              }
              label="Buscar nos envios desta página"
            />
          </div>
          <label className="auto-history-field">
            <span>Status</span>
            <select
              className="input"
              aria-label="Filtrar envios por status"
              value={status}
              onChange={(event) => setStatus(event.target.value)}
            >
              <option value="">Todos os status</option>
              {Object.entries(statuses).map(([value, item]) => (
                <option key={value} value={value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <label className="auto-history-field">
            <span>Por página</span>
            <select
              className="input"
              aria-label="Registros por página"
              value={history?.porPagina || AUTOMATION_HISTORY_PAGE_SIZE}
              disabled={changingSize}
              onChange={(event) => {
                const size = Number(event.target.value);
                startSizeChange(() =>
                  router.push(automationHistoryUrl(1, size), { scroll: false }),
                );
              }}
            >
              {AUTOMATION_HISTORY_PAGE_SIZES.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
      {!filtered.length ? (
        <div className="auto-empty-state">
          <Icon name="message" />
          <h3>
            {filteredView
              ? 'Nenhum envio encontrado'
              : 'Nenhum envio neste período'}
          </h3>
          <p>
            {filteredView
              ? 'Tente outro cliente, regra ou status.'
              : 'Os envios dos últimos 3 meses aparecerão aqui.'}
          </p>
          {filteredView && (
            <button className="btn btn-muted" type="button" onClick={reset}>
              Limpar filtros
            </button>
          )}
        </div>
      ) : (
        <div className="auto-history-days">
          {[...days].map(([date, entries]) => (
            <article
              className="auto-history-day"
              key={date}
              data-history-date={date}
            >
              <h3 className="auto-history-date">
                <Icon name="calendar" />
                {date}
              </h3>
              <div className="auto-history-table-wrap">
                <table
                  className="auto-history-table"
                  aria-label={`Envios de ${date}`}
                >
                  <thead>
                    <tr>
                      <th scope="col">Horário</th>
                      <th scope="col">Regra</th>
                      <th scope="col">Clientes</th>
                      <th scope="col">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map(({ row, time }, index) => {
                      const delivery =
                        statuses[row.status] || statuses.pendente;
                      const count = Number(row.clientesCount) || 0;
                      return (
                        <tr key={row.id || index}>
                          <td className="auto-history-when">{time}</td>
                          <td className="auto-history-rule">
                            {row.regraTitulo || 'Regra sem nome'}
                          </td>
                          <td className="auto-history-clients">
                            <div>
                              <span className="auto-history-count">
                                {count} {count === 1 ? 'cliente' : 'clientes'}
                              </span>
                              {row.clientesPorServidor?.length ? (
                                <div className="auto-history-servers">
                                  {row.clientesPorServidor.map((group) => (
                                    <div
                                      className="auto-history-server"
                                      key={group.servidor}
                                    >
                                      <strong>{group.servidor}</strong>
                                      <p>{group.clientes.join(', ')}</p>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <p>
                                  {row.clientesNomes ||
                                    'Nenhum cliente identificado'}
                                </p>
                              )}
                            </div>
                          </td>
                          <td className="auto-history-status">
                            <span
                              className="auto-history-badge"
                              data-tone={delivery.tone}
                            >
                              {delivery.label}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </article>
          ))}
        </div>
      )}
      {history && (history.pagina > 1 || history.temMais) && (
        <nav
          className="auto-history-pagination"
          aria-label="Páginas do histórico"
        >
          <div>
            {history.anteriorUrl && (
              <Link
                href={history.anteriorUrl}
                prefetch={false}
                className="btn btn-muted"
              >
                Anterior
              </Link>
            )}
          </div>
          <span>Página {history.pagina}</span>
          <div>
            {history.proximaUrl && (
              <Link
                href={history.proximaUrl}
                prefetch={false}
                className="btn btn-muted"
              >
                Próxima
              </Link>
            )}
          </div>
        </nav>
      )}
    </section>
  );
}

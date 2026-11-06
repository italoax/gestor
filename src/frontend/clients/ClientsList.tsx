import { ClientRow } from './ClientRow.tsx';
import { Fragment } from 'react';
import { Icon } from './ui.tsx';
import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { formatMoney } from '../../services/format.ts';
import { sortClients } from './model.ts';
import { PanelSearch } from '../components/PanelSearch.tsx';
import { matchesClientFilters, clientFilterToday } from './filters.ts';
import { useClientFilters } from './useClientFilters.ts';
import { ClientFiltersBar } from './ClientFilters.tsx';
import { ClientBulkActions } from './ClientBulkActions.tsx';

export function ClientsList({
  clientes,
  planos,
  servidores,
  mensagens,
  renovacoesPendentes,
  csrfToken,
  now,
  verArquivados,
  filterQuery,
  savedFiltersKey,
}: {
  clientes?: any;
  planos?: any;
  servidores?: any;
  mensagens?: any;
  renovacoesPendentes?: any;
  csrfToken?: any;
  now?: Date;
  verArquivados?: any;
  filterQuery?: string;
  savedFiltersKey?: string;
}) {
  const sortNow = useMemo(() => new Date(now), [now]);
  const today = useMemo(() => clientFilterToday(sortNow), [sortNow]);
  const filterControl = useClientFilters(filterQuery, savedFiltersKey);
  const [sort, setSort] = useState({ column: 'status', direction: 'desc' });
  const [selected, setSelected] = useState(new Set());
  const selectAllCheckbox = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const ids = new Set(clientes.map((client) => client.id));
    setSelected(
      (previous) => new Set([...previous].filter((id) => ids.has(id))),
    );
  }, [clientes]);
  const clientesOrdenados = useMemo(
    () => sortClients(clientes, sort, sortNow),
    [clientes, sort, sortNow],
  );
  const visible = useMemo(
    () =>
      clientesOrdenados.filter((client) =>
        matchesClientFilters(client, filterControl.filters, today),
      ),
    [clientesOrdenados, filterControl.filters, today],
  );
  const visibleIds = new Set(visible.map((client) => client.id));
  const selectedClients = clientesOrdenados.filter((client) =>
    selected.has(client.id),
  );
  const selectedVisibleCount = visible.filter((client) =>
    selected.has(client.id),
  ).length;
  useEffect(() => {
    if (selectAllCheckbox.current)
      selectAllCheckbox.current.indeterminate =
        selectedVisibleCount > 0 && selectedVisibleCount < visible.length;
  }, [selectedVisibleCount, visible.length]);
  const selectRow = useCallback(
    (id, checked) =>
      setSelected((prev) => {
        const next = new Set(prev);
        checked ? next.add(id) : next.delete(id);
        return next;
      }),
    [],
  );
  const selectAll = (checked) =>
    setSelected((prev) => {
      const next = new Set(prev);
      visible.forEach((c) => (checked ? next.add(c.id) : next.delete(c.id)));
      return next;
    });
  const toggleSort = (column) =>
    setSort((prev) => ({
      column,
      direction:
        prev.column !== column || !prev.direction
          ? 'asc'
          : prev.direction === 'asc'
            ? 'desc'
            : '',
    }));
  return (
    <div className="container page-clientes" data-search-scope="">
      {renovacoesPendentes && renovacoesPendentes.length ? (
        <>
          <section
            className="card renewal-pending"
            id="renovacoes-pendentes"
            aria-labelledby="renewal-pending-title"
          >
            <h2 id="renewal-pending-title">
              Pagamentos recebidos — renovar no painel
            </h2>
            <p className="muted">
              Renove o acesso no outro painel e confirme aqui para atualizar o
              controle.
            </p>
            {renovacoesPendentes.map((p, index) => {
              return (
                <Fragment key={p?.id ?? index}>
                  <div className="renewal-pending-row">
                    <div>
                      <strong>{p.nome}</strong>
                      <p>
                        {formatMoney(p.valor)}
                        {' · '}
                        {p.duracao}
                        {' · '}
                        {p.plano}
                      </p>
                    </div>
                    <button
                      className="btn btn-primary"
                      type="button"
                      data-confirm-renovacao={p.id}
                    >
                      Marcar como renovado
                    </button>
                  </div>
                </Fragment>
              );
            })}
          </section>
        </>
      ) : null}
      <div className="ui-toolbar">
        <div className="cliente-search">
          <PanelSearch
            id="cliente-search-input"
            placeholder="Buscar clientes..."
            label="Buscar clientes"
            value={filterControl.filters.busca}
            onChange={(value) => filterControl.change('busca', value)}
            legacySearch
          />
          <div
            className="cliente-search-results"
            data-search-results=""
            role="status"
            aria-live="polite"
            aria-atomic="true"
            hidden={!filterControl.active}
          >
            {visible.length
              ? `${visible.length} ${visible.length === 1 ? 'cliente encontrado' : 'clientes encontrados'} de ${clientes.length}.`
              : 'Nenhum cliente encontrado. Ajuste a busca ou os filtros.'}
          </div>
        </div>
        <button
          className="btn btn-primary cli-new-btn"
          type="button"
          data-open-modal="modal-add-cliente"
        >
          <Icon name="plus" />
          Novo cliente
        </button>
      </div>
      <ClientFiltersBar
        control={filterControl}
        clientes={clientes}
        planos={planos}
        servidores={servidores}
      />
      {clientes.length > 0 && (
        <ClientBulkActions
          clients={selectedClients}
          visibleIds={visibleIds}
          totalVisible={visible.length}
          onSelectVisible={() => selectAll(true)}
          onClear={() => setSelected(new Set())}
          onKeepVisible={() =>
            setSelected(
              new Set(
                selectedClients
                  .filter((client) => visibleIds.has(client.id))
                  .map((client) => client.id),
              ),
            )
          }
          mensagens={mensagens}
          csrfToken={csrfToken}
          now={sortNow}
          archived={Boolean(verArquivados)}
        />
      )}
      {!clientes.length ? (
        <>
          <div className="cli-empty">
            <div className="cli-empty-ico">
              <Icon name="👥" />
            </div>
            <h3>Nenhum cliente cadastrado</h3>
            <p className="muted">
              Comece adicionando seu primeiro cliente para gerenciar seus
              clientes de forma eficiente.
            </p>
            <button
              className="btn btn-primary"
              type="button"
              data-open-modal="modal-add-cliente"
            >
              <Icon name="users" />
              Adicionar Primeiro Cliente
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="cli-table-card">
            <div className="table-wrapper">
              <table className="cli-table table-clientes">
                <thead>
                  <tr>
                    <th className="col-check">
                      <input
                        ref={selectAllCheckbox}
                        type="checkbox"
                        className="cli-check"
                        data-check-all=""
                        aria-label="Selecionar todos os clientes visíveis"
                        checked={
                          visible.length > 0 &&
                          visible.every((c) => selected.has(c.id))
                        }
                        onChange={(event) =>
                          selectAll((event.target as HTMLInputElement).checked)
                        }
                      />
                    </th>
                    {Object.entries({
                      nome: 'Cliente',
                      whatsapp: 'WhatsApp',
                      plano: 'Plano',
                      valor: 'Valor',
                      servidor: 'Servidor',
                      aplicativo: 'Aplicativo',
                      vencimento: 'Vencimento',
                      status: 'Status',
                    }).map(([column, label]) => (
                      <th
                        key={column}
                        data-sort-col={column}
                        aria-sort={
                          sort.column === column && sort.direction
                            ? sort.direction === 'asc'
                              ? 'ascending'
                              : 'descending'
                            : 'none'
                        }
                      >
                        <button
                          type="button"
                          className="cli-react-sort"
                          onClick={() => toggleSort(column)}
                        >
                          {label}
                          {sort.column === column && sort.direction
                            ? sort.direction === 'asc'
                              ? ' ↑'
                              : ' ↓'
                            : ''}
                        </button>
                      </th>
                    ))}
                    <th className="col-acoes">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {clientesOrdenados.map((c) => (
                    <ClientRow
                      key={c.id}
                      {...{
                        c,
                        planos,
                        servidores,
                        sortNow,
                        selected: selected.has(c.id),
                        visible: visibleIds.has(c.id),
                        selectRow,
                        csrfToken,
                        verArquivados,
                      }}
                    />
                  ))}
                  {!visible.length && (
                    <tr>
                      <td colSpan={10} className="client-filter-empty">
                        Nenhum cliente corresponde aos filtros.
                        <button
                          type="button"
                          className="btn btn-ghost"
                          onClick={filterControl.clear}
                        >
                          Limpar filtros
                        </button>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="cli-table-foot">
              <span className="muted">
                {filterControl.active
                  ? `${visible.length} de ${clientes.length}`
                  : clientes.length}{' '}
                cliente{clientes.length === 1 ? '' : 's'}
              </span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

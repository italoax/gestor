import { ClientRow } from './ClientRow.tsx';
import { Fragment } from 'react';
import { Icon } from './ui.tsx';
import { useState, useMemo, useEffect } from 'react';
import {
  formatMoney,
  statusByVencimento as getStatus,
} from '../../services/format.ts';
import { normalizeSearch, sortClients } from './model.ts';

export function ClientsList({
  clientes,
  planos,
  servidores,
  renovacoesPendentes,
  csrfToken,
  now,
  verArquivados,
}: {
  clientes?: any;
  planos?: any;
  servidores?: any;
  renovacoesPendentes?: any;
  csrfToken?: any;
  now?: Date;
  verArquivados?: any;
}) {
  const sortNow = useMemo(() => new Date(now), [now]);
  const statusByVencimento = (status, vencimento) =>
    getStatus(status, vencimento, sortNow);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState({ column: 'status', direction: 'desc' });
  const [selected, setSelected] = useState(new Set());
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
  const cliTotal = clientes.length;
  const cliAtivos = clientes.filter(
    (c) =>
      !['vencido', 'inativo'].includes(
        statusByVencimento(c.status, c.vencimento).type,
      ),
  ).length;
  const cliVencidos = clientes.filter(
    (c) => statusByVencimento(c.status, c.vencimento).type === 'vencido',
  ).length;
  const term = normalizeSearch(search);
  const matches = (c) =>
    !term ||
    normalizeSearch(
      [
        c.nome,
        c.user,
        c.telefone,
        c.email,
        c.plano,
        c.adicional?.plano,
        c.adicional?.servidor,
        c.servidor,
        c.aplicativo,
        c.adicional?.aplicativo,
        c.idPainel,
      ]
        .filter(Boolean)
        .join(' '),
    ).includes(term);
  const visible = clientesOrdenados.filter(matches);
  const selectRow = (id, checked) =>
    setSelected((prev) => {
      const next = new Set(prev);
      checked ? next.add(id) : next.delete(id);
      return next;
    });
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
      <div className="ui-summary ui-summary-3">
        <div className="cli-stat accent-blue">
          <div className="cli-stat-ico">
            <Icon name="👥" />
          </div>
          <div>
            <strong>{cliTotal}</strong>
            <span>Total</span>
          </div>
        </div>
        <div className="cli-stat accent-green">
          <div className="cli-stat-ico">
            <Icon name="🧑‍🤝‍🧑" />
          </div>
          <div>
            <strong>{cliAtivos}</strong>
            <span>Ativos</span>
          </div>
        </div>
        <div className="cli-stat accent-red">
          <div className="cli-stat-ico">
            <Icon name="⚠️" />
          </div>
          <div>
            <strong>{cliVencidos}</strong>
            <span>Vencidos</span>
          </div>
        </div>
      </div>
      <div className="ui-toolbar">
        <div className="cliente-search">
          <div
            className="cli-search cliente-search-field"
            role="search"
            aria-label="Pesquisar clientes"
          >
            <svg
              className="cliente-search-icon"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <circle cx="10.5" cy="10.5" r="6.5" />
              <path d="m16 16 4 4" />
            </svg>
            <input
              id="cliente-search-input"
              className="input"
              type="search"
              placeholder="Buscar clientes..."
              aria-label="Buscar clientes"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck="false"
              enterKeyHint="search"
              data-search-input=""
              value={search}
              onChange={(event) =>
                setSearch((event.target as HTMLInputElement).value)
              }
            />
            <button
              className="cliente-search-clear"
              type="button"
              data-clear-search=""
              aria-label="Limpar busca"
              title="Limpar busca"
              hidden={!search}
              onClick={() => {
                setSearch('');
                (
                  document.getElementById('cliente-search-input') as HTMLElement
                )?.focus();
              }}
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                aria-hidden="true"
              >
                <path d="m6 6 12 12M18 6 6 18" />
              </svg>
            </button>
          </div>
          <div
            className="cliente-search-results"
            data-search-results=""
            role="status"
            aria-live="polite"
            aria-atomic="true"
            hidden={!term}
          >
            {visible.length
              ? `${visible.length} ${visible.length === 1 ? 'cliente encontrado' : 'clientes encontrados'} de ${clientes.length}.`
              : 'Nenhum cliente encontrado. Tente outro nome ou número.'}
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
                        type="checkbox"
                        className="cli-check"
                        data-check-all=""
                        aria-label="Selecionar todos"
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
                        selected,
                        selectRow,
                        matches,
                        csrfToken,
                        verArquivados,
                      }}
                    />
                  ))}
                </tbody>
              </table>
            </div>
            <div className="cli-table-foot">
              <span className="muted">
                {clientes.length}
                cliente{clientes.length === 1 ? '' : 's'}
              </span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

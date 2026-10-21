'use client';
import { useEffect, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Icon } from '../../../../src/frontend/clients/ui.tsx';
import { PanelSearch } from '../../../../src/frontend/components/PanelSearch.tsx';
import {
  TRANSACTIONS_PAGE_SIZES,
  transactionsPageUrl,
} from '../../../../src/services/transactionsPage.ts';
import { NativePanel } from '../../components/layout/NativePanel.tsx';
import { NativeDialog } from '../../components/ui/NativeDialog.tsx';

const money = (value) =>
  Number(value || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
const dateBr = (value) => {
  if (!value) return '-';
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : String(value);
};
const signedMoney = (value) => `${Number(value) < 0 ? '' : '+'}${money(value)}`;

function TransactionDetails({
  item,
  onClose,
}: {
  item?: any;
  onClose?: (...args: any[]) => any;
}) {
  const details = [
    ['Pagamento', item.formaPagamento],
    ['Plano', item.plano],
    ['Servidor', item.servidor],
    ['Descrição', item.descricao],
    ...(item.duracao ? [['Duração', item.duracao]] : []),
    [item.codigos ? 'Códigos' : 'Telas', item.codigos || item.telas],
    ...(!item.codigos || Number(item.creditos) !== Number(item.codigos)
      ? [['Créditos', Number(item.creditos || 0).toLocaleString('pt-BR')]]
      : []),
  ];
  return (
    <NativeDialog title="Detalhes da Transação" onClose={onClose} width={460}>
      <div
        className="modal-body"
        style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
        data-transaction-details={item.id}
      >
        <div
          style={{ borderBottom: '1px solid var(--border)', paddingBottom: 12 }}
        >
          <div className="muted">{dateBr(item.data)}</div>
          <strong style={{ fontSize: 18 }}>{item.clienteNome || '-'}</strong>
        </div>
        <div
          style={{
            background: 'var(--surface-2)',
            border: '1px solid var(--border)',
            borderRadius: 12,
            padding: 16,
          }}
        >
          {[
            ['Total recebido', signedMoney(item.valorVenda), 'tx-pos'],
            ['Custo', money(item.custo), 'tx-neg'],
            [
              'Lucro',
              signedMoney(item.lucro),
              Number(item.lucro) < 0 ? 'tx-neg' : 'tx-pos',
            ],
          ].map(([label, value, color]) => (
            <div
              key={label}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: 12,
                paddingBlock: 5,
              }}
            >
              <span>{label}</span>
              <strong className={color}>{value}</strong>
            </div>
          ))}
        </div>
        <dl
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '10px 18px',
            margin: 0,
          }}
        >
          {details.map(([label, value]) => (
            <div key={label} style={{ minWidth: 0, overflowWrap: 'anywhere' }}>
              <dt className="muted">{label}</dt>
              <dd style={{ margin: 0 }}>{value ?? '-'}</dd>
            </div>
          ))}
        </dl>
      </div>
    </NativeDialog>
  );
}

function TransactionsContent({ data }: { data?: any }) {
  const [selected, setSelected] = useState(null);
  const [search, setSearch] = useState(data.filtros?.busca || '');
  const [payment, setPayment] = useState(data.filtros?.pagamento || '');
  const router = useRouter();
  const [changingSize, startSizeChange] = useTransition();
  const pagination = data.paginacao;
  const rows = data.transacoes || [];
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const syncBackNavigation = () => {
      if (timer.current) clearTimeout(timer.current);
      const params = new URLSearchParams(window.location.search);
      setSearch(params.get('busca') || '');
      setPayment(params.get('pagamento') || '');
    };
    window.addEventListener('popstate', syncBackNavigation);
    return () => {
      if (timer.current) clearTimeout(timer.current);
      window.removeEventListener('popstate', syncBackNavigation);
    };
  }, []);
  const applyFilters = (busca: string, pagamento: string, delay = 0) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      startSizeChange(() =>
        router.replace(
          transactionsPageUrl(1, pagination?.porPagina || 10, {
            busca,
            pagamento,
          }),
          { scroll: false },
        ),
      );
    }, delay);
  };
  const payments = data.formasPagamento?.length
    ? data.formasPagamento
    : [
        ...new Set<string>(
          rows
            .map((item) => String(item.formaPagamento || '').trim())
            .filter(Boolean),
        ),
      ].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const filteredView = Boolean(
    search.trim() || payment || data.filtros?.busca || data.filtros?.pagamento,
  );
  return (
    <>
      <div className="container page-transacoes" data-react-page="transacoes">
        <div className="tx-filters">
          <div className="tx-filter-field tx-filter-search">
            <label htmlFor="tx-search">Buscar</label>
            <PanelSearch
              id="tx-search"
              value={search}
              onChange={(value) => {
                setSearch(value);
                applyFilters(value, payment, 300);
              }}
              placeholder="Cliente, servidor ou descrição..."
              label="Buscar em todas as transações"
            />
          </div>
          <label className="tx-filter-field">
            <span>Pagamento</span>
            <select
              className="input"
              aria-label="Filtrar transações por pagamento"
              value={payment}
              onChange={(event) => {
                setPayment(event.target.value);
                applyFilters(search, event.target.value);
              }}
            >
              <option value="">Todos</option>
              {payments.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <label className="tx-filter-field">
            <span>Por página</span>
            <select
              className="input"
              aria-label="Transações por página"
              value={pagination?.porPagina || 10}
              disabled={changingSize}
              onChange={(event) => {
                const size = Number(event.target.value);
                if (timer.current) clearTimeout(timer.current);
                startSizeChange(() =>
                  router.push(
                    transactionsPageUrl(1, size, {
                      busca: search,
                      pagamento: payment,
                    }),
                    {
                      scroll: false,
                    },
                  ),
                );
              }}
            >
              {TRANSACTIONS_PAGE_SIZES.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="cli-table-card tx-card">
          <div className="table-wrapper" aria-busy={changingSize}>
            <table className="cli-table tx-table">
              <thead>
                <tr>
                  {[
                    'Data',
                    'Cliente',
                    'Pagamento',
                    'Descrição',
                    'Servidor',
                    'Plano',
                    'Telas',
                    'Créditos',
                    'Custo',
                    'Total',
                    'Lucro',
                    'Ações',
                  ].map((label) => (
                    <th
                      key={label}
                      className={label === 'Ações' ? 'col-acoes' : undefined}
                    >
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {!rows.length && (
                  <tr>
                    <td colSpan={12}>
                      <div className="auto-empty-state">
                        <Icon name="card" />
                        <h3>
                          {filteredView
                            ? 'Nenhuma transação encontrada'
                            : 'Nenhuma transação registrada'}
                        </h3>
                        <p>
                          {filteredView
                            ? 'Tente outro cliente, servidor ou pagamento.'
                            : 'As transações aparecerão aqui após os próximos pagamentos.'}
                        </p>
                        {filteredView && (
                          <button
                            className="btn btn-muted"
                            type="button"
                            onClick={() => {
                              setSearch('');
                              setPayment('');
                              applyFilters('', '');
                            }}
                          >
                            Limpar filtros
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
                {rows.map((item) => (
                  <tr
                    key={item.id}
                    className="tx-row"
                    tabIndex={0}
                    data-transaction-item={item.id}
                    aria-label={`Detalhes da transação de ${item.clienteNome || 'cliente'} em ${dateBr(item.data)}`}
                    onClick={(event) => {
                      if (
                        ((event.target as HTMLElement).closest(
                          'button, a, input, form, select, label',
                        ) as HTMLElement) ||
                        window.getSelection()?.toString()
                      )
                        return;
                      setSelected(item);
                    }}
                    onKeyDown={(event) => {
                      if ((event.target as HTMLElement) !== event.currentTarget)
                        return;
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        setSelected(item);
                      }
                    }}
                  >
                    <td className="tx-date-cell">
                      <span className="tx-date">{dateBr(item.data)}</span>
                    </td>
                    <td>{item.clienteNome || '-'}</td>
                    <td>
                      {item.formaPagamento ? (
                        <span className="badge badge-blue">
                          {item.formaPagamento}
                        </span>
                      ) : (
                        '-'
                      )}
                    </td>
                    <td>{item.descricao || '-'}</td>
                    <td>{item.servidor || '-'}</td>
                    <td>
                      {item.plano ? (
                        <span className="badge badge-muted">{item.plano}</span>
                      ) : (
                        '-'
                      )}
                    </td>
                    <td>{item.codigos ? '—' : item.telas}</td>
                    <td className={Number(item.creditos) < 0 ? 'tx-neg' : ''}>
                      {Number(item.creditos || 0)}
                    </td>
                    <td className="tx-neg">{money(item.custo)}</td>
                    <td className="tx-pos">{signedMoney(item.valorVenda)}</td>
                    <td
                      className={`tx-profit ${Number(item.lucro) < 0 ? 'tx-neg' : 'tx-pos'}`}
                    >
                      {signedMoney(item.lucro)}
                    </td>
                    <td className="col-acoes">
                      <button
                        type="button"
                        className="cli-ico-btn"
                        aria-label={`Detalhes da transação de ${item.clienteNome || 'cliente'}`}
                        onClick={() => setSelected(item)}
                      >
                        <Icon name="eye" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        {pagination && (pagination.pagina > 1 || pagination.temMais) && (
          <nav className="tx-pagination" aria-label="Páginas das transações">
            <div>
              {pagination.anteriorUrl && (
                <Link
                  href={pagination.anteriorUrl}
                  prefetch={false}
                  className="btn btn-muted"
                >
                  Anterior
                </Link>
              )}
            </div>
            <span>Página {pagination.pagina}</span>
            <div>
              {pagination.proximaUrl && (
                <Link
                  href={pagination.proximaUrl}
                  prefetch={false}
                  className="btn btn-muted"
                >
                  Próxima
                </Link>
              )}
            </div>
          </nav>
        )}
      </div>
      {selected && (
        <TransactionDetails item={selected} onClose={() => setSelected(null)} />
      )}
    </>
  );
}

export function TransactionsScreen({ data }: { data?: any }) {
  return (
    <NativePanel data={data} path="/transacoes">
      <TransactionsContent data={data} />
    </NativePanel>
  );
}

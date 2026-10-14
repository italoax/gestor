'use client';
import { useState } from 'react';
import { Icon } from '../../../src/frontend/clients/ui.jsx';
import { NativePanel } from '../../components/layout/NativePanel.jsx';
import { NativeDialog } from '../../components/ui/NativeDialog.jsx';

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

function TransactionDetails({ item, onClose }) {
  const details = [
    ['Pagamento', item.formaPagamento],
    ['Plano', item.plano],
    ['Servidor', item.servidor],
    ['Descrição', item.descricao],
    ['Telas', item.telas],
    ['Créditos', item.creditos],
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

export function TransactionsScreen({ data }) {
  const [selected, setSelected] = useState(null);
  const stats = [
    ['Transações', data.stats.total, 'card'],
    ['Telas', data.stats.telas, 'monitor'],
    ['Créditos', data.stats.creditos, 'server'],
    ['Receita', money(data.stats.receita), 'card'],
    ['Lucro', money(data.stats.lucro), 'chart'],
  ];
  return (
    <NativePanel data={data} path="/transacoes">
      <div className="container page-transacoes" data-react-page="transacoes">
        <div className="ui-summary ui-summary-5">
          {stats.map(([label, value, icon], index) => (
            <div className="tx-stat" key={label}>
              <div>
                <span>{label}</span>
                <strong
                  className={
                    index === 3
                      ? 'pos'
                      : index === 4
                        ? Number(data.stats.lucro) < 0
                          ? 'neg'
                          : 'pos'
                        : index === 2 && Number(data.stats.creditos) < 0
                          ? 'neg'
                          : ''
                  }
                >
                  {value ?? 0}
                </strong>
              </div>
              <div className="tx-stat-ico accent-blue">
                <Icon name={icon} />
              </div>
            </div>
          ))}
        </div>
        <div className="cli-table-card tx-card">
          <div className="tx-toolbar">
            <strong className="tx-title">Histórico de Transações</strong>
          </div>
          <div className="table-wrapper">
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
                {!data.transacoes.length && (
                  <tr>
                    <td colSpan={12}>
                      <div className="dist-empty">
                        Nenhuma transação registrada.
                      </div>
                    </td>
                  </tr>
                )}
                {data.transacoes.map((item) => (
                  <tr
                    key={item.id}
                    className="tx-row"
                    tabIndex={0}
                    data-transaction-item={item.id}
                    aria-label={`Detalhes da transação de ${item.clienteNome || 'cliente'} em ${dateBr(item.data)}`}
                    onClick={(event) => {
                      if (
                        event.target.closest(
                          'button, a, input, form, select, label',
                        ) ||
                        window.getSelection()?.toString()
                      )
                        return;
                      setSelected(item);
                    }}
                    onKeyDown={(event) => {
                      if (event.target !== event.currentTarget) return;
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
                    <td>{item.telas}</td>
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
          <div className="cli-table-foot">
            <span className="muted">
              {data.transacoes.length}{' '}
              {data.transacoes.length === 1 ? 'transação' : 'transações'}
            </span>
          </div>
        </div>
      </div>
      {selected && (
        <TransactionDetails item={selected} onClose={() => setSelected(null)} />
      )}
    </NativePanel>
  );
}

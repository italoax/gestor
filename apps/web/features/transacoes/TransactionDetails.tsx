'use client';
import { Icon } from '../../../../src/frontend/clients/ui.tsx';
import { NativeDialog } from '../../components/ui/NativeDialog.tsx';

const money = (value) =>
  Number(value || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
const signedMoney = (value) => `${Number(value) < 0 ? '' : '+'}${money(value)}`;
const dateBr = (value) => {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value || '—';
};

export function TransactionDetails({
  item,
  onClose,
}: {
  item: any;
  onClose: () => void;
}) {
  const quantity = item.codigos
    ? ['Códigos', item.codigos, 'key']
    : ['Telas', item.telas, 'monitor'];
  const usage = [
    quantity,
    ...(!item.codigos || Number(item.creditos) !== Number(item.codigos)
      ? [
          [
            'Créditos',
            Number(item.creditos || 0).toLocaleString('pt-BR'),
            'bolt',
          ],
        ]
      : []),
    ...(item.duracao ? [['Duração', item.duracao, 'clock']] : []),
  ];
  return (
    <NativeDialog
      title={
        <>
          <span className="tx-detail-title-icon">
            <Icon name="file" />
          </span>
          Detalhes da transação
        </>
      }
      className="transaction-details"
      width={560}
      onClose={onClose}
      footer={
        <>
          <span className="tx-detail-reference">Transação #{item.id}</span>
          <button type="button" className="btn btn-primary" onClick={onClose}>
            Fechar detalhes
          </button>
        </>
      }
    >
      <div
        className="modal-body tx-detail-body"
        data-transaction-details={item.id}
      >
        <div className="tx-detail-client">
          <span className="tx-detail-avatar">
            <Icon name="users" />
          </span>
          <div className="tx-detail-client-name">
            <span className="tx-detail-label">Cliente</span>
            <strong>{item.clienteNome || 'Não informado'}</strong>
          </div>
          <span className="tx-detail-date">
            <Icon name="calendar" />
            {dateBr(item.data)}
          </span>
        </div>

        <section
          className={`tx-detail-total${Number(item.valorVenda) < 0 ? ' is-negative' : ''}`}
          aria-label="Total recebido"
        >
          <div className="tx-detail-total-top">
            <span className="tx-detail-label">Total recebido</span>
            <span className="tx-detail-payment">
              <Icon name="card" />
              {item.formaPagamento || 'Não informado'}
            </span>
          </div>
          <strong className="tx-detail-amount">
            {signedMoney(item.valorVenda)}
          </strong>
        </section>

        <div className="tx-detail-finance">
          <div className="tx-detail-finance-item tx-detail-cost">
            <span className="tx-detail-label">Custo</span>
            <strong>{money(item.custo)}</strong>
          </div>
          <div
            className={`tx-detail-finance-item tx-detail-profit${Number(item.lucro) < 0 ? ' is-negative' : ''}`}
          >
            <span className="tx-detail-label">Lucro</span>
            <strong>{signedMoney(item.lucro)}</strong>
          </div>
        </div>

        <section
          className="tx-detail-subscription"
          aria-label="Dados da assinatura"
        >
          <h4>Dados da assinatura</h4>
          <dl className="tx-detail-plan">
            {[
              ['Plano', item.plano, 'package'],
              ['Servidor', item.servidor, 'server'],
            ].map(([label, value, icon]) => (
              <div key={label} className="tx-detail-field">
                <span className="tx-detail-field-icon">
                  <Icon name={icon} />
                </span>
                <div>
                  <dt>{label}</dt>
                  <dd>{value || 'Não informado'}</dd>
                </div>
              </div>
            ))}
          </dl>
          <dl className="tx-detail-usage">
            {usage.map(([label, value, icon]) => (
              <div key={label}>
                <dt>
                  <Icon name={icon} />
                  {label}
                </dt>
                <dd>{value ?? '—'}</dd>
              </div>
            ))}
          </dl>
        </section>
        <div className="tx-detail-description">
          <Icon name="file" />
          <div>
            <span className="tx-detail-label">Descrição</span>
            <p>{item.descricao || 'Sem descrição'}</p>
          </div>
        </div>
      </div>
    </NativeDialog>
  );
}

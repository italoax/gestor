import { useEffect, useState } from 'react';
import { NativeDialog } from '../../../apps/web/components/ui/NativeDialog.tsx';
import { formatMoney } from '../../services/format.ts';
import { displayTimestamp } from '../../shared/displayDate.ts';

export function ClientHistory({
  client,
  onClose,
}: {
  client: { id: string; name: string };
  onClose: () => void;
}) {
  const [state, setState] = useState({ loading: true, error: '', data: null });
  const [revision, setRevision] = useState(0);
  const [filter, setFilter] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    setState({ loading: true, error: '', data: null });
    fetch(`/clientes/${encodeURIComponent(client.id)}/historico`, {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]),
    })
      .then(async (response) => {
        if (!response.ok || response.redirected) throw Error();
        const data = await response.json();
        if (!data.ok || !Array.isArray(data.events)) throw Error();
        if (!controller.signal.aborted)
          setState({ loading: false, error: '', data });
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setState({
            loading: false,
            error: 'Não foi possível carregar o histórico. Tente novamente.',
            data: null,
          });
      });
    return () => controller.abort();
  }, [client.id, revision]);
  const events = (state.data?.events || []).filter(
    (item) =>
      !filter ||
      (filter === 'financeiro'
        ? ['pagamento', 'transacao'].includes(item.type)
        : item.type === filter),
  );
  return (
    <NativeDialog
      title={`Histórico de ${client.name}`}
      onClose={onClose}
      width={720}
      className="client-history-dialog"
    >
      <div className="modal-body">
        <p className="muted">
          Pagamentos, renovações, envios registrados e atualizações do cadastro.
        </p>
        <label className="field">
          <span>Mostrar no histórico</span>
          <select
            className="input"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
          >
            <option value="">Todos os registros</option>
            <option value="financeiro">Pagamentos e transações</option>
            <option value="renovacao">Renovações</option>
            <option value="mensagem">Mensagens</option>
            <option value="cadastro">Cadastro</option>
          </select>
        </label>
        {state.loading && <p role="status">Carregando histórico…</p>}
        {state.error && (
          <div role="alert">
            <p>{state.error}</p>
            <button
              type="button"
              className="btn btn-muted"
              onClick={() => setRevision((value) => value + 1)}
            >
              Tentar novamente
            </button>
          </div>
        )}
        {!state.loading &&
          !state.error &&
          (!events.length ? (
            <p className="muted">
              Nenhum registro encontrado para esta seleção.
            </p>
          ) : (
            <ol className="client-history-timeline">
              {events.map((item) => (
                <li key={item.key} data-history-type={item.type}>
                  <time dateTime={item.occurredAt}>
                    {displayTimestamp(item.occurredAt)}
                  </time>
                  <div className="client-history-entry">
                    <strong>{item.title}</strong>
                    {item.amount != null && (
                      <strong>{formatMoney(item.amount)}</strong>
                    )}
                  </div>
                  {item.detail && <p>{item.detail}</p>}
                </li>
              ))}
            </ol>
          ))}
        {state.data?.hasMore && (
          <p className="muted">
            Mostrando os 50 registros mais recentes. Use Transações e a Central
            de envios para consultar períodos anteriores.
          </p>
        )}
        <small className="muted">
          Atualizações do cadastro e mensagens manuais passam a ser registradas
          a partir desta versão.
        </small>
      </div>
    </NativeDialog>
  );
}

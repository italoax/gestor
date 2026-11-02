import { useState } from 'react';
import { NativeDialog } from '../../../apps/web/components/ui/NativeDialog.tsx';
import { CampaignEditor } from '../../../apps/web/features/automacao/ScheduledMessages.tsx';
import { Icon } from './ui.tsx';
import { clientsCsv, reviewMessageRecipients } from './bulkActions.ts';
import { appTodayIso } from '../../services/dates.ts';

export function ClientBulkActions({
  clients,
  visibleIds,
  totalVisible,
  onSelectVisible,
  onClear,
  onKeepVisible,
  mensagens = [],
  csrfToken,
  now,
  archived = false,
}: {
  clients: any[];
  visibleIds: Set<unknown>;
  totalVisible: number;
  onSelectVisible: () => void;
  onClear: () => void;
  onKeepVisible: () => void;
  mensagens?: any[];
  csrfToken: string;
  now: Date;
  archived?: boolean;
}) {
  const [action, setAction] = useState<'export' | 'message' | 'compose' | null>(
    null,
  );
  const [recipients, setRecipients] = useState<any[]>([]);
  const [notice, setNotice] = useState('');
  const hidden = clients.filter((client) => !visibleIds.has(client.id)).length;
  const { eligible, excluded } = reviewMessageRecipients(clients, archived);
  const accessCount = clients.reduce(
    (total, client) => total + (client.adicional ? 2 : 1),
    0,
  );

  function download() {
    let url: string;
    try {
      url = URL.createObjectURL(
        new Blob([clientsCsv(clients, now, archived)], {
          type: 'text/csv;charset=utf-8',
        }),
      );
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `clientes-${appTodayIso(now)}.csv`;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      setNotice(
        `Planilha preparada: ${clients.length} clientes e ${accessCount} acessos.`,
      );
      setAction(null);
    } catch {
      setNotice('Não foi possível preparar a planilha. Tente novamente.');
    } finally {
      if (url) setTimeout(() => URL.revokeObjectURL(url), 30_000);
    }
  }
  const close = () => setAction(null);
  return (
    <>
      <section className="client-bulk-bar" aria-label="Ações em lote">
        <div className="client-bulk-summary" role="status" aria-live="polite">
          <strong>
            {clients.length
              ? `${clients.length} ${clients.length === 1 ? 'cliente selecionado' : 'clientes selecionados'}`
              : 'Ações em lote'}
          </strong>
          <span>
            {hidden
              ? `${hidden} ${hidden === 1 ? 'selecionado fora' : 'selecionados fora'} dos filtros atuais.`
              : clients.length
                ? 'Confira os selecionados antes de exportar ou agendar o aviso.'
                : 'Selecione clientes para exportar ou agendar um aviso.'}
          </span>
        </div>
        <div className="client-bulk-buttons">
          <button
            type="button"
            className="btn btn-muted"
            disabled={!totalVisible}
            onClick={onSelectVisible}
          >
            Selecionar visíveis ({totalVisible})
          </button>
          <button
            type="button"
            className="btn btn-muted"
            data-bulk-action="export"
            disabled={!clients.length}
            onClick={() => setAction('export')}
          >
            <Icon name="download" /> Exportar CSV
          </button>
          <button
            type="button"
            className="btn btn-primary"
            data-bulk-action="message"
            disabled={!clients.length}
            onClick={() => setAction('message')}
          >
            <Icon name="message" /> Agendar aviso
          </button>
          {clients.length > 0 && (
            <button type="button" className="btn btn-ghost" onClick={onClear}>
              Limpar seleção
            </button>
          )}
          {hidden > 0 && (
            <button
              type="button"
              className="btn btn-ghost"
              onClick={onKeepVisible}
            >
              Manter só os visíveis
            </button>
          )}
        </div>
      </section>
      {notice && (
        <p className="client-bulk-notice" role="status">
          {notice}
        </p>
      )}
      {(action === 'export' || action === 'message') && (
        <NativeDialog
          title={
            action === 'export'
              ? 'Conferir exportação'
              : 'Conferir destinatários'
          }
          className="client-bulk-dialog"
          width={680}
          onClose={close}
          footer={
            <>
              <button type="button" className="btn btn-muted" onClick={close}>
                Cancelar
              </button>
              {action === 'export' ? (
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={!clients.length}
                  onClick={download}
                >
                  Baixar CSV ({clients.length})
                </button>
              ) : (
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={!eligible.length || eligible.length > 1000}
                  onClick={() => {
                    setRecipients(eligible);
                    setAction('compose');
                  }}
                >
                  Preparar aviso ({eligible.length})
                </button>
              )}
            </>
          }
        >
          <div className="modal-body">
            {action === 'export' ? (
              <p>
                {clients.length} clientes e {accessCount} acessos. A planilha
                inclui os dados de contato, planos, valores e vencimentos, com
                uma linha por acesso.
              </p>
            ) : (
              <p>
                {eligible.length} clientes disponíveis para o aviso. Confira os
                destinatários e depois escolha a mensagem e o horário.
              </p>
            )}
            {hidden > 0 && (
              <p className="client-bulk-warning">
                Esta seleção inclui {hidden} clientes fora dos filtros atuais.
                Eles também aparecem na lista abaixo.
              </p>
            )}
            {action === 'message' && eligible.length > 1000 && (
              <p className="client-bulk-warning" role="alert">
                Selecione até 1.000 destinatários por agendamento.
              </p>
            )}
            <ul
              className="client-bulk-review"
              aria-label={
                action === 'export'
                  ? 'Clientes da exportação'
                  : 'Destinatários do aviso'
              }
            >
              {(action === 'export' ? clients : eligible).map((client) => (
                <li key={client.id}>
                  <div>
                    <strong>{client.nome}</strong>
                    <span>
                      {client.telefone || 'Sem WhatsApp'} ·{' '}
                      {client.plano || 'Sem plano'} ·{' '}
                      {client.servidor || 'Sem servidor'}
                    </span>
                    {action === 'export' && client.adicional && (
                      <span>
                        Adicional: {client.adicional.plano || 'Sem plano'} ·{' '}
                        {client.adicional.servidor || 'Sem servidor'}
                      </span>
                    )}
                  </div>
                  {!visibleIds.has(client.id) && (
                    <small>Fora dos filtros</small>
                  )}
                </li>
              ))}
            </ul>
            {action === 'message' && excluded.length > 0 && (
              <div className="client-bulk-excluded">
                <h4>{excluded.length} clientes fora deste aviso</h4>
                <ul>
                  {excluded.map(({ client, reason }) => (
                    <li key={client.id}>
                      <strong>{client.nome}</strong>
                      <span>{reason}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </NativeDialog>
      )}
      {action === 'compose' && (
        <CampaignEditor
          item={null}
          initialClients={recipients}
          data={{ page: { csrfToken }, mensagens }}
          onClose={close}
        />
      )}
    </>
  );
}

'use client';
import { useEffect, useState } from 'react';
import { NativeDialog } from '../../components/ui/NativeDialog.tsx';
import { PanelNotice } from '../../components/ui/PanelNotice.tsx';
import { Icon } from '../../../../src/frontend/clients/ui.tsx';

export function DeliveryPreview({
  request,
  token,
  onClose,
}: {
  request: string;
  token: string;
  onClose: () => void;
}) {
  const [date, setDate] = useState('');
  const [page, setPage] = useState(1);
  const [group, setGroup] = useState('elegiveis');
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<{
    loading: boolean;
    error: string;
    data: any;
  }>({ loading: true, error: '', data: null });
  useEffect(() => {
    const controller = new AbortController();
    const body = new URLSearchParams(request);
    body.set('pagina', String(page));
    body.set('grupo', group);
    if (date) body.set('data_referencia', date);
    setState({ loading: true, error: '', data: null });
    fetch('/api/automacao/previa', {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      body,
      headers: { Accept: 'application/json', 'x-csrf-token': token },
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(20000)]),
    })
      .then(async (response) => {
        if (response.status === 401 || response.status === 403)
          throw Error(
            'Sua sessão expirou. Recarregue a página para continuar.',
          );
        if (response.status === 429)
          throw Error('Aguarde um pouco antes de atualizar a prévia.');
        const result = await response.json();
        if (!response.ok || !result.ok)
          throw Error(result.error || 'Não foi possível carregar a prévia.');
        if (!Array.isArray(result.clientes) || !result.resumo)
          throw Error('Não foi possível carregar a prévia.');
        if (!controller.signal.aborted)
          setState({ loading: false, error: '', data: result });
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setState({
            loading: false,
            error:
              error.name === 'TimeoutError'
                ? 'A consulta demorou demais. Tente novamente.'
                : error.message === 'Failed to fetch' ||
                    error instanceof SyntaxError
                  ? 'Não foi possível carregar a prévia. Tente novamente.'
                  : error.message,
            data: null,
          });
      });
    return () => controller.abort();
  }, [request, token, date, page, group, revision]);
  const result = state.data;
  const chooseGroup = (value: string) => {
    setGroup(value);
    setPage(1);
  };
  return (
    <NativeDialog
      title={
        <span className="delivery-preview-title">
          <span className="delivery-preview-title-icon">
            <Icon name="eye" />
          </span>
          Prévia dos envios
        </span>
      }
      width={880}
      className="delivery-preview-dialog"
      onClose={onClose}
      footer={
        <>
          <span className="delivery-preview-footer-note">
            <Icon name="shield" /> Somente simulação
          </span>
          <button type="button" className="btn btn-muted" onClick={onClose}>
            Fechar prévia
          </button>
        </>
      }
    >
      <div className="modal-body delivery-preview">
        <p className="delivery-preview-intro">
          Confira os destinatários e o conteúdo de cada mensagem antes de ativar
          a regra.
        </p>
        <section
          className="delivery-preview-config"
          aria-label="Configuração da simulação"
        >
          <div className="delivery-preview-rule">
            <span className="delivery-preview-label">Regra selecionada</span>
            <strong>{result?.titulo || 'Consultando regra…'}</strong>
            {result?.horario && (
              <span className="delivery-preview-schedule">
                <Icon name="clock" />
                {result.horario} · Brasília
              </span>
            )}
          </div>
          <div className="delivery-preview-toolbar">
            <label className="field">
              <span>Data de referência</span>
              <input
                className="input"
                type="date"
                aria-label="Data de referência (Brasília)"
                value={date || result?.data || ''}
                onChange={(event) => {
                  setDate(event.target.value);
                  setPage(1);
                }}
              />
            </label>
            <button
              type="button"
              className="btn btn-muted"
              disabled={state.loading}
              onClick={() => setRevision((value) => value + 1)}
            >
              <svg
                className="ui-icon"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M20 7v5h-5M4 17v-5h5M6.1 6.1A8.35 8.35 0 0 1 20 12M4 12a8.35 8.35 0 0 0 13.9 5.9" />
              </svg>
              Atualizar prévia
            </button>
          </div>
        </section>
        <div
          className="delivery-preview-results"
          aria-live="polite"
          aria-busy={state.loading}
        >
          {state.loading ? (
            <div className="delivery-preview-loading" role="status">
              <span className="btn-spinner" /> Preparando sua prévia…
            </div>
          ) : state.error ? (
            <PanelNotice inline error>
              {state.error}
            </PanelNotice>
          ) : (
            result && (
              <>
                <div className="delivery-preview-section-heading">
                  <h4>Destinatários</h4>
                  <span>{result.resumo.total} clientes analisados</span>
                </div>
                <div
                  className="delivery-preview-summary"
                  role="group"
                  aria-label="Destinatários da prévia"
                >
                  {[
                    [
                      'elegiveis',
                      'Elegíveis',
                      'users',
                      'Envios pendentes nesta data',
                    ],
                    [
                      'ignorados',
                      'Ignorados',
                      'archive',
                      'Confira os motivos de exclusão',
                    ],
                  ].map(([value, label, icon, caption]) => (
                    <button
                      type="button"
                      key={value}
                      className="delivery-preview-stat"
                      data-kind={value}
                      aria-pressed={group === value}
                      aria-label={label + ': ' + result.resumo[value]}
                      onClick={() => chooseGroup(value)}
                    >
                      <span className="delivery-preview-stat-top">
                        <Icon name={icon} />
                        <span>{label}</span>
                        <span className="delivery-preview-stat-indicator" />
                      </span>
                      <strong>{result.resumo[value]}</strong>
                      <small>{caption}</small>
                    </button>
                  ))}
                </div>
                <p className="delivery-preview-hint">
                  A seleção considera os filtros da regra e os envios já
                  registrados na data escolhida.
                </p>
                {!result.clientes.length ? (
                  <div className="delivery-preview-empty">
                    <span className="delivery-preview-empty-icon">
                      <Icon
                        name={group === 'elegiveis' ? 'users' : 'archive'}
                      />
                    </span>
                    <h4>
                      {group === 'elegiveis'
                        ? 'Nenhum cliente elegível'
                        : 'Nenhum cliente ignorado'}
                    </h4>
                    <p>
                      {group === 'elegiveis'
                        ? 'Não há envios pendentes para os filtros dessa data.'
                        : 'Todos os clientes analisados estão elegíveis para esta data.'}
                    </p>
                    {group === 'elegiveis' && result.resumo.ignorados > 0 && (
                      <button
                        type="button"
                        className="delivery-preview-empty-action"
                        onClick={() => chooseGroup('ignorados')}
                      >
                        Ver motivos dos {result.resumo.ignorados} ignorados{' '}
                        <span aria-hidden="true">→</span>
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="delivery-preview-clients">
                    {result.clientes.map((client, index) => (
                      <details
                        key={client.id}
                        className="delivery-preview-client"
                        open={index === 0}
                      >
                        <summary>
                          <span
                            className="delivery-preview-avatar"
                            aria-hidden="true"
                          >
                            {String(client.nome)
                              .trim()
                              .slice(0, 1)
                              .toLocaleUpperCase('pt-BR')}
                          </span>
                          <span className="delivery-preview-client-name">
                            <strong>{client.nome}</strong>
                            <small>
                              {client.elegivel
                                ? 'Conteúdo personalizado'
                                : client.motivos[0] ||
                                  'Fora dos critérios da regra'}
                            </small>
                          </span>
                          <span
                            className="delivery-preview-client-badge"
                            data-eligible={client.elegivel}
                          >
                            {client.elegivel
                              ? client.mensagens.length === 1
                                ? '1 mensagem'
                                : client.mensagens.length + ' mensagens'
                              : 'Ignorado'}
                          </span>
                          <span
                            className="delivery-preview-chevron"
                            aria-hidden="true"
                          />
                        </summary>
                        <div className="delivery-preview-content">
                          {client.avisos.map((warning) => (
                            <PanelNotice
                              key={warning}
                              inline
                              info
                              title="Confira antes de enviar"
                            >
                              {warning}
                            </PanelNotice>
                          ))}
                          {client.motivos.length > 0 && (
                            <div className="delivery-preview-reasons">
                              <span className="delivery-preview-label">
                                {client.elegivel
                                  ? 'Acessos ignorados'
                                  : 'Motivos de exclusão'}
                              </span>
                              <ul>
                                {client.motivos.map((reason) => (
                                  <li key={reason}>{reason}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                          {client.mensagens.map((message, index) => (
                            <div
                              key={index}
                              className="delivery-preview-message"
                            >
                              <span className="delivery-preview-message-label">
                                Mensagem {index + 1}
                              </span>
                              {message.anexo && (
                                <p className="muted">
                                  Anexo do template:{' '}
                                  {message.anexo === 'audio'
                                    ? 'áudio'
                                    : message.anexo === 'video'
                                      ? 'vídeo'
                                      : message.anexo === 'image'
                                        ? 'imagem'
                                        : message.anexo}
                                </p>
                              )}
                              {message.cobrancaPix && (
                                <p>
                                  Cobrança Pix de{' '}
                                  {Number(message.valor).toLocaleString(
                                    'pt-BR',
                                    { style: 'currency', currency: 'BRL' },
                                  )}
                                </p>
                              )}
                              <pre>
                                {message.texto ||
                                  (message.anexo === 'audio'
                                    ? 'Áudio do template (sem legenda).'
                                    : message.cobrancaPix
                                      ? 'Você recebeu uma solicitação de pagamento.'
                                      : 'Mensagem sem texto.')}
                              </pre>
                            </div>
                          ))}
                        </div>
                      </details>
                    ))}
                  </div>
                )}
                {(result.temMais || page > 1) && (
                  <div className="recipients-pagination">
                    <button
                      type="button"
                      className="btn btn-muted"
                      disabled={page === 1}
                      onClick={() => setPage((value) => value - 1)}
                    >
                      Anterior
                    </button>
                    <span>Página {page}</span>
                    <button
                      type="button"
                      className="btn btn-muted"
                      disabled={!result.temMais}
                      onClick={() => setPage((value) => value + 1)}
                    >
                      Próxima
                    </button>
                  </div>
                )}
                <aside
                  className="delivery-preview-notes"
                  aria-label="Observações da prévia"
                >
                  <Icon name="shield" />
                  <div>
                    <strong>Antes do envio</strong>
                    <ul>
                      {result.avisos.map((warning) => (
                        <li key={warning}>{warning}</li>
                      ))}
                      <li>
                        A execução depende da regra ativa, do agendamento e da
                        conexão com o WhatsApp.
                      </li>
                    </ul>
                  </div>
                </aside>
              </>
            )
          )}
        </div>
      </div>
    </NativeDialog>
  );
}

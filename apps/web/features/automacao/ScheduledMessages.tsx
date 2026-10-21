'use client';
import { useEffect, useState } from 'react';
import { PanelNotice } from '../../components/ui/PanelNotice.tsx';
import { CsrfInput, Icon } from '../../../../src/frontend/clients/ui.tsx';
import { formatDateBr } from '../../../../src/services/format.ts';
import { NativeDialog } from '../../components/ui/NativeDialog.tsx';
import { useNativeSubmit } from '../../hooks/useNativeSubmit.ts';

const weekdays = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
function CampaignAction({
  item,
  token,
  action,
  children,
  confirm,
}: {
  item: any;
  token: string;
  action: string;
  children: React.ReactNode;
  confirm?: string;
}) {
  const submit = useNativeSubmit(confirm);
  return (
    <form method="post" action="/automacao" onSubmit={submit}>
      <CsrfInput token={token} />
      <input type="hidden" name="id" value={item.id} />
      <input type="hidden" name="action" value={action} />
      {children}
    </form>
  );
}

export function CampaignEditor({
  item,
  data,
  onClose,
}: {
  item: any;
  data: any;
  onClose: () => void;
}) {
  const [mode, setMode] = useState(item?.campanha.modo || 'unico');
  const [key] = useState(() => crypto.randomUUID());
  const [text, setText] = useState(item?.campanha.mensagem || '');
  const [selected, setSelected] = useState<number[]>(
    item?.campanha.clientesIds || [],
  );
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [retry, setRetry] = useState(0);
  const [clients, setClients] = useState({
    loading: true,
    error: '',
    rows: [],
    more: false,
  });
  const submit = useNativeSubmit();
  useEffect(() => {
    const controller = new AbortController();
    setClients((previous) => ({ ...previous, loading: true, error: '' }));
    const timer = setTimeout(() => {
      fetch(
        `/automacao/clientes?termo=${encodeURIComponent(search)}&pagina=${page}`,
        {
          headers: { Accept: 'application/json' },
          cache: 'no-store',
          signal: AbortSignal.any([
            controller.signal,
            AbortSignal.timeout(15000),
          ]),
        },
      )
        .then(async (response) => {
          if (!response.ok)
            throw Error(
              response.status === 429
                ? 'Aguarde um pouco antes de pesquisar novamente.'
                : 'Não foi possível carregar os clientes.',
            );
          const result = await response.json();
          if (!result.ok || !Array.isArray(result.clientes))
            throw Error('Resposta de clientes inválida.');
          if (!controller.signal.aborted)
            setClients({
              loading: false,
              error: '',
              rows: result.clientes,
              more: result.mais === true,
            });
        })
        .catch((error) => {
          if (!controller.signal.aborted)
            setClients({
              loading: false,
              error: error.message,
              rows: [],
              more: false,
            });
        });
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [search, page, retry]);
  function select(id, checked) {
    setSelected((previous) =>
      checked
        ? [...new Set([...previous, id])].slice(0, 1000)
        : previous.filter((value) => value !== id),
    );
  }
  return (
    <NativeDialog
      title={item ? 'Editar envio automático' : 'Novo envio automático'}
      width={640}
      className="campaign-editor"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-muted" type="button" onClick={onClose}>
            Cancelar
          </button>
          <button
            className="btn btn-primary"
            type="submit"
            form="scheduled-message-form"
            disabled={!selected.length || !text.trim()}
          >
            Salvar
          </button>
        </>
      }
    >
      <form
        id="scheduled-message-form"
        className="modal-body"
        method="post"
        action="/automacao"
        onSubmit={submit}
      >
        <CsrfInput token={data.page.csrfToken} />
        <input
          type="hidden"
          name="action"
          value={item ? 'update_campanha' : 'create_campanha'}
        />
        <input type="hidden" name="id" value={item?.id || ''} />
        <input type="hidden" name="chave" value={key} />
        {selected.map((id) => (
          <input key={id} type="hidden" name="clientes_ids[]" value={id} />
        ))}
        <label className="field">
          <span>Nome *</span>
          <input
            className="input"
            name="nome"
            defaultValue={item?.titulo || ''}
            maxLength={160}
            required
            placeholder="Ex.: Aviso de manutenção"
          />
        </label>
        <section className="auto-form-section">
          <label className="field">
            <span>Modelo</span>
            <select
              className="input"
              defaultValue=""
              onChange={(event) => {
                const template = data.mensagens.find(
                  (row) => String(row.id) === event.target.value,
                );
                if (template) setText(template.mensagem);
              }}
            >
              <option value="">Sem modelo</option>
              {data.mensagens.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.titulo}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Mensagem *</span>
            <textarea
              className="input campaign-message"
              name="mensagem"
              value={text}
              onChange={(event) => setText(event.target.value)}
              maxLength={10000}
              rows={4}
              required
              placeholder="Olá {nome}, temos uma novidade para você..."
            />
          </label>
        </section>
        <section className="auto-form-section">
          <div className="campaign-schedule-grid">
            <label className="field full">
              <span>Frequência *</span>
              <select
                className="input"
                name="modo"
                value={mode}
                onChange={(event) => setMode(event.target.value)}
              >
                <option value="unico">Uma vez</option>
                <option value="semanal">Semanal</option>
              </select>
            </label>
            {mode === 'unico' && (
              <label className="field">
                <span>Data *</span>
                <input
                  className="input"
                  type="date"
                  name="data_envio"
                  required
                  defaultValue={item?.campanha.data || ''}
                />
              </label>
            )}
            <label className={`field ${mode === 'semanal' ? 'full' : ''}`}>
              <span>Hora (Brasília) *</span>
              <input
                className="input"
                type="time"
                name="hora_envio"
                required
                defaultValue={String(item?.horaEnvio || '09:00').slice(0, 5)}
              />
            </label>
          </div>
          {mode === 'semanal' && (
            <fieldset className="campaign-days">
              <legend>Dias da semana</legend>
              <div className="auto-days">
                {weekdays.map((day, index) => (
                  <label className="auto-day" key={day}>
                    <input
                      type="checkbox"
                      name="dias_semana[]"
                      value={index}
                      defaultChecked={
                        item
                          ? item.diasSemanaLista
                              ?.map(String)
                              .includes(String(index))
                          : [1, 2, 3, 4, 5].includes(index)
                      }
                    />
                    <span>{day}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          )}
        </section>
        <section className="auto-form-section">
          <h4>
            Clientes{' '}
            <span className="campaign-count" aria-live="polite">
              {selected.length}{' '}
              {selected.length === 1 ? 'selecionado' : 'selecionados'}
            </span>
          </h4>
          <label className="field">
            <input
              className="input"
              type="search"
              aria-label="Buscar clientes"
              value={search}
              onKeyDown={(event) => {
                if (event.key === 'Enter') event.preventDefault();
              }}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              placeholder="Nome ou telefone"
            />
          </label>
          <div className="campaign-selection-tools">
            <button
              className="btn btn-muted"
              type="button"
              disabled={clients.loading || !clients.rows.length}
              onClick={() =>
                setSelected((previous) =>
                  [
                    ...new Set([
                      ...previous,
                      ...clients.rows.map((row) => row.id),
                    ]),
                  ].slice(0, 1000),
                )
              }
            >
              Selecionar página
            </button>
            <button
              className="btn btn-muted"
              type="button"
              disabled={!selected.length}
              onClick={() => setSelected([])}
            >
              Limpar
            </button>
          </div>
          {clients.loading ? (
            <p role="status">Carregando clientes…</p>
          ) : clients.error ? (
            <div role="alert">
              <p>{clients.error}</p>
              <button
                className="btn btn-muted"
                type="button"
                onClick={() => setRetry((value) => value + 1)}
              >
                Tentar novamente
              </button>
            </div>
          ) : (
            <>
              <div className="campaign-clients">
                {!clients.rows.length ? (
                  <p className="muted">Nenhum cliente ativo encontrado.</p>
                ) : (
                  clients.rows.map((row) => (
                    <label className="campaign-client" key={row.id}>
                      <input
                        type="checkbox"
                        checked={selected.includes(row.id)}
                        onChange={(event) =>
                          select(row.id, event.target.checked)
                        }
                        disabled={
                          !selected.includes(row.id) && selected.length >= 1000
                        }
                      />
                      <span>
                        <strong>{row.nome}</strong>
                        <small>
                          {row.telefone} · {row.servidor || 'Sem servidor'}
                        </small>
                      </span>
                    </label>
                  ))
                )}
              </div>
              <div className="campaign-selection-tools">
                <button
                  className="btn btn-muted"
                  type="button"
                  disabled={page === 1}
                  onClick={() => setPage((value) => value - 1)}
                >
                  Anterior
                </button>
                <span>Página {page}</span>
                <button
                  className="btn btn-muted"
                  type="button"
                  disabled={!clients.more}
                  onClick={() => setPage((value) => value + 1)}
                >
                  Próxima
                </button>
              </div>
            </>
          )}
        </section>
      </form>
    </NativeDialog>
  );
}

export function ScheduledMessages({
  data,
  onEdit,
}: {
  data: any;
  onEdit: (item: any) => void;
}) {
  const campaigns = data.regras.filter((item) => item.campanha);
  return (
    <section className="campaigns" aria-label="Envios automáticos">
      {data.agendamentoAtivo === false && (
        <PanelNotice inline error>
          O envio automático está desativado no servidor. Você pode salvar os
          agendamentos, mas eles só serão enviados quando a automação estiver
          ativada.
        </PanelNotice>
      )}
      {!campaigns.length ? (
        <div className="auto-empty-state">
          <Icon name="calendar" />
          <h3>Nenhum envio agendado</h3>
          <p>Escolha a mensagem, os clientes e quando deseja enviar.</p>
        </div>
      ) : (
        <div className="auto-list">
          {campaigns.map((item) => (
            <article
              className={`auto-rule ${item.status === 'Ativo' ? 'is-on' : ''}`}
              key={item.id}
            >
              <div className="auto-rule-body">
                <div className="auto-rule-top">
                  <strong>{item.titulo}</strong>
                  <small>
                    {item.status === 'Ativo' ? 'Agendado' : item.status}
                  </small>
                </div>
                <p className="auto-badge">
                  {item.campanha.modo === 'unico'
                    ? formatDateBr(item.campanha.data)
                    : item.diasSemanaLista
                        .map((day) => weekdays[Number(day)])
                        .join(', ')}{' '}
                  às {String(item.horaEnvio).slice(0, 5)} · Brasília
                </p>
                <p className="campaign-preview">{item.campanha.mensagem}</p>
                <p className="muted">
                  {item.campanha.clientesIds.length} clientes selecionados ·{' '}
                  {item.campanha.modo === 'unico'
                    ? 'Envio único'
                    : 'Repetição semanal'}
                </p>
                {item.campanha.modo === 'semanal' && item.envioHoje && (
                  <p className="muted">
                    {item.envioHoje.rotulo}: {item.envioHoje.detalhe}
                  </p>
                )}
              </div>
              <div className="auto-rule-actions">
                {item.status === 'Ativo' && (
                  <CampaignAction
                    item={item}
                    token={data.page.csrfToken}
                    action="pause_campanha"
                  >
                    <button className="btn btn-muted" type="submit">
                      Pausar
                    </button>
                  </CampaignAction>
                )}
                {item.status === 'Pausada' && (
                  <CampaignAction
                    item={item}
                    token={data.page.csrfToken}
                    action="resume_campanha"
                  >
                    <button
                      className="btn btn-muted"
                      type="submit"
                      title="Retoma somente os envios pendentes seguros. Envios confirmados ou incertos não serão repetidos."
                    >
                      Retomar pendentes
                    </button>
                  </CampaignAction>
                )}
                {item.status !== 'Concluído' && (
                  <button
                    className="cli-ico-btn"
                    type="button"
                    aria-label={`Editar envio ${item.titulo}`}
                    onClick={() => onEdit(item)}
                  >
                    <Icon name="edit" />
                  </button>
                )}
                <CampaignAction
                  item={item}
                  token={data.page.csrfToken}
                  action="delete_campanha"
                  confirm="Excluir este agendamento? Mensagens já enviadas permanecem no WhatsApp."
                >
                  <button
                    className="cli-ico-btn danger"
                    type="submit"
                    aria-label={`Excluir envio ${item.titulo}`}
                  >
                    <Icon name="trash" />
                  </button>
                </CampaignAction>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

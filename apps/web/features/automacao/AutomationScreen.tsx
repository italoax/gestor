'use client';
import { useEffect, useState } from 'react';
import { PanelNotice } from '../../components/ui/PanelNotice.tsx';
import { CsrfInput, Icon } from '../../../../src/frontend/clients/ui.tsx';
import { NativePanel } from '../../components/layout/NativePanel.tsx';
import { NativeDialog } from '../../components/ui/NativeDialog.tsx';
import { useNativeSubmit } from '../../hooks/useNativeSubmit.ts';
import { useSearchParams } from 'next/navigation';
import { CampaignEditor, ScheduledMessages } from './ScheduledMessages.tsx';
import { DispatchHistory } from './DispatchHistory.tsx';

const triggers = [
  ['Todos', 'Todos os clientes'],
  ['Vencimento', 'Antes do vencimento do plano'],
  ['Vence hoje', 'No dia do vencimento do plano'],
  ['Vencidos', 'Após vencimento do plano'],
  ['Apos cadastro', 'Após cadastro'],
];
const truthy = (value) => Boolean(Number(value));
function triggerLabel(type?: string) {
  return (
    triggers.find(
      ([value]) => value.toLowerCase() === type?.toLowerCase(),
    )?.[1] || 'Todos os clientes'
  );
}
function ActionForm({
  item,
  token,
  action,
  children,
  confirm,
}: {
  item?: any;
  token?: string;
  action?: string;
  children?: React.ReactNode;
  confirm?: any;
}) {
  const submit = useNativeSubmit(confirm);
  return (
    <form
      method="post"
      action="/automacao"
      className={action === 'toggle_regra' ? 'auto-toggle-form' : undefined}
      onSubmit={submit}
    >
      <CsrfInput token={token} />
      <input type="hidden" name="action" value={action} />
      <input type="hidden" name="id" value={item.id} />
      {children}
    </form>
  );
}
function RuleEditor({
  item,
  data,
  onClose,
}: {
  item?: any;
  data?: any;
  onClose?: (...args: any[]) => any;
}) {
  const [type, setType] = useState(
    triggers.find(
      ([value]) => value.toLowerCase() === item?.tipo?.toLowerCase(),
    )?.[0] || 'Vencimento',
  );
  const [message, setMessage] = useState(String(item?.mensagemId || ''));
  const [batches, setBatches] = useState(truthy(item?.envioLotes));
  const submit = useNativeSubmit();
  const days = item
    ? item.diasSemanaLista || []
    : ['0', '1', '2', '3', '4', '5', '6'];
  const input = (label, name, value, props: Record<string, any> = {}) => (
    <label className="field">
      <span>{label}</span>
      <input
        className="input"
        name={name}
        defaultValue={value ?? ''}
        {...props}
      />
    </label>
  );
  return (
    <NativeDialog
      title={item ? 'Editar Regra' : 'Nova Regra'}
      width={800}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-muted" type="button" onClick={onClose}>
            Cancelar
          </button>
          <button
            className="btn btn-primary"
            type="submit"
            form="react-rule-form"
          >
            Salvar regra
          </button>
        </>
      }
    >
      <form
        method="post"
        action="/automacao"
        id="react-rule-form"
        className="modal-body"
        onSubmit={submit}
      >
        <CsrfInput token={data.page.csrfToken} />
        <input
          type="hidden"
          name="action"
          value={`${item ? 'update' : 'create'}_regra`}
        />
        <input type="hidden" name="id" value={item?.id || ''} />
        <input
          type="hidden"
          name="rodape_antiban"
          value={truthy(item?.rodapeAntiban) ? '1' : '0'}
        />
        <section className="auto-form-section">
          <h4>Regra e gatilho</h4>
          {input('Nome da regra *', 'nome', item?.titulo, { required: true })}
          <div className="auto-trigger-list">
            {triggers.map(([value, label]) => (
              <label
                key={value}
                className={`auto-trigger ${type === value ? 'is-selected' : ''}`}
              >
                <input
                  type="radio"
                  name="tipo"
                  value={value}
                  checked={type === value}
                  onChange={() => setType(value)}
                />
                <div>
                  <strong>{label}</strong>
                </div>
              </label>
            ))}
          </div>
          <div
            className="auto-period"
            hidden={!['Vencimento', 'Vencidos', 'Apos cadastro'].includes(type)}
          >
            <span className="auto-label">
              {type === 'Vencimento'
                ? 'Quanto tempo antes do vencimento do plano?'
                : type === 'Vencidos'
                  ? 'Quanto tempo após o vencimento do plano?'
                  : 'Quanto tempo após o cadastro?'}
            </span>
            <div className="auto-period-row">
              {input('Período', 'periodo', item?.periodo ?? 3, {
                type: 'number',
                min: 0,
              })}
              {['Dias', 'Minutos'].map((unit) => (
                <label className="auto-seg sm" key={unit}>
                  <input
                    type="radio"
                    name="tipo_periodo"
                    value={unit}
                    defaultChecked={
                      unit.toLowerCase() ===
                      String(item?.tipoPeriodo || 'Dias').toLowerCase()
                    }
                  />
                  <span>{unit}</span>
                </label>
              ))}
            </div>
          </div>
        </section>
        <section className="auto-form-section">
          <h4>Mensagem</h4>
          <label className="field full">
            <span>Template de mensagem *</span>
            <select
              className="input"
              name="mensagem_id"
              value={message}
              onChange={(event) =>
                setMessage((event.target as HTMLSelectElement).value)
              }
            >
              <option value="">Selecione um template...</option>
              {data.mensagens.map((row) => (
                <option value={row.id} key={row.id}>
                  {row.titulo}
                </option>
              ))}
            </select>
          </label>
          <div className="auto-preview">
            {data.mensagens.find((row) => String(row.id) === message)
              ?.mensagem || 'Selecione um template para ver a prévia.'}
          </div>
          <small className="muted">
            As variáveis serão substituídas pelos dados reais no envio.
          </small>
        </section>
        <section className="auto-form-section">
          <h4>Configurações de envio</h4>
          <label className="switch-field">
            <span>Regra ativa</span>
            <input
              type="checkbox"
              name="ativa"
              className="switch"
              value="1"
              defaultChecked={!item || item.status === 'Ativo'}
            />
          </label>
          <div className="auto-box">
            <div className="auto-box-title">Agendamento</div>
            {input(
              'Horário',
              'hora_envio',
              String(item?.horaEnvio || '09:00').slice(0, 5),
              { type: 'time' },
            )}
            <div className="auto-days">
              {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map(
                (label, index) => (
                  <label className="auto-day" key={label}>
                    <input
                      type="checkbox"
                      name="dias_semana[]"
                      value={index}
                      defaultChecked={days.map(String).includes(String(index))}
                    />
                    <span>{label}</span>
                  </label>
                ),
              )}
            </div>
          </div>
          <div className="auto-box">
            <div className="auto-box-title">Intervalo entre envios</div>
            <small className="muted">
              Tempo aleatório entre cada mensagem para evitar bloqueios.
            </small>
            <div className="form-grid">
              {input('Mín (seg)', 'min_delay', item ? item.minDelay : 5, {
                type: 'number',
                min: 0,
              })}
              {input('Máx (seg)', 'max_delay', item ? item.maxDelay : 15, {
                type: 'number',
                min: 0,
              })}
            </div>
          </div>
          <div className="auto-box">
            <label className="switch-field">
              <span>Envio em lotes</span>
              <input
                type="checkbox"
                name="envio_lotes"
                value="1"
                className="switch"
                checked={batches}
                onChange={(event) =>
                  setBatches((event.target as HTMLInputElement).checked)
                }
              />
            </label>
            <div className="form-grid" hidden={!batches}>
              {input(
                'Mensagens por lote',
                'lote_tamanho',
                item?.loteTamanho ?? 20,
                { type: 'number', min: 1 },
              )}
              {input(
                'Pausa entre lotes (seg)',
                'lote_pausa',
                item?.lotePausa ?? 60,
                { type: 'number', min: 0 },
              )}
            </div>
          </div>
          <div className="auto-box">
            <div className="auto-box-title">Para quais clientes enviar?</div>
            <div className="form-grid">
              {[
                [
                  'Servidor',
                  'filtro_servidor',
                  data.servidores,
                  item?.filtroServidor,
                ],
                ['Plano', 'filtro_plano', data.planos, item?.filtroPlano],
              ].map(([label, name, rows, value]) => (
                <label className="field" key={name}>
                  <span>{label}</span>
                  <select
                    className="input"
                    name={name}
                    defaultValue={value || ''}
                  >
                    <option value="">Todos</option>
                    {rows.map((row) => (
                      <option key={row.id}>{row.nome}</option>
                    ))}
                  </select>
                </label>
              ))}
              <label className="field">
                <span>Arquivados</span>
                <select
                  className="input"
                  name="filtro_arquivados"
                  defaultValue={item?.filtroArquivados || ''}
                >
                  <option value="">Não arquivado</option>
                  <option>Arquivado</option>
                  <option value="todos">Todos</option>
                </select>
              </label>
            </div>
          </div>
        </section>
      </form>
    </NativeDialog>
  );
}
function Recipients({
  item,
  onClose,
}: {
  item?: any;
  onClose?: (...args: any[]) => any;
}) {
  const [state, setState] = useState<{
    loading: boolean;
    clientes: any[];
    error?: boolean;
  }>({ loading: true, clientes: [] });
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/automacao/regra/${encodeURIComponent(item.id)}/recebedores`, {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error();
        const data = await response.json();
        if (!data.ok || !Array.isArray(data.clientes)) throw new Error();
        setState({ loading: false, clientes: data.clientes });
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setState({ loading: false, error: true, clientes: [] });
      });
    return () => controller.abort();
  }, [item.id]);
  return (
    <NativeDialog title="Clientes que vão receber" onClose={onClose}>
      <div className="modal-body">
        <p className="muted">{item.titulo}</p>
        <div className="receb-list">
          {state.loading ? (
            <p role="status">Carregando...</p>
          ) : state.error ? (
            <PanelNotice inline error>
              Não foi possível carregar os clientes.
            </PanelNotice>
          ) : !state.clientes.length ? (
            <p>Nenhum cliente atende a essa regra hoje.</p>
          ) : (
            state.clientes.map((client, index) => (
              <div
                className="receb-row"
                key={`${client.id}-${client.acessoChave}-${index}`}
              >
                <div className="receb-info">
                  <strong>{client.nome}</strong>
                  <span>{client.telefone}</span>
                  <span>
                    {client.servidor} · {client.plano} ·{' '}
                    {Number(client.valor || 0).toLocaleString('pt-BR', {
                      style: 'currency',
                      currency: 'BRL',
                    })}
                  </span>
                </div>
                <span className="receb-venc">
                  {String(client.vencimento || '')
                    .slice(0, 10)
                    .split('-')
                    .reverse()
                    .join('/')}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </NativeDialog>
  );
}
export function AutomationScreen({ data }: { data?: any }) {
  const params = useSearchParams();
  const [tab, setTab] = useState(
    ['envios', 'disparos'].includes(params?.get('aba'))
      ? params.get('aba')
      : 'regras',
  );
  const [editor, setEditor] = useState(null);
  const [scheduledEditor, setScheduledEditor] = useState<{ item: any } | null>(
    null,
  );
  const [recipients, setRecipients] = useState(null);
  return (
    <NativePanel data={data} path="/automacao">
      <div className="container page-automacao" data-react-page="automacao">
        <div className="auto-tabs auto-toolbar">
          <div
            className="auto-tab-options"
            role="group"
            aria-label="Abas de automação"
          >
            {['regras', 'envios', 'disparos'].map((value) => (
              <button
                type="button"
                key={value}
                className={`auto-tab ${tab === value ? 'active' : ''}`}
                aria-pressed={tab === value}
                onClick={() => setTab(value)}
              >
                {value === 'regras'
                  ? 'Regras'
                  : value === 'envios'
                    ? 'Envios automáticos'
                    : 'Disparos'}
              </button>
            ))}
          </div>
          {tab !== 'disparos' && (
            <button
              type="button"
              className="btn btn-primary auto-new"
              onClick={() =>
                tab === 'envios'
                  ? setScheduledEditor({ item: null })
                  : setEditor({ item: null })
              }
            >
              <Icon name="plus" />
              {tab === 'envios' ? 'Novo envio' : 'Nova regra'}
            </button>
          )}
        </div>
        {tab === 'envios' ? (
          <ScheduledMessages
            data={data}
            onEdit={(item) => setScheduledEditor({ item })}
          />
        ) : tab === 'regras' ? (
          <div className="auto-list">
            {!data.regras.some((item) => !item.campanha) && (
              <div className="auto-empty-state">
                <Icon name="bolt" />
                <h3>Nenhuma regra criada</h3>
                <p>
                  Crie uma regra para enviar mensagens antes ou depois do
                  vencimento.
                </p>
              </div>
            )}
            {data.regras
              .filter((item) => !item.campanha)
              .map((item) => (
                <article
                  className={`auto-rule ${item.status === 'Ativo' ? 'is-on' : ''}`}
                  key={item.id}
                  data-rule-item={item.id}
                >
                  <div className="auto-rule-main">
                    <span className="auto-rule-ico">
                      <Icon name="bolt" />
                    </span>
                    <div className="auto-rule-body">
                      <div className="auto-rule-header">
                        <div className="auto-rule-heading">
                          <div className="auto-rule-top">
                            <strong>{item.titulo}</strong>
                            {item.descricao &&
                              item.descricao.trim().toLowerCase() !==
                                triggerLabel(item.tipo).toLowerCase() && (
                                <small>{item.descricao}</small>
                              )}
                          </div>
                          <span className="auto-badge">
                            {triggerLabel(item.tipo)}
                          </span>
                        </div>
                        <ActionForm
                          item={item}
                          token={data.page.csrfToken}
                          action="toggle_regra"
                        >
                          <label className="auto-toggle-control">
                            <input
                              type="checkbox"
                              role="switch"
                              className="switch"
                              aria-label={`Ativar regra ${item.titulo}`}
                              defaultChecked={item.status === 'Ativo'}
                              onChange={(event) =>
                                (
                                  event.target as HTMLInputElement
                                ).form.requestSubmit()
                              }
                            />
                            <span>
                              {item.status === 'Ativo'
                                ? 'Ativado'
                                : 'Desativado'}
                            </span>
                          </label>
                        </ActionForm>
                      </div>
                      <div className="auto-rule-preview">
                        <span className="auto-rule-preview-text">
                          {(
                            item.mensagemTexto || 'Sem template vinculado'
                          ).replace(/\s+/g, ' ')}
                        </span>
                      </div>
                      {item.envioHoje && (
                        <div
                          className="auto-delivery"
                          data-state={item.envioHoje.estado}
                          aria-label="Envio de hoje"
                        >
                          <strong>{item.envioHoje.rotulo}</strong>
                          {item.envioHoje.estado !== 'vazio' && (
                            <span>{item.envioHoje.detalhe}</span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="auto-rule-actions is-rule-actions">
                    <ActionForm
                      item={item}
                      token={data.page.csrfToken}
                      action="dispatch_regra"
                      confirm="Forçar o envio dos pendentes desta regra hoje? Envios confirmados, em andamento ou sem confirmação segura não serão repetidos."
                    >
                      <button
                        className="btn btn-muted auto-force-send"
                        type="submit"
                        aria-label={`Enviar: ${item.titulo}`}
                        data-loading-text="Enviando pendentes..."
                      >
                        <Icon name="bolt" />
                        Enviar
                      </button>
                    </ActionForm>
                    <button
                      className="cli-ico-btn"
                      type="button"
                      aria-label={`Editar ${item.titulo}`}
                      onClick={() => setEditor({ item })}
                    >
                      <Icon name="edit" />
                    </button>
                    <ActionForm
                      item={item}
                      token={data.page.csrfToken}
                      action="delete_regra"
                      confirm="Deseja apagar esta regra?"
                    >
                      <button
                        className="cli-ico-btn danger"
                        type="submit"
                        aria-label={`Apagar ${item.titulo}`}
                      >
                        <Icon name="trash" />
                      </button>
                    </ActionForm>
                  </div>
                </article>
              ))}
          </div>
        ) : (
          <DispatchHistory
            key={data.historico?.pagina || 1}
            rows={data.disparos}
            history={data.historico}
          />
        )}
      </div>
      {editor && (
        <RuleEditor {...editor} data={data} onClose={() => setEditor(null)} />
      )}
      {scheduledEditor && (
        <CampaignEditor
          item={scheduledEditor.item}
          data={data}
          onClose={() => setScheduledEditor(null)}
        />
      )}
      {recipients && (
        <Recipients item={recipients} onClose={() => setRecipients(null)} />
      )}
    </NativePanel>
  );
}

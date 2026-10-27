'use client';
import { showPanelNotice } from '../../../../src/browser/assets/js/ui/panel-feedback.ts';
import { useEffect, useState } from 'react';
import { CsrfInput, Icon } from '../../../../src/frontend/clients/ui.tsx';
import { NativePanel } from '../../components/layout/NativePanel.tsx';
import { NativeDialog } from '../../components/ui/NativeDialog.tsx';
import { useNativeSubmit } from '../../hooks/useNativeSubmit.ts';
import { PanelSearch } from '../../../../src/frontend/components/PanelSearch.tsx';
import { messagePreview } from '../../../../src/services/format.ts';
import {
  messageVariables,
  normalizeMessageVariables,
} from '../../../../src/shared/messageVariables.ts';
const normalize = (value) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

function DeleteMessage({ item, token }: { item?: any; token?: string }) {
  const onSubmit = useNativeSubmit('Deseja apagar esta mensagem?');
  return (
    <form
      method="post"
      action="/mensagens"
      className="action-form msg-del-form"
      onSubmit={onSubmit}
    >
      <CsrfInput token={token} />
      <input type="hidden" name="action" value="delete_mensagem" />
      <input type="hidden" name="id" value={item.id} />
      <button
        className="cli-ico-btn danger"
        type="submit"
        aria-label={`Apagar ${item.titulo}`}
      >
        <Icon name="trash" />
      </button>
    </form>
  );
}

function MessageEditor({
  item,
  token,
  onClose,
}: {
  item?: any;
  token?: string;
  onClose?: (...args: any[]) => any;
}) {
  const [tab, setTab] = useState('mensagem');
  const [text, setText] = useState(normalizeMessageVariables(item?.mensagem));
  const onSubmit = useNativeSubmit();
  return (
    <NativeDialog
      title={item ? 'Editar Template' : 'Novo Template'}
      className="template-editor"
      width={1000}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-muted" type="button" onClick={onClose}>
            Cancelar
          </button>
          <button
            className="btn btn-primary"
            type="submit"
            form="react-message-form"
          >
            Salvar
          </button>
        </>
      }
    >
      <div className="modal-tabs" role="tablist" aria-label="Dados do template">
        {['mensagem', 'midia'].map((value) => (
          <button
            key={value}
            className={`tab-btn ${tab === value ? 'active' : ''}`}
            id={`message-tab-${value}`}
            role="tab"
            aria-selected={tab === value}
            aria-controls={`message-panel-${value}`}
            tabIndex={tab === value ? 0 : -1}
            type="button"
            onClick={() => setTab(value)}
            onKeyDown={(event) => {
              const next =
                event.key === 'Home'
                  ? 'mensagem'
                  : event.key === 'End'
                    ? 'midia'
                    : ['ArrowLeft', 'ArrowRight'].includes(event.key)
                      ? value === 'mensagem'
                        ? 'midia'
                        : 'mensagem'
                      : null;
              if (!next) return;
              event.preventDefault();
              setTab(next);
              (
                document.getElementById(`message-tab-${next}`) as HTMLElement
              ).focus();
            }}
          >
            {value === 'mensagem' ? 'Mensagem' : 'Mídia'}
          </button>
        ))}
      </div>
      <form
        method="post"
        action="/mensagens"
        id="react-message-form"
        className="modal-body"
        data-native-submit="1"
        onSubmit={onSubmit}
        onInvalidCapture={(event) => {
          if (
            (event.target as HTMLInputElement).name === 'titulo' &&
            tab !== 'mensagem'
          ) {
            event.preventDefault();
            const input = event.target as HTMLInputElement;
            setTab('mensagem');
            requestAnimationFrame(() => {
              input.focus();
              input.reportValidity();
            });
          }
        }}
      >
        <CsrfInput token={token} />
        <input
          type="hidden"
          name="action"
          value={`${item ? 'update' : 'create'}_mensagem`}
        />
        <input type="hidden" name="id" value={item?.id || ''} />
        <input
          type="hidden"
          name="media_tipo_atual"
          value={item?.mediaTipo || ''}
        />
        <input
          type="hidden"
          name="media_path_atual"
          value={item?.mediaPath || ''}
        />
        <div
          role="tabpanel"
          id="message-panel-mensagem"
          aria-labelledby="message-tab-mensagem"
          hidden={tab !== 'mensagem'}
        >
          <div className="message-compose-grid">
            <div className="form-grid message-compose-fields">
              <label className="field full">
                <span>Nome *</span>
                <input
                  className="input"
                  name="titulo"
                  defaultValue={item?.titulo || ''}
                  placeholder="Ex.: Boas-vindas"
                  required
                />
              </label>
              <label className="field full">
                <span>Descrição</span>
                <input
                  className="input"
                  name="descricao"
                  defaultValue={item?.descricao || ''}
                  placeholder="Opcional"
                />
              </label>
              <div className="field full">
                <label htmlFor="message-text">Mensagem</label>
                <textarea
                  id="message-text"
                  className="input"
                  name="mensagem"
                  rows={6}
                  placeholder="Digite a mensagem..."
                  value={text}
                  onChange={(event) =>
                    setText((event.target as HTMLTextAreaElement).value)
                  }
                />
                {/\{\s*cobranca_pix\s*\}/i.test(text) && (
                  <p className="muted">
                    Envia uma cobrança com o valor do cliente e o Pix de Minha
                    Conta. Use sem anexo. Confira o recebimento no banco antes
                    de confirmar o pagamento.
                  </p>
                )}
              </div>
            </div>
            <aside
              className="message-variables"
              aria-labelledby="message-variables-title"
            >
              <div className="message-variables-heading">
                <span className="message-variables-icon">
                  <Icon name="bolt" />
                </span>
                <div>
                  <h4 id="message-variables-title">Variáveis da mensagem</h4>
                  <p>Os códigos são substituídos pelos dados reais no envio.</p>
                </div>
              </div>
              {['Cliente', 'Assinatura', 'Pagamentos'].map((group) => (
                <section
                  className="message-variable-group"
                  key={group}
                  aria-label={group}
                >
                  <h5>{group}</h5>
                  <dl className="message-variable-grid">
                    {messageVariables
                      .filter((variable) => variable.group === group)
                      .map(({ name, description }) => (
                        <div
                          className={`message-variable${name === 'cobranca_pix' ? ' message-variable--pix' : ''}`}
                          key={name}
                        >
                          <dt>
                            <code>{`{${name}}`}</code>
                          </dt>
                          <dd>{description}</dd>
                        </div>
                      ))}
                  </dl>
                </section>
              ))}
            </aside>
          </div>
        </div>
        <div
          role="tabpanel"
          id="message-panel-midia"
          aria-labelledby="message-tab-midia"
          hidden={tab !== 'midia'}
        >
          <div className="form-grid">
            <label className="field">
              <span>Tipo</span>
              <select
                className="input"
                name="media_tipo"
                defaultValue={item?.mediaTipo || ''}
              >
                <option value="">Nenhuma</option>
                <option value="image">Imagem</option>
                <option value="video">Vídeo</option>
                <option value="audio">Áudio</option>
                <option value="document">Documento</option>
              </select>
            </label>
            <label className="field full">
              <span>Link ou caminho</span>
              <input
                className="input"
                name="media_path"
                defaultValue={item?.mediaPath || ''}
              />
            </label>
          </div>
        </div>
      </form>
    </NativeDialog>
  );
}

export function MessagesScreen({ data }: { data?: any }) {
  const [search, setSearch] = useState('');
  const [editor, setEditor] = useState(null);
  useEffect(() => {
    const url = new URL(location.href);
    let message = '';
    for (const [key, text] of [
      ['saved', 'Mensagem salva com sucesso.'],
      ['updated', 'Mensagem atualizada com sucesso.'],
      ['deleted', 'Mensagem apagada com sucesso.'],
    ]) {
      if (url.searchParams.get(key) === '1') {
        message = text;
        url.searchParams.delete(key);
      }
    }
    if (message) {
      showPanelNotice(message);
      history.replaceState(
        history.state,
        '',
        url.pathname + url.search + url.hash,
      );
    }
  }, []);
  const filtered = data.mensagens.filter((item) =>
    normalize([item.titulo, item.descricao, item.mensagem].join(' ')).includes(
      normalize(search.trim()),
    ),
  );
  return (
    <NativePanel data={data} path="/mensagens">
      <div
        className="container page-mensagens ui-catalog"
        data-react-page="mensagens"
      >
        <div className="ui-toolbar">
          <PanelSearch
            placeholder="Buscar template..."
            label="Buscar template"
            value={search}
            onChange={setSearch}
          />
          <button
            className="btn btn-primary"
            type="button"
            onClick={() => setEditor({ item: null })}
          >
            <Icon name="plus" /> Novo Template
          </button>
        </div>
        <p
          className="panel-search-results"
          role="status"
          aria-live="polite"
          hidden={!search.trim()}
        >
          {search.trim() && `${filtered.length} resultado(s)`}
        </p>
        {!filtered.length && (
          <div className="cli-empty">
            <Icon name="message" />
            <h3>
              {data.mensagens.length
                ? 'Nenhum template encontrado'
                : 'Nenhum template cadastrado'}
            </h3>
            <p className="muted">
              {data.mensagens.length
                ? 'Tente outra busca.'
                : 'Crie templates de mensagem para envio automático e manual.'}
            </p>
          </div>
        )}
        <div className="msg-grid">
          {filtered.map((item) => (
            <article
              className="msg-card"
              key={item.id}
              data-message-item={item.id}
            >
              <div className="msg-card-head">
                <strong>{item.titulo}</strong>
                <div className="msg-actions">
                  <button
                    type="button"
                    className="cli-ico-btn"
                    aria-label={`Editar ${item.titulo}`}
                    onClick={() => setEditor({ item })}
                  >
                    <Icon name="edit" />
                  </button>
                  <DeleteMessage item={item} token={data.page.csrfToken} />
                </div>
              </div>
              {item.descricao && (
                <div className="msg-desc">{item.descricao}</div>
              )}
              <div className="msg-preview">{messagePreview(item.mensagem)}</div>
            </article>
          ))}
        </div>
      </div>
      {editor && (
        <MessageEditor
          {...editor}
          token={data.page.csrfToken}
          onClose={() => setEditor(null)}
        />
      )}
    </NativePanel>
  );
}

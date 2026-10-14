'use client';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { CsrfInput, Icon } from '../../../src/frontend/clients/ui.jsx';
import { NativePanel } from '../../components/layout/NativePanel.jsx';
import { NativeDialog } from '../../components/ui/NativeDialog.jsx';
import { useNativeSubmit } from '../../hooks/useNativeSubmit.js';

const tags = [
  'saudacao',
  'nome',
  'primeiro_nome',
  'usuario',
  'senha',
  'plano',
  'vencimento',
  'valor',
  'servidor',
  'vencimento_1',
  'vencimento_2',
  'resumo_acessos',
  'link_cliente',
];
const normalize = (value) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

function DeleteMessage({ item, token }) {
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

function MessageEditor({ item, token, onClose }) {
  const [tab, setTab] = useState('mensagem');
  const [text, setText] = useState(item?.mensagem || '');
  const textarea = useRef(null);
  const caret = useRef(null);
  const onSubmit = useNativeSubmit();
  useLayoutEffect(() => {
    if (caret.current == null) return;
    textarea.current.focus();
    textarea.current.setSelectionRange(caret.current, caret.current);
    caret.current = null;
  }, [text]);
  function insertTag(event) {
    const tag = event.target.value;
    if (!tag) return;
    const { selectionStart, selectionEnd } = textarea.current;
    const nextText =
      text.slice(0, selectionStart) + tag + text.slice(selectionEnd);
    const position = selectionStart + tag.length;
    if (nextText === text) {
      textarea.current.focus();
      textarea.current.setSelectionRange(position, position);
    } else {
      caret.current = position;
      setText(nextText);
    }
    event.target.value = '';
  }
  return (
    <NativeDialog
      title={item ? 'Editar Template' : 'Novo Template'}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-muted" type="button" onClick={onClose}>
            Fechar
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
              document.getElementById(`message-tab-${next}`).focus();
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
          if (event.target.name === 'titulo' && tab !== 'mensagem') {
            event.preventDefault();
            const input = event.target;
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
          <div className="form-grid">
            <label className="field full">
              <span>Nome do Template *</span>
              <input
                className="input"
                name="titulo"
                defaultValue={item?.titulo || ''}
                placeholder="Ex: Boas-vindas, Aviso de vencimento..."
                required
              />
            </label>
            <label className="field full">
              <span>Descrição</span>
              <input
                className="input"
                name="descricao"
                defaultValue={item?.descricao || ''}
                placeholder="Quando este template é usado"
              />
            </label>
            <div className="field full">
              <div className="tag-select-row">
                <label htmlFor="message-text">Mensagem</label>
                <select
                  className="input tag-select"
                  name="tags"
                  aria-label="Inserir variável na mensagem"
                  defaultValue=""
                  onChange={insertTag}
                >
                  <option value="">+ variável</option>
                  {tags.map((tag) => (
                    <option key={tag} value={`{${tag}}`}>
                      {`{${tag}}`}
                      {tag === 'link_cliente' ? ' — Renovar com PIX' : ''}
                    </option>
                  ))}
                </select>
              </div>
              <textarea
                ref={textarea}
                id="message-text"
                className="input"
                name="mensagem"
                rows="9"
                value={text}
                onChange={(event) => setText(event.target.value)}
              />
            </div>
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
              <span>Tipo mídia</span>
              <select
                className="input"
                name="media_tipo"
                defaultValue={item?.mediaTipo || ''}
              >
                <option value="">Nenhuma</option>
                <option>image</option>
                <option>video</option>
                <option>audio</option>
                <option>document</option>
              </select>
            </label>
            <label className="field full">
              <span>Caminho/URL mídia</span>
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

export function MessagesScreen({ data }) {
  const [search, setSearch] = useState('');
  const [editor, setEditor] = useState(null);
  const [notice, setNotice] = useState('');
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
      setNotice(message);
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
          <input
            type="search"
            className="input"
            placeholder="Buscar template..."
            aria-label="Buscar template"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <button
            className="btn btn-primary"
            type="button"
            onClick={() => setEditor({ item: null })}
          >
            <Icon name="plus" /> Novo Template
          </button>
        </div>
        <div className="ui-catalog-heading">
          <h2>
            Templates de mensagem <span>{data.mensagens.length}</span>
          </h2>
          <p role="status" aria-live="polite">
            {search ? `${filtered.length} resultado(s)` : ''}
          </p>
        </div>
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
              <div className="msg-preview">
                {String(item.mensagem || '')
                  .replace(/\s+/g, ' ')
                  .slice(0, 110)}
                {(item.mensagem || '').length > 110 ? '…' : ''}
              </div>
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
      {notice && (
        <NativeDialog title="Aviso" onClose={() => setNotice('')}>
          <div className="modal-body">
            <div className="form-alert success">{notice}</div>
          </div>
        </NativeDialog>
      )}
    </NativePanel>
  );
}

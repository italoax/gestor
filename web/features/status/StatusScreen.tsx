'use client';
import { useEffect, useRef, useState } from 'react';
import { CsrfInput, Icon } from '../../../src/frontend/clients/ui.tsx';
import { NativePanel } from '../../components/layout/NativePanel.tsx';
import { NativeDialog } from '../../components/ui/NativeDialog.tsx';
import { useNativeSubmit } from '../../hooks/useNativeSubmit.ts';

const colors = [
  ['#075E54', 'Verde escuro'],
  ['#25D366', 'Verde claro'],
  ['#128C7E', 'Verde-água'],
  ['#34B7F1', 'Azul'],
  ['#EF4444', 'Vermelho'],
  ['#F59E0B', 'Laranja'],
  ['#A855F7', 'Roxo'],
  ['#111827', 'Preto'],
  ['#FFFFFF', 'Branco'],
];
const utcDate = (value) =>
  new Date(
    /[zZ]$|[+-]\d{2}:\d{2}$/.test(String(value))
      ? value
      : String(value).replace(' ', 'T') + 'Z',
  );
const localInput = (date) =>
  Number.isFinite(date.getTime())
    ? new Date(date.getTime() - date.getTimezoneOffset() * 60000)
        .toISOString()
        .slice(0, 16)
    : '';
const scheduleLabel = (value) => {
  const date = utcDate(value);
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        dateStyle: 'short',
        timeStyle: 'short',
      }).format(date)
    : '-';
};
function StatusAction({ item, token }: { item?: any; token?: string }) {
  const scheduled = item.status === 'agendado';
  const submit = useNativeSubmit(
    scheduled ? 'Cancelar este agendamento?' : undefined,
  );
  return (
    <form
      method="post"
      action="/status"
      className="status-item-del"
      onSubmit={submit}
    >
      <CsrfInput token={token} />
      <input
        type="hidden"
        name="action"
        value={scheduled ? 'cancelar_agendamento' : 'delete_status'}
      />
      <input type="hidden" name="id" value={item.id} />
      <button
        type="submit"
        className="cli-ico-btn danger"
        aria-label={scheduled ? 'Cancelar agendamento' : 'Apagar do histórico'}
      >
        <Icon name="trash" />
      </button>
    </form>
  );
}
function StatusEditor({
  item,
  token,
  onClose,
}: {
  item?: any;
  token?: string;
  onClose?: (...args: any[]) => any;
}) {
  const [type, setType] = useState(item?.tipo || 'text');
  const [text, setText] = useState(item?.texto || '');
  const [color, setColor] = useState(
    colors.some(([hex]) => hex === item?.corFundo) ? item.corFundo : '#075E54',
  );
  const [files, setFiles] = useState({});
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const controller = useRef(null);
  const fileInput = useRef(null);
  const [minimum] = useState(() => localInput(new Date(Date.now() + 60000)));
  useEffect(() => {
    const file = files[type];
    if (!file) {
      setUrl('');
      return;
    }
    const nextUrl = URL.createObjectURL(file);
    setUrl(nextUrl);
    return () => URL.revokeObjectURL(nextUrl);
  }, [files, type]);
  useEffect(() => () => controller.current?.abort(), []);
  function selectFile(file, kind) {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024 || !file.type.startsWith(`${kind}/`)) {
      setError(
        file.size > 5 * 1024 * 1024
          ? 'Arquivo maior que 5 MB. Escolha outro.'
          : 'Escolha um arquivo compatível com o tipo de publicação.',
      );
      setFiles((current) => ({ ...current, [kind]: null }));
      if (fileInput.current) fileInput.current.value = '';
      return;
    }
    setError('');
    setFiles((current) => ({ ...current, [kind]: file }));
  }
  async function submit(event) {
    event.preventDefault();
    if (pending.current) return;
    const form = event.currentTarget;
    const payload = new FormData(form);
    const selectedDate = new Date(String(payload.get('agendado_para') || ''));
    if (
      !Number.isFinite(selectedDate.getTime()) ||
      selectedDate.getTime() <= Date.now()
    ) {
      setError('Escolha uma data e hora futuras.');
      return;
    }
    if (type === 'text' && !text.trim()) {
      setError('Digite o texto do status.');
      return;
    }
    const file = files[type];
    if (type !== 'text' && !file && item?.tipo !== type) {
      setError('Anexe o arquivo de mídia.');
      return;
    }
    if (type !== 'text' && file) payload.set('media_file', file, file.name);
    payload.set('agendado_offset', String(selectedDate.getTimezoneOffset()));
    pending.current = true;
    setBusy(true);
    setError('');
    controller.current = new AbortController();
    try {
      const response = await fetch('/status', {
        method: 'POST',
        body: payload,
        headers: { 'x-csrf-token': token },
        redirect: 'manual',
        signal: controller.current.signal,
      });
      if (response.type === 'opaqueredirect') {
        location.assign('/status');
        return;
      }
      throw new Error(
        response.status === 403
          ? 'Sua sessão expirou. Recarregue a página e tente novamente.'
          : 'Não foi possível salvar o status. Tente novamente.',
      );
    } catch (failure) {
      if (controller.current.signal.aborted) return;
      pending.current = false;
      setBusy(false);
      setError(failure.message);
    }
  }
  return (
    <NativeDialog
      title={item ? 'Editar agendamento' : 'Nova publicação'}
      className="status-composer"
      width={800}
      onClose={() => {
        if (!pending.current) onClose();
      }}
      footer={
        <>
          <button
            className="btn btn-muted"
            type="button"
            disabled={busy}
            onClick={onClose}
          >
            Cancelar
          </button>
          <button
            className="btn btn-primary"
            type="submit"
            form="react-status-form"
            disabled={busy}
          >
            {busy
              ? 'Salvando...'
              : item
                ? 'Salvar alterações'
                : 'Agendar status'}
          </button>
        </>
      }
    >
      <form
        method="post"
        action="/status"
        encType="multipart/form-data"
        id="react-status-form"
        className="modal-body"
        onSubmit={submit}
        onPaste={(event) => {
          const file = Array.from(event.clipboardData?.items || [])
            .find((row) => row.kind === 'file' && row.type.startsWith('image/'))
            ?.getAsFile();
          if (file) {
            event.preventDefault();
            setType('image');
            selectFile(file, 'image');
          }
        }}
      >
        <CsrfInput token={token} />
        <input
          type="hidden"
          name="action"
          value={item ? 'editar_status' : ''}
        />
        <input type="hidden" name="id" value={item?.id || ''} />
        <input type="hidden" name="tipo" value={type} />
        <p className="status-intro muted">
          Escolha o conteúdo e o horário. A publicação aparece em Meu status por
          24 horas.
        </p>
        {error && (
          <div className="form-alert error" role="alert">
            {error}
          </div>
        )}
        <div className="status-tabs">
          {[
            ['text', 'Texto'],
            ['image', 'Imagem'],
            ['video', 'Vídeo'],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={`status-tab ${type === value ? 'active' : ''}`}
              aria-pressed={type === value}
              disabled={busy}
              onClick={() => setType(value)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="status-modal-grid">
          <div className="status-modal-form">
            {type === 'text' ? (
              <>
                <label className="field full">
                  <span>Texto do status *</span>
                  <textarea
                    className="input"
                    name="texto"
                    maxLength={700}
                    rows={5}
                    value={text}
                    required
                    onChange={(event) =>
                      setText((event.target as HTMLTextAreaElement).value)
                    }
                  />
                  <small className="muted status-counter">
                    {text.length} / 700
                  </small>
                </label>
                <div className="status-colors">
                  {colors.map(([hex, label]) => (
                    <label className="status-color" key={hex}>
                      <input
                        type="radio"
                        name="cor_fundo"
                        value={hex}
                        checked={color === hex}
                        onChange={() => setColor(hex)}
                        aria-label={label}
                      />
                      <span style={{ backgroundColor: hex }} title={label} />
                    </label>
                  ))}
                </div>
              </>
            ) : (
              <>
                <label className="status-drop">
                  <input
                    ref={fileInput}
                    key={type}
                    type="file"
                    className="status-file-input"
                    accept={`${type}/*`}
                    onChange={(event) =>
                      selectFile(
                        (event.target as HTMLInputElement).files[0],
                        type,
                      )
                    }
                  />
                  <span className="status-drop-ico">
                    <Icon name={type === 'image' ? 'image' : 'monitor'} />
                  </span>
                  <strong>
                    {files[type]?.name ||
                      (item?.tipo === type
                        ? 'Manter arquivo atual ou selecionar outro'
                        : 'Selecionar arquivo')}
                  </strong>
                  <small>
                    Máx 5 MB
                    {type === 'video'
                      ? ' · vídeo de até 30 segundos'
                      : ' · também pode colar uma imagem'}
                  </small>
                </label>
                <label className="field full">
                  <span>Legenda</span>
                  <textarea
                    className="input"
                    name="legenda"
                    maxLength={500}
                    defaultValue={item?.legenda || ''}
                    rows={3}
                  />
                </label>
              </>
            )}
            <label className="field full">
              <span>Data e hora da publicação *</span>
              <input
                className="input"
                type="datetime-local"
                name="agendado_para"
                required
                min={minimum}
                defaultValue={
                  item ? localInput(utcDate(item.agendadoPara)) : ''
                }
              />
              <small className="muted">
                O sistema posta automaticamente no horário escolhido. Mantenha o
                WhatsApp conectado.
              </small>
            </label>
          </div>
          <details className="status-modal-preview" open>
            <summary>Prévia do status</summary>
            <div className="status-preview-content">
              {type === 'text' ? (
                <div
                  className="status-preview"
                  style={{
                    backgroundColor: color,
                    color:
                      color === '#FFFFFF' || color === '#25D366'
                        ? '#111'
                        : '#fff',
                  }}
                >
                  <div
                    className="status-preview-text"
                    style={{ color: color === '#FFFFFF' ? '#111' : '#fff' }}
                  >
                    {text || 'Seu texto aparece aqui…'}
                  </div>
                </div>
              ) : (
                <div className="status-media-preview">
                  {url ? (
                    type === 'image' ? (
                      <img src={url} alt="Prévia da imagem" />
                    ) : (
                      <video src={url} controls playsInline />
                    )
                  ) : item?.tipo === 'image' &&
                    type === 'image' &&
                    Number(item.temImagem) ? (
                    <img
                      src={`/status/${item.id}/imagem`}
                      alt="Imagem atual do status"
                    />
                  ) : (
                    <span className="muted">
                      {item?.tipo === type
                        ? 'Arquivo atual será mantido.'
                        : 'Pré-visualização'}
                    </span>
                  )}
                </div>
              )}
            </div>
          </details>
        </div>
      </form>
    </NativeDialog>
  );
}
export function StatusScreen({ data }: { data?: any }) {
  const [history, setHistory] = useState(data.historico);
  const [editor, setEditor] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    let timer;
    async function refresh() {
      try {
        if (
          !document.hidden &&
          (!window.gestorPolling || window.gestorPolling.canFetch())
        ) {
          const response = await fetch('/status/historico', {
            headers: { Accept: 'application/json' },
            cache: 'no-store',
            signal: controller.signal,
          });
          window.gestorPolling?.recordResponse(response);
          if (!response.ok || response.redirected) throw new Error();
          const payload = await response.json();
          if (!Array.isArray(payload.historico)) throw new Error();
          if (!controller.signal.aborted) {
            setHistory(payload.historico);
            setError('');
          }
        }
      } catch {
        if (!controller.signal.aborted)
          setError(
            'Não foi possível atualizar o histórico. Tentaremos novamente.',
          );
      }
      if (!controller.signal.aborted) timer = setTimeout(refresh, 15000);
    }
    timer = setTimeout(refresh, 15000);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, []);
  return (
    <NativePanel data={data} path="/status">
      <div className="container page-status" data-react-page="status">
        {data.temWhatsapp ? (
          <div className="section-header">
            <div>
              <h2 className="status-page-title">Status WhatsApp</h2>
              <p className="muted">
                Agende novidades, ofertas e avisos para o seu status.
              </p>
            </div>
            <button
              className="btn btn-primary"
              type="button"
              onClick={() => setEditor({ item: null })}
            >
              Nova publicação
            </button>
          </div>
        ) : (
          <div className="cli-empty">
            <h3>WhatsApp não conectado</h3>
            <p className="muted">
              Cadastre e conecte um dispositivo WhatsApp antes de publicar
              status.
            </p>
            <a className="btn btn-primary" href="/whatsapp">
              Ir para WhatsApp
            </a>
          </div>
        )}
        <div className="card status-historico">
          <div className="card-head">
            <div>
              <strong>Histórico</strong>
              <small className="status-live-note">
                Removidos 24 horas após a publicação confirmada
              </small>
            </div>
            <span className="muted">{history.length} registro(s)</span>
          </div>
          {error && (
            <p role="status" className="form-alert error">
              {error}
            </p>
          )}
          {!history.length && (
            <div className="status-empty">
              <p>Nenhum status publicado ainda.</p>
              {data.temWhatsapp && (
                <button
                  className="btn btn-primary"
                  type="button"
                  onClick={() => setEditor({ item: null })}
                >
                  Publicar primeiro status
                </button>
              )}
            </div>
          )}
          <div className="status-list">
            {history.map((item) => (
              <article
                key={item.id}
                className={`status-item ${item.status === 'erro' ? 'is-error' : item.status === 'agendado' ? 'is-scheduled' : 'is-ok'}`}
                data-status-item={item.id}
              >
                <div className="status-item-body">
                  <div className="status-item-head">
                    <div className="status-item-label">
                      <div
                        className="status-item-ico"
                        style={{
                          backgroundColor:
                            item.tipo === 'text' &&
                            /^#[0-9a-f]{6}$/i.test(item.corFundo)
                              ? item.corFundo
                              : undefined,
                        }}
                      >
                        <Icon
                          name={
                            item.tipo === 'text'
                              ? 'message'
                              : item.tipo === 'image'
                                ? 'image'
                                : 'monitor'
                          }
                        />
                      </div>
                      <strong>
                        {item.tipo === 'text'
                          ? 'Texto'
                          : item.tipo === 'image'
                            ? 'Imagem'
                            : 'Vídeo'}
                      </strong>
                    </div>
                    <span
                      className={`badge badge-${item.status === 'postado' ? 'green' : item.status === 'erro' ? 'red' : item.status === 'agendado' ? 'yellow' : 'blue'}`}
                    >
                      {item.status === 'postado'
                        ? 'Publicado'
                        : item.status === 'erro'
                          ? 'Erro'
                          : item.status === 'agendado'
                            ? 'Agendado'
                            : 'Publicando...'}
                    </span>
                  </div>
                  {item.tipo === 'text' ? (
                    <p className="status-item-text">
                      {(item.texto || '').slice(0, 140)}
                      {(item.texto || '').length > 140 ? '…' : ''}
                    </p>
                  ) : (
                    <>
                      {item.tipo === 'image' && Number(item.temImagem) > 0 && (
                        <div className="status-item-media">
                          <img
                            className="status-item-image"
                            src={`/status/${item.id}/imagem`}
                            alt="Imagem do status"
                            loading="lazy"
                            decoding="async"
                          />
                        </div>
                      )}
                      {item.legenda && (
                        <p className="status-item-text">{item.legenda}</p>
                      )}
                    </>
                  )}
                  <div className="status-item-foot">
                    <span>
                      {item.status === 'agendado'
                        ? `Publica em ${scheduleLabel(item.agendadoPara)}`
                        : String(item.createdAt || '')
                            .slice(0, 10)
                            .split('-')
                            .reverse()
                            .join('/')}
                    </span>
                    {Boolean(item.destinatarios) && (
                      <span>{item.destinatarios} contatos</span>
                    )}
                    {item.erro && (
                      <span
                        className={
                          item.status === 'erro'
                            ? 'status-item-error'
                            : 'status-item-note'
                        }
                      >
                        {item.erro}
                      </span>
                    )}
                  </div>
                </div>
                {item.status === 'agendado' && data.temWhatsapp && (
                  <button
                    type="button"
                    className="cli-ico-btn status-edit-btn"
                    aria-label="Editar agendamento"
                    onClick={() => setEditor({ item })}
                  >
                    <Icon name="edit" />
                  </button>
                )}
                {item.status !== 'publicando' && (
                  <StatusAction item={item} token={data.page.csrfToken} />
                )}
              </article>
            ))}
          </div>
        </div>
      </div>
      {editor && (
        <StatusEditor
          {...editor}
          token={data.page.csrfToken}
          onClose={() => setEditor(null)}
        />
      )}
    </NativePanel>
  );
}

'use client';
import { useEffect, useRef, useState } from 'react';
import { PanelNotice } from '../../components/ui/PanelNotice.tsx';
import { confirmPanelAction } from '../../../src/browser/assets/js/ui/panel-feedback.ts';
import { CsrfInput, Icon } from '../../../src/frontend/clients/ui.tsx';
import { NativePanel } from '../../components/layout/NativePanel.tsx';
import { NativeDialog } from '../../components/ui/NativeDialog.tsx';
import { useNativeSubmit } from '../../hooks/useNativeSubmit.ts';

const connected = (state) => state?.connected || state?.status === 'conectado';
const labels = {
  conectado: 'Conectado',
  desconectado: 'Desconectado',
  qr: 'Conectando...',
  pairing: 'Conectando...',
  iniciando: 'Conectando...',
  reconectando: 'Reconectando...',
  erro: 'Erro',
};
function phone(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (!digits) return '';
  if (/^55\d{10,11}$/.test(digits)) {
    const rest = digits.slice(4),
      split = rest.length - 4;
    return `+55 (${digits.slice(2, 4)}) ${rest.slice(0, split)}-${rest.slice(split)}`;
  }
  return '+' + digits;
}
function CallBlock({ device, token }: { device?: any; token?: string }) {
  const submit = useNativeSubmit();
  return (
    <form
      method="post"
      action="/whatsapp"
      className="wa-bloq-form"
      onSubmit={submit}
    >
      <CsrfInput token={token} />
      <input type="hidden" name="action" value="toggle_bloqueio" />
      <input type="hidden" name="id" value={device.id} />
      <input
        type="checkbox"
        className="switch"
        name="bloqueio_chamadas"
        value="1"
        defaultChecked={Boolean(Number(device.bloqueioChamadas))}
        onChange={(event) => event.currentTarget.form.requestSubmit()}
        aria-label="Bloqueio de chamadas"
      />
    </form>
  );
}
function WhatsAppDevice({ device, token }: { device?: any; token?: string }) {
  const [state, setState] = useState(null);
  const [checking, setChecking] = useState(true);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const revision = useRef(0);
  const pending = useRef(false),
    actionController = useRef(null),
    alive = useRef(false);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      actionController.current?.abort();
    };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    let timer;
    async function poll() {
      const startedAt = revision.current;
      try {
        if (
          !document.hidden &&
          !pending.current &&
          (!window.gestorPolling || window.gestorPolling.canFetch())
        ) {
          const response = await fetch(`/whatsapp/status?device=${device.id}`, {
            headers: { Accept: 'application/json' },
            cache: 'no-store',
            signal: AbortSignal.any([
              controller.signal,
              AbortSignal.timeout(20000),
            ]),
          });
          window.gestorPolling?.recordResponse(response);
          if (!response.ok || response.redirected) throw new Error();
          const result = await response.json();
          if (
            !result ||
            (typeof result.connected !== 'boolean' &&
              !Object.hasOwn(labels, result.status))
          )
            throw new Error();
          if (!controller.signal.aborted && startedAt === revision.current) {
            setState({
              ...result,
              status: Object.hasOwn(labels, result.status)
                ? result.status
                : result.connected
                  ? 'conectado'
                  : 'desconectado',
            });
            setChecking(false);
          }
        }
      } catch {
        if (
          !controller.signal.aborted &&
          !pending.current &&
          startedAt === revision.current
        )
          setState((current) => ({
            ...current,
            status: connected(current) ? current.status : 'erro',
            lastError:
              'Não foi possível verificar a conexão. Tentaremos novamente.',
          }));
      }
      if (!controller.signal.aborted)
        timer = setTimeout(poll, open ? 3000 : 12000);
    }
    poll();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [device.id, open]);
  async function operate() {
    if (pending.current || checking) return;
    const disconnect = connected(state);
    if (
      disconnect &&
      !(await confirmPanelAction('Desconectar este dispositivo?'))
    )
      return;
    if (
      !disconnect &&
      ['qr', 'pairing', 'iniciando', 'reconectando'].includes(state?.status)
    ) {
      setOpen(true);
      return;
    }
    pending.current = true;
    revision.current += 1;
    setBusy(true);
    if (!disconnect) {
      setOpen(true);
      setState({ status: 'iniciando' });
    }
    actionController.current = new AbortController();
    try {
      const response = await fetch(
        `/whatsapp/device/${device.id}/${disconnect ? 'disconnect' : 'connect'}`,
        {
          method: 'POST',
          headers: { Accept: 'application/json', 'x-csrf-token': token },
          signal: AbortSignal.any([
            actionController.current.signal,
            AbortSignal.timeout(45000),
          ]),
        },
      );
      if (response.redirected)
        throw new Error('Sua sessão expirou. Recarregue a página.');
      const result = await response.json();
      if (!response.ok || result.status === 'erro')
        throw new Error(
          result.lastError ||
            'Não foi possível alterar a conexão. Tente novamente.',
        );
      if (alive.current) setState(result);
    } catch (error) {
      if (alive.current)
        setState((current) => ({
          ...current,
          status: 'erro',
          lastError:
            error.message ||
            'Não foi possível alterar a conexão. Tente novamente.',
        }));
    } finally {
      pending.current = false;
      if (alive.current) setBusy(false);
    }
  }
  const isConnected = !checking && connected(state);
  const message = busy
    ? 'Iniciando sessão... (pode levar alguns segundos)'
    : isConnected
      ? 'Conectado!'
      : state?.lastError ||
        {
          iniciando: 'Iniciando sessão...',
          reconectando: 'Reconectando ao WhatsApp...',
          qr: 'Gerando QR Code...',
          pairing: 'Código de pareamento',
        }[state?.status] ||
        'Aguardando QR Code...';
  return (
    <>
      <div className="wa-device" data-whatsapp-device={device.id}>
        <div className="wa-device-head">
          <span className="wa-device-ico">
            <Icon name="phone" />
          </span>
          <div className="wa-device-info">
            <strong>
              {device.nome}{' '}
              {Number(device.principal) ? (
                <span className="wa-star" title="Principal">
                  ★
                </span>
              ) : null}
            </strong>
            {!checking && (
              <small className={isConnected ? 'connected' : ''}>
                {isConnected
                  ? [phone(state.number), state.pushName]
                      .filter(Boolean)
                      .join(' · ') || 'Conectado'
                  : 'Sem número vinculado'}
              </small>
            )}
          </div>
          {!checking && (
            <span
              className={`wa-status-pill ${isConnected ? 'on' : state?.status === 'erro' ? 'err' : 'off'}`}
              role="status"
            >
              {labels[state.status] ||
                (isConnected ? 'Conectado' : 'Desconectado')}
            </span>
          )}
        </div>
        <button
          className={`wa-connect-btn ${isConnected ? 'is-on' : ''} ${checking || busy ? 'is-loading' : ''}`}
          type="button"
          disabled={busy || checking}
          aria-busy={checking || busy}
          aria-live="polite"
          onClick={operate}
        >
          {checking || busy ? (
            <>
              <span className="btn-spinner" aria-hidden="true" />
              {checking
                ? 'Verificando conexão...'
                : isConnected
                  ? 'Desconectando...'
                  : 'Conectando...'}
            </>
          ) : isConnected ? (
            '⏻ Desconectar'
          ) : (
            '⏻ Conectar'
          )}
        </button>
        {state?.lastError && (
          <PanelNotice inline error>
            {state.lastError}
          </PanelNotice>
        )}
        <div className="wa-device-foot">
          <span>📵 Bloqueio de chamadas</span>
          <span className="wa-foot-right">
            <span className="muted">Ajustar bloqueio</span>
            <CallBlock device={device} token={token} />
          </span>
        </div>
      </div>
      {open && (
        <NativeDialog
          title={`Conectar WhatsApp — ${device.nome}`}
          className="wa-connect-modal"
          width={800}
          onClose={() => setOpen(false)}
        >
          <div className="modal-body wa-connect-body">
            <div className="wa-qr-col">
              <div className="wa-qr-box">
                {!busy && !isConnected && state?.qrCode ? (
                  <img
                    className="wa-qr-img"
                    src={state.qrCode}
                    alt="QR Code para conectar o WhatsApp"
                  />
                ) : (
                  <span className="wa-qr-msg" role="status">
                    {message}
                    {!isConnected && state?.pairingCode && (
                      <strong>{state.pairingCode}</strong>
                    )}
                  </span>
                )}
              </div>
              <div className="wa-qr-foot" role="status" aria-live="polite">
                {isConnected ? 'Conexão confirmada.' : 'Aguardando conexão...'}
              </div>
            </div>
            <div className="wa-steps-col">
              <span className="wa-connect-eyebrow">CONEXÃO DO DISPOSITIVO</span>
              <h4>Conecte em poucos passos</h4>
              <p className="muted wa-connect-description">
                Use o WhatsApp do número que deseja conectar ao painel.
              </p>
              <ol className="wa-steps">
                <li>
                  <div>
                    <strong>Abra o WhatsApp</strong>
                    <p>
                      No celular, entre em <b>Configurações</b> ou no menu{' '}
                      <b>⋮</b>.
                    </p>
                  </div>
                </li>
                <li>
                  <div>
                    <strong>Conecte um dispositivo</strong>
                    <p>
                      Toque em <b>Dispositivos conectados</b> e depois em{' '}
                      <b>Conectar um dispositivo</b>.
                    </p>
                  </div>
                </li>
                <li>
                  <div>
                    <strong>Leia o QR Code</strong>
                    <p>
                      Aponte a câmera para o código ao lado e aguarde a
                      confirmação.
                    </p>
                  </div>
                </li>
              </ol>
              <p className="wa-connect-tip">
                Abra este painel em outra tela para escanear com o celular.
              </p>
              {state?.status === 'erro' && !busy && (
                <button
                  className="btn btn-primary"
                  type="button"
                  onClick={operate}
                >
                  Tentar novamente
                </button>
              )}
            </div>
          </div>
        </NativeDialog>
      )}
    </>
  );
}
export function WhatsAppScreen({ data }: { data?: any }) {
  return (
    <NativePanel data={data} path="/whatsapp">
      <div className="container page-whatsapp" data-react-page="whatsapp">
        {!data.devices.length ? (
          <div className="cli-empty">
            <h3>Conexão sendo preparada…</h3>
            <p className="muted">Recarregue a página em alguns segundos.</p>
          </div>
        ) : (
          <div className="wa-list">
            {data.devices.map((device) => (
              <WhatsAppDevice
                key={device.id}
                device={device}
                token={data.page.csrfToken}
              />
            ))}
          </div>
        )}
      </div>
    </NativePanel>
  );
}

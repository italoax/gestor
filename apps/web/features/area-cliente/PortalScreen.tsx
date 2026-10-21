'use client';
import { PanelNotice } from '../../components/ui/PanelNotice.tsx';
import { useEffect, useRef, useState } from 'react';
import { CsrfInput } from '../../../../src/frontend/clients/ui.tsx';
import { formatDateBr, formatMoney } from '../../../../src/services/format.ts';
import { useNativeSubmit } from '../../hooks/useNativeSubmit.ts';
import { createPix, usePixPayment } from '../pagamentos/usePixPayment.ts';
import { useRenewalSelection } from '../pagamentos/useRenewalSelection.ts';
import { submitPortalLogin } from '../../lib/portalLogin.ts';
import { watchPortalSession } from '../../../../src/browser/assets/js/ui/portal-session.ts';

function PortalLogin({ data }: { data?: any }) {
  const [error, setError] = useState(data.erro),
    [invalid, setInvalid] = useState(''),
    [busy, setBusy] = useState(false);
  const pending = useRef(false),
    controller = useRef(null),
    alive = useRef(false);
  useEffect(() => {
    alive.current = true;
    const restore = (event) => {
      if (!event.persisted) return;
      controller.current?.abort();
      pending.current = false;
      setBusy(false);
    };
    window.addEventListener('pageshow', restore);
    return () => {
      alive.current = false;
      controller.current?.abort();
      window.removeEventListener('pageshow', restore);
    };
  }, []);
  async function submit(event) {
    event.preventDefault();
    if (pending.current) return;
    const form = event.currentTarget,
      payload = new URLSearchParams(
        Array.from(new FormData(form), ([key, value]) => [key, String(value)]),
      );
    const missing = !payload.get('login').trim()
      ? 'login'
      : !payload.get('password')
        ? 'password'
        : '';
    setInvalid(missing);
    if (missing) {
      setError(
        missing === 'login'
          ? 'Informe seu usuário IPTV.'
          : 'Informe sua senha IPTV.',
      );
      form.elements[missing].focus();
      return;
    }
    pending.current = true;
    setBusy(true);
    setError('');
    const requestController = new AbortController();
    controller.current = requestController;
    try {
      await submitPortalLogin(
        payload,
        AbortSignal.any([requestController.signal, AbortSignal.timeout(30000)]),
      );
      if (alive.current && !requestController.signal.aborted)
        location.assign('/area-cliente');
    } catch (failure) {
      if (alive.current && !requestController.signal.aborted) {
        pending.current = false;
        setBusy(false);
        setError(
          failure.name === 'TimeoutError'
            ? 'O login demorou demais. Confira sua conexão e tente novamente.'
            : failure.message || 'Não foi possível entrar. Tente novamente.',
        );
      }
    }
  }
  return (
    <section className="portal-card portal-login">
      <p className="portal-eyebrow">ixstreaming</p>
      <h1>Área do cliente</h1>
      <p className="portal-lead">Sua assinatura, em um só lugar.</p>
      <div className="portal-login-error" id="login-error" hidden={!error}>
        {error && <PanelNotice inline error text={error} />}
      </div>
      <form
        className="portal-form"
        method="post"
        action="/area-cliente/login"
        autoComplete="on"
        noValidate
        onSubmit={submit}
      >
        <CsrfInput token={data.csrfToken} />
        <label className="portal-field">
          Usuário IPTV
          <input
            className="portal-input"
            name="login"
            defaultValue={data.loginValue}
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={120}
            required
            aria-invalid={invalid === 'login' || undefined}
            aria-describedby={error ? 'login-error' : undefined}
          />
        </label>
        <label className="portal-field">
          Senha do IPTV
          <input
            className="portal-input"
            type="password"
            name="password"
            autoComplete="current-password"
            required
            aria-invalid={invalid === 'password' || undefined}
            aria-describedby={error ? 'login-error' : undefined}
          />
        </label>
        <button className="portal-button" disabled={busy}>
          {busy ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
      <p className="portal-help">
        Use o mesmo usuário e senha do IPTV fornecidos no seu cadastro. Se
        esqueceu a senha, peça uma nova ao responsável pela sua assinatura.
      </p>
    </section>
  );
}
function Renewal({ data }: { data?: any }) {
  const selection = useRenewalSelection(data),
    pix = usePixPayment(),
    code = useRef(null);
  async function submit(event) {
    event.preventDefault();
    const request = {
      periodos: Number(selection.periods),
      selecao: selection.selection || undefined,
    };
    pix.generate(async (signal) => {
      const auth = await fetch('/area-cliente/renovar', {
        method: 'POST',
        headers: { Accept: 'application/json' },
        body: new URLSearchParams({ _csrf: data.csrfToken }),
        signal,
      });
      if (
        !auth.ok ||
        auth.redirected ||
        !auth.headers.get('content-type')?.includes('application/json')
      )
        throw new Error(
          'Recarregue a área do cliente e confira se o PIX está disponível.',
        );
      const result = await auth.json(),
        url = new URL(result.pagamentoUrl, location.origin);
      if (
        url.origin !== location.origin ||
        !/^\/pagar\/[^/]+$/.test(url.pathname)
      )
        throw new Error('Não foi possível abrir o pagamento.');
      return createPix(url.pathname, request, signal);
    });
  }
  return (
    <section className="portal-card">
      <h2>Renovar assinatura</h2>
      <p className="portal-renew-price">
        {formatMoney(selection.selected?.valor ?? data.cliente.valor)}
      </p>
      <p className="portal-lead">
        Escolha a duração da renovação e confira o total antes de gerar o PIX.
      </p>
      {data.pix ? (
        <>
          <form
            method="post"
            action="/area-cliente/renovar"
            data-pix-form
            onSubmit={submit}
          >
            <CsrfInput token={data.csrfToken} />
            {data.escolhas.length > 1 && (
              <label className="portal-field" style={{ marginBottom: 16 }}>
                Quais servidores deseja renovar?
                <select
                  className="portal-input"
                  name="selecao"
                  value={selection.selection}
                  disabled={pix.locked}
                  onChange={(event) =>
                    selection.changeSelection(
                      (event.target as HTMLSelectElement).value,
                    )
                  }
                >
                  {data.escolhas.map((group) => (
                    <option key={group.selecao} value={group.selecao}>
                      {group.label}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="portal-field" style={{ marginBottom: 16 }}>
              Por quanto tempo deseja renovar?
              <select
                className="portal-input"
                name="periodos"
                value={selection.periods}
                disabled={pix.locked}
                onChange={(event) =>
                  selection.setPeriods(
                    (event.target as HTMLSelectElement).value,
                  )
                }
              >
                {selection.options.map((option) => (
                  <option key={option.periodos} value={option.periodos}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            {['idle', 'busy'].includes(pix.phase) && (
              <button className="portal-button" disabled={pix.phase === 'busy'}>
                {pix.phase === 'busy' ? 'Gerando PIX…' : 'Renovar com PIX'}
              </button>
            )}
          </form>
          <div
            data-pix-details
            hidden={pix.phase !== 'pending'}
            style={{ marginTop: 20 }}
          >
            <label className="portal-field">
              PIX Copia e Cola
              <textarea
                ref={code}
                className="portal-input"
                data-pix-code
                readOnly
                rows={3}
                style={{ resize: 'vertical', wordBreak: 'break-all' }}
                value={pix.payment?.qrText || ''}
              />
            </label>
            <button
              type="button"
              className="portal-button"
              data-pix-copy
              style={{ marginTop: 12 }}
              onClick={() => pix.copy(code.current)}
            >
              {pix.copied ? 'Código PIX copiado!' : 'Copiar código PIX'}
            </button>
          </div>
          <p
            data-pix-status
            role="status"
            aria-live="polite"
            style={
              pix.phase === 'approved'
                ? { color: '#22c55e', fontWeight: 700 }
                : undefined
            }
          >
            {pix.message}
          </p>
          <p className="portal-help">
            Após a confirmação do pagamento, o responsável fará a renovação do
            seu acesso. Consulte a validade atualizada nesta área.
          </p>
        </>
      ) : (
        <p className="portal-help">
          PIX indisponível no momento. Entre em contato com o responsável pelo
          seu cadastro para renovar.
        </p>
      )}
    </section>
  );
}
export function PortalScreen({ data }: { data?: any }) {
  const logout = useNativeSubmit(),
    cliente = data.cliente;
  useEffect(() => {
    if (cliente) return watchPortalSession();
  }, [cliente?.id]);
  const details = [
    ['Usuário IPTV', cliente?.user],
    ['Plano', cliente?.plano],
    ['Telas', cliente?.telas],
    ...(cliente?.aplicativo ? [['Aplicativo', cliente.aplicativo]] : []),
  ];
  return (
    <>
      <link rel="stylesheet" href="/assets/css/area-cliente.css" />
      <div className="portal-wrap" data-react-page="area-cliente">
        <header className="portal-header">
          <a className="portal-brand" href="/">
            ix<span>streaming</span>
          </a>
          {cliente && (
            <form method="post" action="/area-cliente/sair" onSubmit={logout}>
              <CsrfInput token={data.csrfToken} />
              <button className="portal-button portal-button-secondary">
                Sair
              </button>
            </form>
          )}
        </header>
        <main className="portal-main">
          {cliente ? (
            <>
              {data.erro && (
                <div className="portal-alert">
                  <PanelNotice inline error text={data.erro} />
                </div>
              )}
              <p className="portal-eyebrow">Área do cliente</p>
              <h1 className="portal-welcome">Olá, {cliente.nome}.</h1>
              <p className="portal-lead">
                Acompanhe sua assinatura e mantenha tudo em dia.
              </p>
              <div className="portal-grid">
                <section className="portal-card">
                  <h2>Minha assinatura</h2>
                  <span className="portal-badge">{cliente.statusLabel}</span>
                  <p className="portal-validity">
                    {formatDateBr(cliente.vencimento)}
                  </p>
                  <p className="portal-lead">
                    Vencimento
                    {cliente.horaVencimento
                      ? ` às ${String(cliente.horaVencimento).slice(0, 5)}`
                      : ''}
                  </p>
                  <dl className="portal-details">
                    {details.map(([label, value]) => (
                      <div key={label}>
                        <dt>{label}</dt>
                        <dd>{value}</dd>
                      </div>
                    ))}
                  </dl>
                  {data.adicional && (
                    <>
                      <h3>Segundo servidor: {data.adicional.servidor}</h3>
                      <dl className="portal-details">
                        {[
                          ['Plano', data.adicional.plano],
                          ['Valor', formatMoney(data.adicional.valor)],
                          [
                            'Vencimento',
                            formatDateBr(data.adicional.vencimento),
                          ],
                          ['Telas', data.adicional.telas],
                          ...(data.adicional.user
                            ? [['Usuário IPTV', data.adicional.user]]
                            : []),
                        ].map(([label, value]) => (
                          <div key={label}>
                            <dt>{label}</dt>
                            <dd>{value}</dd>
                          </div>
                        ))}
                      </dl>
                    </>
                  )}
                </section>
                <Renewal data={data} />
              </div>
            </>
          ) : (
            <PortalLogin data={data} />
          )}
        </main>
        <footer className="portal-footer">ixstreaming · Área do cliente</footer>
      </div>
    </>
  );
}

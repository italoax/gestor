'use client';
import { useRef, useState, useEffect, useLayoutEffect } from 'react';
import { PanelNotice } from '../../components/ui/PanelNotice.tsx';
import { describeNoticeError } from '../../../../src/browser/assets/js/ui/panel-feedback.ts';

export function LoginScreen({ data }: { data?: any }) {
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(() =>
    data.error?.[0] ? describeNoticeError(data.error[0]) : null,
  );
  const submitting = useRef(false);
  useLayoutEffect(() => {
    document.body.className = 'login-page';
    document.body.dataset.siteReady = '1';
  }, []);
  useEffect(() => {
    const reset = () => {
      submitting.current = false;
      setBusy(false);
    };
    window.addEventListener('pageshow', reset);
    return () => window.removeEventListener('pageshow', reset);
  }, []);

  async function submit(event) {
    event.preventDefault();
    if (submitting.current) return;
    const form = event.currentTarget;
    submitting.current = true;
    setBusy(true);
    setError(null);
    try {
      // Uma aba antiga pode guardar o token anterior a um login/logout.
      // Atualize o token e confirme o cookie antes de enviar a senha uma vez.
      const response = await fetch('/login', {
        cache: 'no-store',
        credentials: 'same-origin',
        headers: { Accept: 'text/html' },
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok)
        throw new Error('Não foi possível preparar o login. Tente novamente.');
      if (new URL(response.url).pathname !== '/login') {
        location.assign(response.url);
        return;
      }
      const document = new DOMParser().parseFromString(
        await response.text(),
        'text/html',
      );
      const token = (
        document.querySelector(
          '.login-form input[name="_csrf"]',
        ) as HTMLInputElement
      )?.value;
      if (!token)
        throw new Error(
          'Não foi possível atualizar sua sessão. Reabra a página de login.',
        );
      const check = await fetch('/login?session_check=1', {
        cache: 'no-store',
        credentials: 'same-origin',
        headers: { Accept: 'application/json', 'x-csrf-token': token },
        signal: AbortSignal.timeout(15000),
      });
      if (new URL(check.url).pathname !== '/login') {
        location.assign(check.url);
        return;
      }
      if (!check.ok || !(await check.json()).ok)
        throw new Error(
          'O navegador não manteve sua sessão. Permita cookies para este site e tente novamente.',
        );
      form.elements._csrf.value = token;
      HTMLFormElement.prototype.submit.call(form);
    } catch (failure) {
      setError(
        describeNoticeError(
          failure,
          'Não foi possível entrar. Tente novamente em alguns instantes.',
        ),
      );
      submitting.current = false;
      setBusy(false);
    }
  }
  return (
    <main className="login-shell" data-react-page="login">
      <section className="login-grid" aria-labelledby="login-title">
        <div className="login-brand">
          <div className="login-chip">Acesso Restrito</div>
          <h1 id="login-title">Gestor IXTV</h1>
          <p className="login-subtitle">
            Controle clientes, cobranças e mensagens em um ambiente seguro e
            rápido.
          </p>
          <div className="login-highlights">
            {[
              [
                'green',
                'Monitoramento em tempo real',
                'Indicadores atualizados a cada acesso.',
              ],
              [
                'blue',
                'Fluxo de pagamentos',
                'Histórico de cobranças com filtros inteligentes.',
              ],
              [
                'gold',
                'Mensagens automatizadas',
                'Templates prontos para comunicação rápida.',
              ],
            ].map(([color, title, description]) => (
              <div className="login-highlight" key={color}>
                <span className={`dot dot-${color}`} />
                <div>
                  <strong>{title}</strong>
                  <span>{description}</span>
                </div>
              </div>
            ))}
          </div>
          <div className="login-footer-note">
            <span>Precisa de acesso? Fale com o administrador.</span>
          </div>
        </div>
        <div className="login-card">
          <div className="login-card-header">
            <h2>Entrar</h2>
            <p>Use suas credenciais para continuar.</p>
          </div>
          {error && (
            <PanelNotice
              inline
              error
              title={
                error.title === 'Não foi possível concluir'
                  ? 'Não foi possível entrar'
                  : error.title
              }
              text={error.text}
              onClose={() => setError(null)}
            />
          )}
          <form
            className="login-form"
            action="/login"
            method="post"
            autoComplete="on"
            onSubmit={submit}
            aria-busy={busy}
          >
            <input type="hidden" name="_csrf" defaultValue={data.csrfToken} />
            <label className="login-field">
              <span>Nome de usuário</span>
              <input
                type="text"
                name="username"
                placeholder="Seu usuário"
                autoComplete="username"
                required
              />
            </label>
            <label className="login-field">
              <span>Senha</span>
              <div className="login-password-control">
                <input
                  id="login-password"
                  type={visible ? 'text' : 'password'}
                  name="password"
                  placeholder="Sua senha"
                  autoComplete="current-password"
                  required
                />
                <button
                  type="button"
                  aria-controls="login-password"
                  aria-label={visible ? 'Ocultar senha' : 'Mostrar senha'}
                  aria-pressed={visible}
                  onClick={() => setVisible(!visible)}
                >
                  {visible ? 'Ocultar' : 'Mostrar'}
                </button>
              </div>
            </label>
            <div className="login-row">
              <a className="login-link" href="#">
                Esqueceu a senha?
              </a>
            </div>
            <button className="login-btn" type="submit" disabled={busy}>
              {busy ? 'Entrando…' : 'Acessar painel'}
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}

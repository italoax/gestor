'use client';
import { useEffect, useRef, useState } from 'react';
import { Icon } from '../../../../src/frontend/clients/ui.tsx';
import { PanelNotice } from '../../components/ui/PanelNotice.tsx';

export function TwoFactorSettings({ csrfToken }: { csrfToken: string }) {
  const [status, setStatus] = useState<{
    enabled: boolean;
    recoveryRemaining: number;
  }>();
  const [mode, setMode] = useState<'setup' | 'disable' | 'recovery'>();
  const [setup, setSetup] = useState<{ secret: string; qrCode: string }>();
  const [codes, setCodes] = useState<string[]>([]);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const pending = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/account/two-factor', {
      credentials: 'same-origin',
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok || !result.ok)
          throw new Error(
            'Não foi possível consultar o autenticador. Recarregue a página.',
          );
        setStatus(result);
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setError(
            'Não foi possível consultar o autenticador. Recarregue a página.',
          );
      });
    return () => controller.abort();
  }, []);

  async function request(action: string) {
    const response = await fetch(`/api/account/two-factor/${action}`, {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'x-csrf-token': csrfToken,
      },
      body: JSON.stringify({ code }),
      signal: AbortSignal.timeout(20000),
    });
    if (response.status === 401) {
      location.assign('/login');
      throw new Error('Entre novamente para continuar.');
    }
    const result = await response.json();
    if (!response.ok || !result.ok)
      throw new Error(
        result.error ||
          'Não foi possível atualizar a verificação. Tente novamente.',
      );
    return result;
  }

  function clearForm() {
    setMode(undefined);
    setSetup(undefined);
    setCode('');
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError('');
    try {
      const action = mode === 'setup' ? 'enable' : mode!;
      const result = await request(action);
      setStatus({
        enabled: result.enabled,
        recoveryRemaining: result.recoveryCodes.length,
      });
      setCodes(result.recoveryCodes);
      clearForm();
    } catch (error) {
      setError(
        error instanceof Error &&
          !(error instanceof SyntaxError) &&
          !(error instanceof TypeError) &&
          error.name !== 'TimeoutError'
          ? error.message
          : 'A resposta demorou. Confira sua conexão e tente novamente.',
      );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  async function startSetup() {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError('');
    try {
      setSetup(await request('setup'));
      setCode('');
      setMode('setup');
    } catch (error) {
      setError(
        error instanceof Error &&
          !(error instanceof TypeError) &&
          !(error instanceof SyntaxError)
          ? error.message
          : 'Não foi possível iniciar a configuração. Tente novamente.',
      );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  async function cancel() {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError('');
    try {
      if (setup) await request('cancel');
      clearForm();
    } catch {
      setError('Não foi possível cancelar. Tente novamente.');
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  function downloadCodes() {
    const file = new Blob(
      [
        'Gestor IXTV — códigos de recuperação\nCada código pode ser usado uma única vez.\n\n' +
          codes.join('\n'),
      ],
      { type: 'text/plain;charset=utf-8' },
    );
    const url = URL.createObjectURL(file);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'gestor-ixtv-codigos-recuperacao.txt';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <section
      className={`account-panel account-two-factor-panel${mode || codes.length ? ' is-expanded' : ''}`}
      aria-labelledby="account-two-factor-title"
    >
      <header className="account-panel-heading account-two-factor-heading">
        <span className="account-section-icon">
          <Icon name="key" />
        </span>
        <div>
          <h3 id="account-two-factor-title">Verificação em duas etapas</h3>
          <p>Proteja sua conta com o Google Authenticator.</p>
        </div>
        <span
          className={`badge ${status?.enabled ? 'badge-green' : 'badge-muted'}`}
          role="status"
        >
          {status
            ? status.enabled
              ? 'Ativada'
              : 'Desativada'
            : 'Verificando…'}
        </span>
      </header>
      <div className="account-editor">
        {error && (
          <PanelNotice inline error>
            {error}
          </PanelNotice>
        )}
        {!mode && (
          <div className="account-two-factor-summary">
            <p className="account-field-note">
              {status?.enabled
                ? `Além da senha, seu login exige um código do aplicativo. Você tem ${status.recoveryRemaining} códigos de recuperação disponíveis.`
                : 'Ao entrar, você usará sua senha e um código de seis dígitos gerado no aplicativo.'}
            </p>
            {status && (
              <div className="account-two-factor-actions">
                {status.enabled ? (
                  <>
                    <button
                      className="btn btn-muted"
                      type="button"
                      onClick={() => {
                        setCodes([]);
                        setError('');
                        setMode('recovery');
                      }}
                    >
                      Gerar novos códigos
                    </button>
                    <button
                      className="btn account-danger-button"
                      type="button"
                      onClick={() => {
                        setCodes([]);
                        setError('');
                        setMode('disable');
                      }}
                    >
                      Desativar
                    </button>
                  </>
                ) : (
                  <button
                    className="btn btn-primary"
                    type="button"
                    disabled={busy}
                    onClick={startSetup}
                  >
                    {busy ? 'Aguarde…' : 'Configurar autenticador'}
                  </button>
                )}
              </div>
            )}
          </div>
        )}
        {mode && (
          <form
            className="account-two-factor-form"
            onSubmit={submit}
            aria-busy={busy}
          >
            {setup && (
              <div className="account-authenticator-setup">
                <div>
                  <img
                    src={setup.qrCode}
                    width="240"
                    height="240"
                    alt="QR code para adicionar sua conta ao Google Authenticator"
                  />
                  <p className="account-field-note">
                    No Google Authenticator, toque em + e em “Ler QR code”.
                  </p>
                </div>
                <div>
                  <strong>Não consegue escanear?</strong>
                  <p className="account-field-note">
                    Adicione uma chave de configuração no aplicativo e escolha o
                    tipo “Baseado no horário”.
                  </p>
                  <code className="account-authenticator-secret">
                    {setup.secret}
                  </code>
                </div>
              </div>
            )}
            <div className="account-fields">
              {(setup || mode !== 'setup') && (
                <label className="field">
                  {mode === 'setup'
                    ? 'Código do Google Authenticator'
                    : 'Código do aplicativo ou de recuperação'}
                  <input
                    className="input"
                    type="text"
                    name="totp_code"
                    inputMode={mode === 'setup' ? 'numeric' : 'text'}
                    autoComplete="one-time-code"
                    value={code}
                    onChange={(event) => setCode(event.target.value)}
                    required
                    maxLength={24}
                    disabled={busy}
                    placeholder={
                      mode === 'setup'
                        ? '000000'
                        : 'Código de seis dígitos ou de recuperação'
                    }
                  />
                </label>
              )}
            </div>
            <p className="account-field-note">
              {mode === 'disable'
                ? 'Seu login voltará a usar apenas a senha. Os códigos de recuperação serão invalidados.'
                : mode === 'recovery'
                  ? 'Os códigos antigos deixarão de funcionar. Guarde os novos em um lugar seguro.'
                  : 'A proteção só será ativada depois de confirmar um código do aplicativo.'}
            </p>
            <div className="account-two-factor-actions">
              <button
                className="btn btn-muted"
                type="button"
                disabled={busy}
                onClick={cancel}
              >
                Cancelar
              </button>
              <button
                className={`btn ${mode === 'disable' ? 'account-danger-button' : 'btn-primary'}`}
                type="submit"
                disabled={busy}
              >
                {busy
                  ? 'Aguarde…'
                  : mode === 'setup'
                    ? 'Ativar verificação'
                    : mode === 'disable'
                      ? 'Desativar verificação'
                      : 'Gerar novos códigos'}
              </button>
            </div>
          </form>
        )}
        {codes.length > 0 && (
          <div
            className="account-recovery-codes"
            role="region"
            aria-label="Códigos de recuperação"
          >
            <strong>Guarde seus códigos de recuperação</strong>
            <p className="account-field-note">
              Eles aparecem somente agora. Cada código permite um acesso se você
              perder o autenticador e só pode ser usado uma vez.
            </p>
            <ul>
              {codes.map((code) => (
                <li key={code}>
                  <code>{code}</code>
                </li>
              ))}
            </ul>
            <div className="account-two-factor-actions">
              <button
                className="btn btn-primary"
                type="button"
                onClick={downloadCodes}
              >
                Baixar códigos
              </button>
              <button
                className="btn btn-muted"
                type="button"
                onClick={() => setCodes([])}
              >
                Já guardei
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

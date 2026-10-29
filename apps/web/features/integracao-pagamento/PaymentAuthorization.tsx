'use client';
import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { NativeDialog } from '../../components/ui/NativeDialog.tsx';
import { useNativeSubmit } from '../../hooks/useNativeSubmit.ts';
import { showPanelNotice } from '../../../../src/browser/assets/js/ui/panel-feedback.ts';

const Authorization = createContext<() => Promise<boolean>>(async () => false);

export function PaymentAuthorization({
  token,
  children,
}: {
  token: string;
  children: React.ReactNode;
}) {
  const [challenge, setChallenge] = useState<{
    twoFactorRequired: boolean;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const resolve = useRef<((value: boolean) => void) | null>(null);
  const pending = useRef<Promise<boolean> | null>(null);
  const lifetime = useRef<AbortController | null>(null);
  const confirmation = useRef<AbortController | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    lifetime.current = controller;
    return () => {
      controller.abort();
      confirmation.current?.abort();
      resolve.current?.(false);
    };
  }, []);
  function finish(accepted: boolean) {
    confirmation.current?.abort();
    resolve.current?.(accepted);
    resolve.current = null;
    setChallenge(null);
    setBusy(false);
    setError('');
  }
  async function check() {
    try {
      const response = await fetch('/api/session/confirm', {
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { Accept: 'application/json' },
        signal: AbortSignal.any([
          lifetime.current!.signal,
          AbortSignal.timeout(20000),
        ]),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.ok)
        throw new Error(
          result?.error ||
            'Não foi possível verificar sua sessão. Tente novamente.',
        );
      if (result.recent === true) return true;
      if (result.recent !== false)
        throw new Error(
          'Não foi possível verificar sua sessão. Tente novamente.',
        );
      return await new Promise<boolean>((done) => {
        resolve.current = done;
        setError('');
        setChallenge({ twoFactorRequired: result.twoFactorRequired === true });
      });
    } catch (error) {
      if (!lifetime.current?.signal.aborted)
        showPanelNotice(
          error instanceof Error
            ? error.message
            : 'Não foi possível verificar sua sessão.',
          true,
        );
      return false;
    }
  }
  function authorize() {
    if (!pending.current)
      pending.current = check().finally(() => {
        pending.current = null;
      });
    return pending.current;
  }
  async function confirm(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const fields = new FormData(event.currentTarget);
    const controller = new AbortController();
    confirmation.current = controller;
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/session/confirm', {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'x-csrf-token': token,
        },
        body: JSON.stringify({
          password: fields.get('password'),
          code: fields.get('code'),
        }),
        signal: AbortSignal.any([
          controller.signal,
          lifetime.current!.signal,
          AbortSignal.timeout(20000),
        ]),
      });
      const result = await response.json().catch(() => null);
      if (controller.signal.aborted) return;
      if (!response.ok || result?.ok !== true) {
        if (result?.twoFactorRequired)
          setChallenge({ twoFactorRequired: true });
        throw new Error(
          result?.error ||
            (response.status === 429
              ? 'Muitas tentativas. Aguarde antes de tentar novamente.'
              : 'Não foi possível confirmar. Tente novamente.'),
        );
      }
      finish(true);
    } catch (error) {
      if (!controller.signal.aborted)
        setError(
          error instanceof Error
            ? error.message
            : 'Não foi possível confirmar.',
        );
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }
  return (
    <Authorization.Provider value={authorize}>
      {children}
      {challenge && (
        <NativeDialog
          title="Confirme sua identidade"
          className="payment-auth-dialog"
          width={440}
          onClose={() => finish(false)}
          footer={
            <>
              <button
                type="button"
                className="btn btn-muted"
                onClick={() => finish(false)}
              >
                Cancelar
              </button>
              <button
                type="submit"
                form="payment-auth-form"
                className="btn btn-primary"
                disabled={busy}
              >
                {busy ? 'Confirmando…' : 'Confirmar e salvar'}
              </button>
            </>
          }
        >
          <form
            id="payment-auth-form"
            className="modal-body"
            onSubmit={confirm}
            aria-busy={busy}
          >
            <p className="muted">
              Confirme sua senha para salvar as configurações de pagamento.
            </p>
            <label className="field">
              Senha atual
              <input
                className="input"
                type="password"
                name="password"
                required
                autoComplete="current-password"
                autoFocus
              />
            </label>
            {challenge.twoFactorRequired && (
              <label className="field">
                Código do autenticador
                <input
                  className="input"
                  name="code"
                  required
                  autoComplete="one-time-code"
                  maxLength={40}
                />
                <small>Você também pode usar um código de recuperação.</small>
              </label>
            )}
            {error && (
              <p className="payment-auth-error" role="alert">
                {error}
              </p>
            )}
          </form>
        </NativeDialog>
      )}
    </Authorization.Provider>
  );
}

export function useAuthorizedPaymentSubmit() {
  const authorize = useContext(Authorization);
  const nativeSubmit = useNativeSubmit();
  const approved = useRef(false);
  const waiting = useRef(false);
  return (event: React.FormEvent<HTMLFormElement>) => {
    if (approved.current) {
      approved.current = false;
      nativeSubmit(event);
      return;
    }
    event.preventDefault();
    if (waiting.current) return;
    const form = event.currentTarget;
    const submitter = (event.nativeEvent as SubmitEvent)
      .submitter as HTMLButtonElement | null;
    waiting.current = true;
    void authorize()
      .then((accepted) => {
        if (!accepted || !form.isConnected) return;
        approved.current = true;
        try {
          form.requestSubmit(submitter?.form === form ? submitter : undefined);
        } finally {
          approved.current = false;
        }
      })
      .finally(() => {
        waiting.current = false;
      });
  };
}

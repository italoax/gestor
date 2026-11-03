'use client';
import { PanelNotice } from '../ui/PanelNotice.tsx';
import { useEffect, useRef, useState } from 'react';
import { confirmPanelAction } from '../../../../src/browser/assets/js/ui/panel-feedback.ts';

export function PwaProvider({ children }: { children: React.ReactNode }) {
  const registration = useRef<ServiceWorkerRegistration | null>(null);
  const reloadRequested = useRef(false);
  const dirtyForms = useRef(new Set<HTMLFormElement>());
  const [online, setOnline] = useState(true);
  const [update, setUpdate] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    window.__gestorPwaManaged = true;
    const lifecycle = new AbortController();
    const options = { signal: lifecycle.signal };
    const connection = () => setOnline(navigator.onLine !== false);
    connection();
    window.addEventListener('online', connection, options);
    window.addEventListener('offline', connection, options);
    document.addEventListener(
      'input',
      (event) => {
        const form = (event.target as HTMLInputElement)?.form;
        if (event.isTrusted && form?.method.toLowerCase() === 'post')
          dirtyForms.current.add(form);
      },
      { ...options, capture: true },
    );
    const saved = (event: Event) =>
      dirtyForms.current.delete(event.target as HTMLFormElement);
    document.addEventListener('reset', saved, options);
    document.addEventListener('gestor:submit-success', saved, options);

    let timer: ReturnType<typeof setInterval> | undefined;
    let lastCheck = Date.now();
    let controlled = Boolean(navigator.serviceWorker?.controller);
    const checkUpdate = () => {
      if (document.hidden || Date.now() - lastCheck < 300000) return;
      lastCheck = Date.now();
      void registration.current?.update().catch(() => {});
    };
    if ('serviceWorker' in navigator && window.isSecureContext) {
      navigator.serviceWorker.addEventListener(
        'controllerchange',
        () => {
          if (reloadRequested.current) return location.reload();
          if (controlled) setUpdate(true);
          controlled = true;
        },
        options,
      );
      void navigator.serviceWorker
        .register('/__pwa/worker', { scope: '/', updateViaCache: 'none' })
        .then((value) => {
          if (lifecycle.signal.aborted) return;
          registration.current = value;
          if (value.waiting) setUpdate(true);
          const watch = () => {
            const worker = value.installing;
            worker?.addEventListener(
              'statechange',
              () => {
                if (worker.state === 'installed' && value.waiting)
                  setUpdate(true);
              },
              options,
            );
          };
          value.addEventListener('updatefound', watch, options);
          watch();
          document.addEventListener('visibilitychange', checkUpdate, options);
          window.addEventListener(
            'online',
            () => {
              lastCheck = 0;
              checkUpdate();
            },
            options,
          );
          timer = setInterval(checkUpdate, 300000);
        })
        .catch(() => {
          /* O site continua utilizavel se o navegador recusar o PWA. */
        });
    }
    return () => {
      lifecycle.abort();
      clearInterval(timer);
      window.__gestorPwaManaged = false;
    };
  }, []);

  useEffect(() => {
    if (!updating) return;
    const timer = setTimeout(() => {
      reloadRequested.current = false;
      setUpdating(false);
      setMessage('Não foi possível atualizar agora. Tente novamente.');
    }, 15000);
    return () => clearTimeout(timer);
  }, [updating]);

  const applyUpdate = async () => {
    if (document.querySelector('form[aria-busy="true"]')) {
      setMessage('Aguarde o salvamento terminar antes de atualizar.');
      return;
    }
    if (
      [...dirtyForms.current].some((form) => form.isConnected) &&
      !(await confirmPanelAction(
        'Atualizar o aplicativo e descartar as alterações ainda não salvas?',
      ))
    )
      return;
    setUpdating(true);
    reloadRequested.current = true;
    if (registration.current?.waiting)
      registration.current.waiting.postMessage({ type: 'SKIP_WAITING' });
    else location.reload();
  };
  const compactUpdate = online && update && !message;
  return (
    <>
      {children}
      {(!online || update || message) && (
        <PanelNotice
          className={`pwa-app-notice${compactUpdate ? ' pwa-update-notice' : ''}`}
          error={!online}
          info={online}
          pending={updating}
          title={
            !online
              ? 'Sem conexão'
              : message
                ? 'Aviso do aplicativo'
                : 'Atualização disponível'
          }
          text={
            !online
              ? 'Reconecte para carregar ou salvar seus dados.'
              : message || undefined
          }
          onClose={
            ((online && update) || message) && !updating
              ? () => (message ? setMessage('') : setUpdate(false))
              : undefined
          }
          actions={
            online &&
            update && (
              <button
                className="panel-notice-primary"
                type="button"
                onClick={applyUpdate}
                disabled={updating}
              >
                {updating ? 'Atualizando…' : 'Atualizar'}
              </button>
            )
          }
        />
      )}
    </>
  );
}

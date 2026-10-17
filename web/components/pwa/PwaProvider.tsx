'use client';
import { createContext, useContext, useEffect, useRef, useState } from 'react';

type InstallEvent = Event & {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: string }>;
};
const InstallContext = createContext({
  available: false,
  busy: false,
  install: () => {},
});

export function PwaInstallButton() {
  const install = useContext(InstallContext);
  if (!install.available) return null;
  return (
    <button
      className="pwa-install"
      type="button"
      disabled={install.busy}
      onClick={install.install}
    >
      <span aria-hidden="true">↓</span>
      <span>{install.busy ? 'Instalando…' : 'Instalar aplicativo'}</span>
    </button>
  );
}

export function PwaProvider({ children }: { children: React.ReactNode }) {
  const prompt = useRef<InstallEvent | null>(null);
  const registration = useRef<ServiceWorkerRegistration | null>(null);
  const reloadRequested = useRef(false);
  const dirtyForms = useRef(new Set<HTMLFormElement>());
  const [available, setAvailable] = useState(false);
  const [busy, setBusy] = useState(false);
  const [ios, setIos] = useState(false);
  const [instructions, setInstructions] = useState(false);
  const [online, setOnline] = useState(true);
  const [update, setUpdate] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [message, setMessage] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    window.__gestorPwaManaged = true;
    const lifecycle = new AbortController();
    const options = { signal: lifecycle.signal };
    const display = matchMedia(
      '(display-mode: standalone), (display-mode: minimal-ui), (display-mode: fullscreen)',
    );
    const standalone = () =>
      display.matches ||
      Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
    const apple =
      /iPhone|iPad|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    setIos(apple);
    const refreshInstall = () =>
      setAvailable(!standalone() && (apple || Boolean(prompt.current)));
    refreshInstall();
    display.addEventListener('change', refreshInstall, options);
    window.addEventListener(
      'beforeinstallprompt',
      (event) => {
        event.preventDefault();
        prompt.current = event as InstallEvent;
        refreshInstall();
      },
      options,
    );
    window.addEventListener(
      'appinstalled',
      () => {
        prompt.current = null;
        setAvailable(false);
        setInstructions(false);
      },
      options,
    );
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
    if (instructions) dialog.current?.showModal();
  }, [instructions]);

  useEffect(() => {
    if (!updating) return;
    const timer = setTimeout(() => {
      reloadRequested.current = false;
      setUpdating(false);
      setMessage('Não foi possível atualizar agora. Tente novamente.');
    }, 15000);
    return () => clearTimeout(timer);
  }, [updating]);

  const install = async () => {
    if (ios) return setInstructions(true);
    const event = prompt.current;
    if (!event || busy) return;
    setBusy(true);
    try {
      await event.prompt();
      const choice = await event.userChoice;
      if (choice.outcome === 'accepted') setAvailable(false);
    } catch {
      setMessage('Use o menu do navegador para instalar o aplicativo.');
    } finally {
      prompt.current = null;
      setBusy(false);
      if (!ios) setAvailable(false);
    }
  };
  const applyUpdate = () => {
    if (document.querySelector('form[aria-busy="true"]')) {
      setMessage('Aguarde o salvamento terminar antes de atualizar.');
      return;
    }
    if (
      [...dirtyForms.current].some((form) => form.isConnected) &&
      !window.confirm(
        'Atualizar o aplicativo e descartar as alterações ainda não salvas?',
      )
    )
      return;
    setUpdating(true);
    reloadRequested.current = true;
    if (registration.current?.waiting)
      registration.current.waiting.postMessage({ type: 'SKIP_WAITING' });
    else location.reload();
  };
  return (
    <InstallContext.Provider value={{ available, busy, install }}>
      {children}
      {(!online || update || message) && (
        <aside
          className="pwa-status"
          data-state={!online ? 'offline' : message ? 'notice' : 'update'}
          aria-label="Aplicativo"
        >
          <span className="pwa-status-icon" aria-hidden="true">
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              {!online ? (
                <path d="m3 3 18 18M2 8a16 16 0 0 1 2-1m4-2a16 16 0 0 1 14 3M5 12a11 11 0 0 1 3-2m4-1a11 11 0 0 1 7 3m-11 4a6 6 0 0 1 7-1m-3 5h.01" />
              ) : message ? (
                <>
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 8v4m0 4h.01" />
                </>
              ) : (
                <>
                  <path d="M20 7v5h-5M4 17v-5h5" />
                  <path d="M6 7a7 7 0 0 1 12-1l2 6M4 12l2 6a7 7 0 0 0 12-1" />
                </>
              )}
            </svg>
          </span>
          <div className="pwa-status-copy" role="status" aria-atomic="true">
            <strong>
              {!online
                ? 'Sem conexão'
                : message
                  ? 'Aviso do aplicativo'
                  : 'Atualização disponível'}
            </strong>
            <p>
              {!online
                ? 'Reconecte para carregar ou salvar seus dados.'
                : message || 'Uma nova versão do aplicativo está pronta.'}
            </p>
          </div>
          {((online && update) || message) && (
            <div className="pwa-status-actions">
              {online && update && (
                <button
                  className="pwa-status-update"
                  type="button"
                  onClick={applyUpdate}
                  disabled={updating}
                >
                  {updating ? 'Atualizando…' : 'Atualizar'}
                </button>
              )}
              <button
                className="pwa-status-close"
                type="button"
                disabled={updating}
                onClick={() => (message ? setMessage('') : setUpdate(false))}
                aria-label={message ? 'Fechar aviso' : 'Adiar atualização'}
                title={message ? 'Fechar aviso' : 'Lembrar depois'}
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  aria-hidden="true"
                >
                  <path d="m6 6 12 12M18 6 6 18" />
                </svg>
              </button>
            </div>
          )}
        </aside>
      )}
      {instructions && (
        <dialog
          ref={dialog}
          className="pwa-instructions"
          aria-labelledby="pwa-install-title"
          onCancel={() => setInstructions(false)}
        >
          <h2 id="pwa-install-title">Instalar no iPhone ou iPad</h2>
          <p>
            Abra este site no Safari, toque em Compartilhar e escolha Adicionar
            à Tela de Início.
          </p>
          <button type="button" onClick={() => setInstructions(false)}>
            Entendi
          </button>
        </dialog>
      )}
    </InstallContext.Provider>
  );
}

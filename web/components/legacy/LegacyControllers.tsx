'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

const modules = [
  'ui/modals',
  'ui/phone-fields',
  'ui/date-fields',
  'ui/tables',
  'pages/catalogs',
  'pages/client-access',
  'pages/transacoes',
  'pages/whatsapp-messages',
  'pages/automacao',
  'pages/mensagens',
];
const scripts = new Map();
function loadScript(path) {
  if (scripts.has(path)) return scripts.get(path);
  const loaded = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `/assets/js/${path}.js`;
    script.onload = () => resolve();
    script.onerror = () => {
      scripts.delete(path);
      script.remove();
      reject(
        new Error('Não foi possível carregar os controles do formulário.'),
      );
    };
    document.head.append(script);
  });
  scripts.set(path, loaded);
  return loaded;
}

export function LegacyControllers({
  revision,
  nativeNavigation = false,
}: {
  revision?: any;
  nativeNavigation?: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState('');
  useEffect(() => {
    let cancelled = false;
    window.gestorNavigate = async (href) => {
      const url = new URL(href, location.href);
      if (
        !nativeNavigation &&
        url.origin === location.origin &&
        url.pathname === '/clientes'
      ) {
        if (url.pathname + url.search === location.pathname + location.search)
          router.refresh();
        else router.push(url.pathname + url.search + url.hash);
        return true;
      }
      location.assign(url.href);
      return true;
    };
    window.gestorRefresh = () =>
      nativeNavigation ? location.reload() : router.refresh();
    async function initialize() {
      for (const module of modules) await loadScript(module);
      if (cancelled) return;
      const alreadyInitialized = Boolean(window.__gestorInitPage);
      await loadScript('main');
      if (cancelled) return;
      if (alreadyInitialized) await window.__gestorInitPage();
      await loadScript('app-shell');
      await loadScript('visual-effects');
      if (!cancelled) setError('');
    }
    initialize().catch((error) => {
      if (!cancelled) setError(error.message);
    });
    return () => {
      cancelled = true;
      document.dispatchEvent(new Event('gestor:before-swap'));
      window.__gestorAbort?.abort();
      document.body.classList.remove('modal-open');
      document.documentElement.classList.remove('modal-open');
    };
  }, [revision, router, nativeNavigation]);
  return error ? (
    <div className="form-alert error" role="alert">
      {error}
      <button
        className="btn btn-muted"
        type="button"
        onClick={() => location.reload()}
      >
        Recarregar página
      </button>
    </div>
  ) : null;
}

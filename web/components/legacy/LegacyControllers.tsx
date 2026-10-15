'use client';
import { useEffect, useState } from 'react';

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

export function LegacyControllers({ revision }: { revision?: any }) {
  const [error, setError] = useState('');
  useEffect(() => {
    let cancelled = false;
    async function initialize() {
      for (const module of modules) await loadScript(module);
      if (cancelled) return;
      const alreadyInitialized = Boolean(window.__gestorInitPage);
      await loadScript('main');
      if (cancelled) return;
      if (alreadyInitialized) await window.__gestorInitPage();
      const shellInitialized = Boolean(window.__gestorInitShell);
      await loadScript('app-shell');
      if (cancelled) return;
      if (shellInitialized) window.__gestorInitShell();
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
  }, [revision]);
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

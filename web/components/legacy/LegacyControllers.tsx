'use client';
import { useEffect, useState } from 'react';

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
    let effectsIdle: number | undefined;
    let effectsTimer: number | undefined;
    const loadEffects = () => {
      if (!cancelled) void loadScript('visual-effects').catch(() => {});
    };
    async function initialize() {
      const alreadyInitialized = Boolean(window.__gestorInitPage);
      const shellInitialized = Boolean(window.__gestorInitShell);
      await loadScript('panel-runtime');
      if (cancelled) return;
      if (alreadyInitialized) await window.__gestorInitPage();
      if (cancelled) return;
      if (shellInitialized) window.__gestorInitShell();
      setError('');
      if (typeof window.requestIdleCallback === 'function')
        effectsIdle = window.requestIdleCallback(loadEffects, {
          timeout: 2000,
        });
      else effectsTimer = window.setTimeout(loadEffects, 0);
    }
    initialize().catch((error) => {
      if (!cancelled) setError(error.message);
    });
    return () => {
      cancelled = true;
      if (effectsIdle !== undefined) window.cancelIdleCallback(effectsIdle);
      window.clearTimeout(effectsTimer);
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

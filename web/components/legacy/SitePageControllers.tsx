'use client';
import { useEffect, useLayoutEffect, useState } from 'react';

// As telas adaptadas usam navegação completa enquanto seus controladores
// manipulam o DOM. Isso encerra timers e listeners antes de outra tela montar.
export function SitePageControllers({
  scripts,
  bodyAttributes,
  path,
}: {
  scripts?: any;
  bodyAttributes?: any;
  path?: string;
}) {
  const [error, setError] = useState('');
  useLayoutEffect(() => {
    document.body.className = bodyAttributes.class || '';
    document.body.dataset.nextClients = '1';
  }, [bodyAttributes]);
  useEffect(() => {
    let cancelled = false;
    const nodes = [];
    window.gestorNavigate = async (href) => {
      location.assign(href);
      return true;
    };
    window.gestorRefresh = () => location.reload();
    const change = (event) => {
      if ((event.target as HTMLElement).matches('[data-submit-on-change]'))
        (event.target as HTMLInputElement).form?.requestSubmit();
    };
    document.addEventListener('change', change);
    const confirmAction = (event) => {
      const element =
        event.type === 'submit'
          ? (event.target as HTMLElement)
          : ((event.target as HTMLElement).closest(
              '[data-confirm]',
            ) as HTMLElement);
      if (event.type === 'click' && element?.tagName === 'FORM') return;
      if (element?.dataset.confirm && !window.confirm(element.dataset.confirm))
        event.preventDefault();
    };
    document.addEventListener('click', confirmAction);
    document.addEventListener('submit', confirmAction);
    async function initialize() {
      for (const descriptor of scripts) {
        if (cancelled) return;
        const { attributes, code } = descriptor;
        const src = attributes.src;
        if (
          src &&
          /\/assets\/js\/(navigation|react-loader)\.js(?:\?|$)/.test(src)
        )
          continue;
        // A restauração do tema já é feita pelo layout Next.
        if (!src && code.includes("localStorage.getItem('gestor-theme')"))
          continue;
        const script = document.createElement('script');
        for (const [key, value] of Object.entries(attributes)) {
          if (!['src', 'async', 'defer'].includes(key))
            script.setAttribute(key, String(value));
        }
        nodes.push(script);
        if (src) {
          script.src = src;
          script.async = false;
          await new Promise<void>((resolve) => {
            script.onload = () => resolve();
            script.onerror = () => {
              if (!cancelled)
                setError(
                  'Não foi possível carregar alguns controles desta página.',
                );
              // Uma biblioteca de gráficos indisponível não deve impedir os
              // formulários e o restante dos controles de inicializarem.
              resolve();
            };
            document.head.append(script);
          });
        } else {
          script.textContent = code;
          document.head.append(script);
        }
      }
      if (!cancelled) document.body.dataset.siteReady = '1';
    }
    // Evita executar os scripts duas vezes na verificação de efeitos do React.
    const timer = setTimeout(
      () =>
        initialize().catch((failure) => {
          if (!cancelled) setError(failure.message);
        }),
      0,
    );
    return () => {
      cancelled = true;
      clearTimeout(timer);
      document.removeEventListener('change', change);
      document.removeEventListener('click', confirmAction);
      document.removeEventListener('submit', confirmAction);
      document.dispatchEvent(new Event('gestor:before-swap'));
      window.__gestorAbort?.abort();
      nodes.forEach((node) => node.remove());
    };
  }, [scripts, path]);
  return error ? (
    <div className="form-alert error" role="alert">
      {error}{' '}
      <button
        type="button"
        className="btn btn-muted"
        onClick={() => location.reload()}
      >
        Recarregar página
      </button>
    </div>
  ) : null;
}

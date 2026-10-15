'use client';
import { useEffect, useRef, useState } from 'react';

export function LandingPortal() {
  const [open, setOpen] = useState(false);
  const trigger = useRef(null);
  return (
    <>
      <a
        ref={trigger}
        href="/area-cliente"
        data-open-client-portal
        style={{ color: 'inherit', fontSize: 13, whiteSpace: 'nowrap' }}
        onClick={(event) => {
          event.preventDefault();
          setOpen(true);
        }}
      >
        Área do cliente
      </a>
      {open && (
        <PortalDialog returnFocus={trigger} onClose={() => setOpen(false)} />
      )}
    </>
  );
}

function PortalDialog({
  onClose,
  returnFocus,
}: {
  onClose?: (...args: any[]) => any;
  returnFocus?: any;
}) {
  const dialog = useRef(null),
    frame = useRef(null),
    observer = useRef(null),
    frameCleanup = useRef(null),
    timer = useRef(null),
    backdrop = useRef(false),
    closing = useRef(false);
  const [loading, setLoading] = useState(true),
    [login, setLogin] = useState(true),
    [animating, setAnimating] = useState(false);
  const close = () => {
    if (closing.current) return;
    closing.current = true;
    if (
      matchMedia('(prefers-reduced-motion: reduce)').matches ||
      document.documentElement.classList.contains('fx-paused')
    ) {
      onClose();
      return;
    }
    setAnimating(true);
    timer.current = setTimeout(onClose, 190);
  };
  useEffect(() => {
    const element = dialog.current,
      previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    element.showModal();
    return () => {
      clearTimeout(timer.current);
      observer.current?.disconnect();
      frameCleanup.current?.();
      element.close();
      document.body.style.overflow = previousOverflow;
      returnFocus.current?.focus();
    };
  }, []);
  const outside = (event) => {
    if ((event.target as HTMLElement) !== dialog.current) return false;
    const rect = dialog.current.getBoundingClientRect();
    return (
      event.clientX < rect.left ||
      event.clientX > rect.right ||
      event.clientY < rect.top ||
      event.clientY > rect.bottom
    );
  };
  const loaded = () => {
    observer.current?.disconnect();
    frameCleanup.current?.();
    try {
      const doc = frame.current.contentDocument;
      if (!doc || doc.URL === 'about:blank') return;
      const isLogin = !!(doc.querySelector('.portal-login') as HTMLElement);
      setLogin(isLogin);
      if (isLogin) {
        const main = doc.querySelector('.portal-main') as HTMLElement;
        if (main) {
          const resize = () => {
            const height = Math.ceil(main.getBoundingClientRect().height + 2);
            if (height > 2 && dialog.current)
              dialog.current.style.height = height + 'px';
          };
          observer.current = new ResizeObserver(resize);
          observer.current.observe(main);
          resize();
        }
      } else dialog.current.style.height = '';
      const escape = (event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          close();
        }
      };
      doc.addEventListener('keydown', escape);
      frameCleanup.current = () => doc.removeEventListener('keydown', escape);
    } catch {
      /* The fallback link also opens the portal independently. */
    }
    setLoading(false);
  };
  return (
    <dialog
      ref={dialog}
      id="client-dialog"
      className={`client-dialog ${login ? 'client-dialog-login' : ''} ${loading ? 'client-dialog-loading' : ''} ${animating ? 'client-dialog-closing' : ''}`}
      aria-label="Área do cliente"
      aria-busy={loading || undefined}
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      onPointerDown={(event) => {
        backdrop.current = outside(event);
      }}
      onClick={(event) => {
        if (backdrop.current && outside(event)) close();
        backdrop.current = false;
      }}
    >
      <div className="client-dialog-bar">
        <span>Área do cliente</span>
        <button
          type="button"
          data-close-client-portal
          aria-label="Fechar área do cliente"
          autoFocus
          onClick={close}
        >
          ×
        </button>
      </div>
      <iframe
        ref={frame}
        src="/area-cliente?embedded=1"
        title="Área do cliente ixstreaming"
        data-client-frame
        onLoad={loaded}
      />
    </dialog>
  );
}

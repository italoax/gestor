'use client';
import { useEffect, useId, useRef } from 'react';

export function NativeDialog({
  title,
  children,
  footer,
  onClose,
  width = 600,
  className = '',
}: {
  title?: React.ReactNode;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  onClose?: (...args: any[]) => any;
  width?: number | string;
  className?: string;
}) {
  const dialog = useRef(null);
  const titleId = useId();
  useEffect(() => {
    const element = dialog.current;
    const trigger = document.activeElement as HTMLElement;
    element.showModal();
    document.body.classList.add('modal-open');
    document.documentElement.classList.add('modal-open');
    return () => {
      element.close();
      if (
        !(document.querySelector(
          '.modal-overlay.open, dialog[open]',
        ) as HTMLElement)
      ) {
        document.body.classList.remove('modal-open');
        document.documentElement.classList.remove('modal-open');
      }
      if (trigger?.isConnected) trigger.focus();
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      className={`modal react-dialog ${className}`}
      style={{
        width: `min(${width}px, calc(100vw - 24px))`,
        maxWidth: 'calc(100vw - 24px)',
        maxHeight: '90dvh',
        overflow: 'auto',
        padding: 0,
        margin: 'auto',
        color: 'var(--text)',
      }}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <div className="modal-header">
        <h3 id={titleId}>{title}</h3>
        <button
          type="button"
          className="modal-close"
          aria-label="Fechar"
          onClick={onClose}
        >
          ×
        </button>
      </div>
      {children}
      <div className="modal-footer">
        {footer || (
          <button type="button" className="btn btn-primary" onClick={onClose}>
            Fechar
          </button>
        )}
      </div>
    </dialog>
  );
}

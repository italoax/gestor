'use client';
import { describeNoticeError } from '../../../../src/browser/assets/js/ui/panel-feedback.ts';

export { showPanelNotice } from '../../../../src/browser/assets/js/ui/panel-feedback.ts';

export function PanelNotice({
  text,
  children,
  actions,
  className = '',
  title,
  error = false,
  pending = false,
  info = false,
  inline = false,
  onClose,
}: {
  text?: string;
  children?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
  title?: string;
  error?: boolean;
  pending?: boolean;
  info?: boolean;
  inline?: boolean;
  onClose?: () => void;
}) {
  const dismissible = Boolean(onClose && !pending);
  const failure = error
    ? describeNoticeError(
        text || (typeof children === 'string' ? children : ''),
      )
    : undefined;
  return (
    <div
      className={`panel-notice${inline ? ' is-inline' : ''}${className ? ' ' + className : ''}`}
      data-state={
        pending ? 'pending' : error ? 'error' : info ? 'info' : 'success'
      }
      data-dismissible={dismissible}
    >
      <span className="panel-notice-icon" aria-hidden="true">
        {pending ? (
          <span className="btn-spinner" />
        ) : (
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
            {error ? (
              <>
                <path d="m12 3 10 18H2L12 3Z" />
                <path d="M12 9v5m0 3h.01" />
              </>
            ) : info ? (
              <>
                <circle cx="12" cy="12" r="9" />
                <path d="M12 11v6m0-10h.01" />
              </>
            ) : (
              <>
                <circle cx="12" cy="12" r="9" />
                <path d="m8 12 3 3 5-6" />
              </>
            )}
          </svg>
        )}
      </span>
      <div
        className="panel-notice-copy"
        role={error ? 'alert' : 'status'}
        aria-atomic="true"
      >
        <strong>
          {title ||
            (pending
              ? 'Salvando…'
              : error
                ? failure.title
                : info
                  ? 'Informação'
                  : 'Tudo certo!')}
        </strong>
        {text && <p>{error ? describeNoticeError(text).text : text}</p>}
        {children && (
          <div className="panel-notice-body">
            {error && typeof children === 'string'
              ? describeNoticeError(children).text
              : children}
          </div>
        )}
      </div>
      {dismissible && (
        <button
          className="panel-notice-close"
          type="button"
          onClick={onClose}
          aria-label="Fechar aviso"
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
      )}
      {actions && <div className="panel-notice-actions">{actions}</div>}
    </div>
  );
}

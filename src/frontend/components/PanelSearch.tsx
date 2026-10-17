'use client';
import { useRef } from 'react';

export function PanelSearch({
  value,
  onChange,
  placeholder,
  label = placeholder,
  id,
  legacySearch = false,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  label?: string;
  id?: string;
  legacySearch?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <div className="panel-search" role="search" aria-label={label}>
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        aria-hidden="true"
      >
        <circle cx="10.5" cy="10.5" r="6.5" />
        <path d="m16 16 4 4" />
      </svg>
      <input
        ref={input}
        id={id}
        className="input"
        type="search"
        placeholder={placeholder}
        aria-label={label}
        autoComplete="off"
        autoCapitalize="none"
        spellCheck={false}
        enterKeyHint="search"
        data-search-input={legacySearch ? '' : undefined}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      <button
        type="button"
        className="panel-search-clear"
        aria-label="Limpar busca"
        title="Limpar busca"
        hidden={!value}
        data-clear-search={legacySearch ? '' : undefined}
        onClick={() => {
          onChange('');
          input.current?.focus();
        }}
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
  );
}

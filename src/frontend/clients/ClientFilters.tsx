import { useState } from 'react';
import {
  clientSituations,
  clientDuePeriods,
  readClientFilters,
} from './filters.ts';
import type { useClientFilters } from './useClientFilters.ts';

export function ClientFiltersBar({
  control,
  clientes,
  planos,
  servidores,
}: {
  control: ReturnType<typeof useClientFilters>;
  clientes: any[];
  planos: any[];
  servidores: any[];
}) {
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const { filters, change } = control;
  const options = (field: 'plano' | 'servidor', catalog: any[]) =>
    Array.from(
      new Set(
        [
          ...catalog.map((item) => item.nome),
          ...clientes.flatMap((client) => [
            client[field],
            client.adicional?.[field],
          ]),
          filters[field],
        ].filter(Boolean),
      ),
    ).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const invalidRange =
    filters.vencimento === 'periodo' &&
    filters.de &&
    filters.ate &&
    filters.de > filters.ate;
  return (
    <section className="client-filter-panel" aria-label="Filtros de clientes">
      <div className="client-filter-grid">
        {[
          [
            'servidor',
            'Servidor',
            'Todos os servidores',
            options('servidor', servidores).map((value) => [value, value]),
          ],
          [
            'plano',
            'Plano',
            'Todos os planos',
            options('plano', planos).map((value) => [value, value]),
          ],
          ['situacao', 'Situação', 'Todas as situações', clientSituations],
          ['vencimento', 'Vencimento', 'Qualquer vencimento', clientDuePeriods],
        ].map(
          ([key, label, placeholder, items]: [
            string,
            string,
            string,
            string[][],
          ]) => (
            <label
              key={key}
              className={`client-filter-field${filters[key] ? ' is-active' : ''}`}
            >
              <span>{label}</span>
              <select
                className="input"
                name={`filtro-${key}`}
                value={filters[key]}
                onChange={(event) =>
                  change(key as keyof typeof filters, event.target.value)
                }
              >
                <option value="">{placeholder}</option>
                {items.map(([value, text]) => (
                  <option key={value} value={value}>
                    {text}
                  </option>
                ))}
              </select>
            </label>
          ),
        )}
        {filters.vencimento === 'periodo' &&
          (['de', 'ate'] as const).map((key) => (
            <label className="client-filter-field" key={key}>
              <span>
                {key === 'de' ? 'Vencimento a partir de' : 'Vencimento até'}
              </span>
              <input
                type="date"
                className="input"
                name={`filtro-${key}`}
                value={filters[key]}
                aria-invalid={Boolean(invalidRange)}
                aria-describedby={
                  invalidRange ? 'client-filter-range-error' : undefined
                }
                onChange={(event) => change(key, event.target.value)}
              />
            </label>
          ))}
      </div>
      {invalidRange && (
        <p id="client-filter-range-error" role="alert">
          A data final deve ser igual ou posterior à inicial.
        </p>
      )}
      <div className="client-filter-actions">
        <small className="muted">
          Plano e servidor incluem o segundo acesso. Situação e vencimento
          consideram o principal.
        </small>
        {control.active && (
          <button
            type="button"
            className="btn btn-ghost"
            onClick={control.clear}
          >
            Limpar filtros
          </button>
        )}
        {control.canSave && control.active && (
          <button
            type="button"
            className="btn btn-ghost"
            aria-expanded={saving}
            aria-controls="client-save-query"
            onClick={() => setSaving(!saving)}
          >
            Salvar consulta
          </button>
        )}
      </div>
      {saving && (
        <form
          id="client-save-query"
          className="client-save-query"
          onSubmit={(event) => {
            event.preventDefault();
            if (control.save(name)) {
              setSaving(false);
              setName('');
            }
          }}
        >
          <label className="client-filter-field">
            <span>Nome da consulta</span>
            <input
              className="input"
              name="nome-consulta"
              value={name}
              maxLength={60}
              required
              placeholder="Ex.: Vencidos do servidor principal"
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <button className="btn btn-primary" disabled={!name.trim()}>
            Salvar
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => setSaving(false)}
          >
            Cancelar
          </button>
          <small className="muted">
            Disponível para sua conta neste navegador.
          </small>
        </form>
      )}
      {control.saved.length > 0 && (
        <div className="client-saved-queries" aria-label="Consultas salvas">
          <span className="muted">Consultas salvas</span>
          {control.saved.map((item) => (
            <div className="client-saved-query" key={item.name}>
              <button
                className="btn btn-ghost"
                type="button"
                onClick={() => control.apply(readClientFilters(item.query))}
              >
                {item.name}
              </button>
              <button
                className="btn btn-ghost"
                type="button"
                aria-label={`Remover consulta ${item.name}`}
                onClick={() => control.remove(item.name)}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
      <p className="client-filter-notice" role="status" aria-live="polite">
        {control.notice}
      </p>
    </section>
  );
}

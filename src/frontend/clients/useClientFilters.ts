import { useEffect, useState } from 'react';
import {
  emptyClientFilters,
  readClientFilters,
  writeClientFilters,
  readSavedClientQueries,
  type ClientFilters,
  type SavedClientQuery,
} from './filters.ts';

export function useClientFilters(query?: string, storageKey?: string) {
  const [filters, setFilters] = useState(() => readClientFilters(query || ''));
  const [saved, setSaved] = useState<SavedClientQuery[]>([]);
  const [notice, setNotice] = useState('');
  useEffect(() => {
    const restore = () => setFilters(readClientFilters(window.location.search));
    restore();
    window.addEventListener('popstate', restore);
    return () => window.removeEventListener('popstate', restore);
  }, [query]);
  useEffect(() => {
    setSaved([]);
    setNotice('');
    if (!storageKey) return;
    try {
      setSaved(readSavedClientQueries(localStorage.getItem(storageKey)));
    } catch {
      setNotice('O navegador não permite acessar as consultas salvas.');
    }
  }, [storageKey]);

  function apply(next: ClientFilters) {
    const clean = readClientFilters(writeClientFilters(next));
    setFilters(clean);
    const url = new URL(window.location.href);
    url.search = writeClientFilters(clean, url.search);
    window.history.replaceState(
      window.history.state,
      '',
      url.pathname + url.search + url.hash,
    );
  }
  function change(key: keyof ClientFilters, value: string) {
    apply({ ...filters, [key]: value });
  }
  function persist(next: SavedClientQuery[]) {
    if (!storageKey) return false;
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
      setSaved(next);
      return true;
    } catch {
      setNotice(
        'Não foi possível salvar neste navegador. Seus filtros continuam aplicados.',
      );
      return false;
    }
  }
  function save(name: string) {
    const clean = name.trim().slice(0, 60);
    if (!clean) return false;
    const others = saved.filter((item) => item.name !== clean);
    if (others.length >= 20) {
      setNotice('Você já tem 20 consultas. Remova uma antes de salvar outra.');
      return false;
    }
    if (
      !persist([...others, { name: clean, query: writeClientFilters(filters) }])
    )
      return false;
    setNotice(`Consulta “${clean}” salva neste navegador.`);
    return true;
  }
  function remove(name: string) {
    if (persist(saved.filter((item) => item.name !== name)))
      setNotice(`Consulta “${name}” removida.`);
  }
  return {
    filters,
    change,
    apply,
    saved,
    save,
    remove,
    notice,
    canSave: Boolean(storageKey),
    active: Object.values(filters).some(Boolean),
    clear: () => apply({ ...emptyClientFilters }),
  };
}

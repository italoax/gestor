import { appTodayIso } from '../../services/dates.ts';
import { formatDateInput, normalizeDateInput } from '../../services/format.ts';
import { normalizeSearch } from './model.ts';

export const emptyClientFilters = {
  busca: '',
  servidor: '',
  plano: '',
  situacao: '',
  vencimento: '',
  de: '',
  ate: '',
};
export type ClientFilters = typeof emptyClientFilters;
export const clientSituations = [
  ['ativos', 'Ativos (em dia)'],
  ['vencidos', 'Vencidos'],
  ['inativos', 'Inativos'],
];
export const clientDuePeriods = [
  ['hoje', 'Vence hoje'],
  ['amanha', 'Vence amanhã'],
  ['ontem', 'Venceu ontem'],
  ['atrasados-7', 'Vencidos há mais de 7 dias'],
  ['periodo', 'Escolher período'],
];

export function readClientFilters(query: string): ClientFilters {
  const params = new URLSearchParams(query);
  const filters = { ...emptyClientFilters };
  for (const key of ['busca', 'servidor', 'plano'] as const)
    filters[key] = (params.get(key) || '').slice(0, 200);
  for (const [key, options] of [
    ['situacao', clientSituations],
    ['vencimento', clientDuePeriods],
  ] as const) {
    const value = params.get(key) || '';
    if (options.some(([option]) => option === value)) filters[key] = value;
  }
  if (filters.vencimento === 'periodo') {
    filters.de = normalizeDateInput(params.get('de'));
    filters.ate = normalizeDateInput(params.get('ate'));
  }
  return filters;
}

export function writeClientFilters(filters: ClientFilters, query = '') {
  const params = new URLSearchParams(query);
  for (const key of Object.keys(
    emptyClientFilters,
  ) as (keyof ClientFilters)[]) {
    const value = filters[key];
    if (
      value &&
      (!['de', 'ate'].includes(key) || filters.vencimento === 'periodo')
    )
      params.set(key, value);
    else params.delete(key);
  }
  return params.toString();
}

export function matchesClientFilters(
  client: any,
  filters: ClientFilters,
  today: string,
) {
  const term = normalizeSearch(filters.busca);
  if (
    term &&
    !normalizeSearch(
      [
        client.nome,
        client.user,
        client.telefone,
        client.email,
        client.plano,
        client.adicional?.plano,
        client.adicional?.servidor,
        client.servidor,
        client.aplicativo,
        client.adicional?.aplicativo,
        client.idPainel,
      ]
        .filter(Boolean)
        .join(' '),
    ).includes(term)
  )
    return false;

  // Plano e servidor precisam pertencer ao mesmo acesso.
  if (
    ![client, client.adicional]
      .filter(Boolean)
      .some(
        (access) =>
          (!filters.servidor || access.servidor === filters.servidor) &&
          (!filters.plano || access.plano === filters.plano),
      )
  )
    return false;

  const due = normalizeDateInput(formatDateInput(client.vencimento));
  const active = normalizeSearch(client.status) === 'ativo';
  if (filters.situacao === 'ativos' && !(active && due && due >= today))
    return false;
  if (filters.situacao === 'vencidos' && !(active && due && due < today))
    return false;
  if (
    filters.situacao === 'inativos' &&
    normalizeSearch(client.status) !== 'inativo'
  )
    return false;
  if (!filters.vencimento) return true;
  if (!due) return false;
  const days = Math.round((Date.parse(due) - Date.parse(today)) / 86400000);
  switch (filters.vencimento) {
    case 'hoje':
      return days === 0;
    case 'amanha':
      return days === 1;
    case 'ontem':
      return days === -1;
    case 'atrasados-7':
      return active && days < -7;
    case 'periodo':
      return (
        (!filters.de || due >= filters.de) &&
        (!filters.ate || due <= filters.ate)
      );
    default:
      return true;
  }
}

export function clientFilterToday(now: Date) {
  return appTodayIso(now);
}

export type SavedClientQuery = { name: string; query: string };
export function readSavedClientQueries(
  value: string | null,
): SavedClientQuery[] {
  try {
    const items = JSON.parse(value || '[]');
    if (!Array.isArray(items)) return [];
    return items
      .filter(
        (item) =>
          item &&
          typeof item.name === 'string' &&
          item.name.trim() &&
          item.name.length <= 60 &&
          typeof item.query === 'string' &&
          item.query.length <= 2000,
      )
      .slice(0, 20)
      .map((item) => ({
        name: item.name.trim(),
        query: writeClientFilters(readClientFilters(item.query)),
      }));
  } catch {
    return [];
  }
}

export const AUTOMATION_HISTORY_PAGE_SIZE = 10;
export const AUTOMATION_HISTORY_PAGE_SIZES = [10, 50, 100] as const;

function historyPageSize(value: unknown) {
  const size = Number(value);
  return AUTOMATION_HISTORY_PAGE_SIZES.some((option) => option === size)
    ? size
    : AUTOMATION_HISTORY_PAGE_SIZE;
}

export interface AutomationServerGroup {
  servidor: string;
  clientes: string[];
}

export function groupHistoryClients(value: unknown): AutomationServerGroup[] {
  const clients = typeof value === 'string' ? JSON.parse(value) : value;
  if (!Array.isArray(clients)) return [];
  const groups = new Map<string, string[]>();
  for (const client of clients) {
    const server = String(client.servidor || '').trim() || 'Acesso removido';
    const name = String(client.nome || '').trim() || 'Cliente removido';
    const names = groups.get(server) || [];
    names.push(name);
    groups.set(server, names);
  }
  return [...groups]
    .sort(([a], [b]) => a.localeCompare(b, 'pt-BR'))
    .map(([servidor, clientes]) => ({
      servidor,
      clientes: clientes.sort((a, b) => a.localeCompare(b, 'pt-BR')),
    }));
}

export interface AutomationHistory {
  dataLimite: string;
  pagina: number;
  porPagina: number;
  temMais: boolean;
  anteriorUrl: string | null;
  proximaUrl: string | null;
}

export function automationHistoryUrl(
  page = 1,
  pageSize = AUTOMATION_HISTORY_PAGE_SIZE,
) {
  const params = new URLSearchParams({ aba: 'disparos' });
  if (page > 1) params.set('pagina', String(page));
  const size = historyPageSize(pageSize);
  if (size !== AUTOMATION_HISTORY_PAGE_SIZE)
    params.set('porPagina', String(size));
  return `/automacao?${params}`;
}

export function automationHistoryCutoff(today: string) {
  const [year, month, day] = today.split('-').map(Number);
  const start = new Date(Date.UTC(year, month - 4, 1));
  const lastDay = new Date(
    Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0),
  ).getUTCDate();
  start.setUTCDate(Math.min(day, lastDay));
  return start.toISOString().slice(0, 10);
}

export function automationHistoryWindow(
  today: string,
  query: Record<string, unknown> = {},
) {
  const rawPage = Number(query.pagina);
  const pagina = Number.isFinite(rawPage)
    ? Math.max(1, Math.min(100000, Math.floor(rawPage)))
    : 1;
  const porPagina = historyPageSize(query.porPagina);
  return {
    dataLimite: automationHistoryCutoff(today),
    pagina,
    porPagina,
    offset: (pagina - 1) * porPagina,
  };
}

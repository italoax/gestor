export const TRANSACTIONS_PAGE_SIZES = [10, 50, 100] as const;

export interface TransactionsPagination {
  pagina: number;
  porPagina: number;
  temMais: boolean;
  anteriorUrl: string | null;
  proximaUrl: string | null;
}

export function transactionsFilters(query: Record<string, unknown> = {}) {
  return {
    busca:
      typeof query.busca === 'string' ? query.busca.trim().slice(0, 160) : '',
    pagamento:
      typeof query.pagamento === 'string'
        ? query.pagamento.trim().slice(0, 80)
        : '',
  };
}

export function transactionSearchPattern(search: string) {
  return `%${search.replace(/[=%_]/g, (char) => `=${char}`)}%`;
}

export function transactionsPageWindow(query: Record<string, unknown> = {}) {
  const requestedPage = Number(query.pagina);
  const pagina = Number.isFinite(requestedPage)
    ? Math.max(1, Math.min(100000, Math.floor(requestedPage)))
    : 1;
  const requestedSize = Number(query.porPagina);
  const porPagina = TRANSACTIONS_PAGE_SIZES.some(
    (size) => size === requestedSize,
  )
    ? requestedSize
    : 10;
  return { pagina, porPagina, offset: (pagina - 1) * porPagina };
}

export function transactionsPageUrl(
  page = 1,
  pageSize = 10,
  filters: Record<string, unknown> = {},
) {
  const { pagina, porPagina } = transactionsPageWindow({
    pagina: page,
    porPagina: pageSize,
  });
  const params = new URLSearchParams();
  if (pagina > 1) params.set('pagina', String(pagina));
  if (porPagina !== 10) params.set('porPagina', String(porPagina));
  const { busca, pagamento } = transactionsFilters(filters);
  if (busca) params.set('busca', busca);
  if (pagamento) params.set('pagamento', pagamento);
  return `/transacoes${params.size ? `?${params}` : ''}`;
}

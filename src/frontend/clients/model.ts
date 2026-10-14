import { formatDateInput, statusUrgency } from '../../services/format.ts';

export function normalizeSearch(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function sortClients(clientes, sort, now) {
  const original = clientes
    .slice()
    .sort(
      (a, b) =>
        statusUrgency(b.status, b.vencimento, now) -
        statusUrgency(a.status, a.vencimento, now),
    );
  if (!sort.direction) return original;
  const value = (c) => {
    if (sort.column === 'valor')
      return Number(c.valor || 0) + Number(c.adicional?.valor || 0);
    if (sort.column === 'status')
      return statusUrgency(c.status, c.vencimento, now);
    if (sort.column === 'vencimento') return formatDateInput(c.vencimento);
    return normalizeSearch(
      c[sort.column === 'whatsapp' ? 'telefone' : sort.column],
    );
  };
  return original.sort((a, b) => {
    const av = value(a),
      bv = value(b);
    const comparison =
      typeof av === 'number'
        ? av - Number(bv)
        : av.localeCompare(String(bv), 'pt-BR', {
            numeric: true,
            sensitivity: 'base',
          });
    return comparison * (sort.direction === 'desc' ? -1 : 1);
  });
}

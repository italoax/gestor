export function utcTimestamp(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date && !Number.isFinite(value.getTime())) return null;
  const text =
    value instanceof Date
      ? value.toISOString()
      : String(value).trim().replace(' ', 'T');
  const date = new Date(
    /(?:Z|[+-]\d{2}:?\d{2})$/i.test(text) ? text : text + 'Z',
  );
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

export function displayTimestamp(value: unknown) {
  const iso = utcTimestamp(value);
  return iso
    ? new Intl.DateTimeFormat('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        dateStyle: 'short',
        timeStyle: 'short',
      }).format(new Date(iso))
    : 'Data não informada';
}

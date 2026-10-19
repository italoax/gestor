// Use only details explicitly saved with the transaction. Current plan prices
// and screen counts can change and must not rewrite a historical renewal.
export function transactionDetails(item: { descricao?: unknown }) {
  const description = String(item.descricao || '');
  const duration = description.match(/\b\d+\s+(?:mês|meses|dias?|anos?)\b/iu);
  const codes = description.match(/\b(\d+)\s+c[oó]digos?\b/iu);
  return {
    duracao: duration?.[0] || null,
    codigos: codes && Number(codes[1]) > 0 ? Number(codes[1]) : null,
  };
}

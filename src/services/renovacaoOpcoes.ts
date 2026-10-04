export interface PlanoRenovacao { periodo: number; tipo: string | null; creditoGastos?: number; }

export function opcoesRenovacao(plano: PlanoRenovacao | null, valor: number) {
  const periodo = Math.max(1, Number(plano?.periodo) || 30);
  const emMeses = /^mes/.test(String(plano?.tipo || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase());
  const meses = emMeses ? periodo : (periodo % 30 === 0 ? periodo / 30 : 0);
  const limite = meses ? Math.max(1, Math.floor(12 / meses)) : 12;
  return Array.from({ length: limite }, (_, i) => {
    const periodos = i + 1;
    const quantidade = (meses || periodo) * periodos;
    return { periodos, label: `${quantidade} ${meses ? (quantidade === 1 ? 'mês' : 'meses') : (quantidade === 1 ? 'dia' : 'dias')}`, valor: Math.round(Number(valor) * 100) * periodos / 100 };
  });
}

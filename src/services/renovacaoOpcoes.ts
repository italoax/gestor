export interface PlanoRenovacao { periodo: number; tipo: string | null; creditoGastos?: number; }

export interface PlanoAdicional {
  id: string; plano: string; servidor: string; valor: number; vencimento: string;
  telas: number; user: string; idPainel: string; aplicativo?: string; dispositivo?: string;
}
export interface ItemRenovacao extends PlanoRenovacao {
  chave: string; plano: string; servidor: string; valor: number; telas: number;
  vencimento: string; user: string; idPainel: string;
}
export interface RenovacaoConjunta { versao: 1; itens: ItemRenovacao[]; }

export function lerPlanoAdicional(value: unknown): PlanoAdicional | null {
  if (!value) return null;
  return typeof value === 'string' ? JSON.parse(value) : value as PlanoAdicional;
}

// O catálogo e os preços vêm do cadastro, nunca do valor enviado pelo navegador.
export async function escolhasRenovacao(cliente: Record<string, any>, buscarPlano: (nome: string) => Promise<PlanoRenovacao | null>) {
  const principal = await buscarPlano(cliente.plano);
  const adicional = lerPlanoAdicional(cliente.plano_adicional);
  if (!adicional) return [{ selecao: 'principal', label: cliente.plano || 'Plano',
    opcoes: opcoesRenovacao(principal, Number(cliente.valor)),
    dados: principal || { periodo: 30, tipo: 'Dias', creditoGastos: 1 } }];
  const segundo = await buscarPlano(adicional.plano);
  if (!principal || !segundo) throw new Error('Um dos planos não está mais no catálogo. Atualize o cadastro do cliente.');
  const itens: ItemRenovacao[] = [
    { ...principal, chave: 'principal', plano: cliente.plano, servidor: cliente.servidor, valor: Number(cliente.valor),
      vencimento: String(cliente.vencimento).slice(0, 10), telas: Number(cliente.telas), user: cliente.user || '', idPainel: cliente.sigma_customer_id || '' },
    { ...segundo, ...adicional, chave: adicional.id },
  ];
  const grupo = (selecao: string, label: string, selecionados: ItemRenovacao[]) => {
    const opcoesPorItem = selecionados.map(item => opcoesRenovacao(item, item.valor));
    const limite = Math.min(...opcoesPorItem.map(opcoes => opcoes.length));
    return { selecao, label, dados: { versao: 1 as const, itens: selecionados },
      opcoes: Array.from({ length: limite }, (_, i) => ({ periodos: i + 1,
        label: selecionados.length === 1 ? opcoesPorItem[0][i].label : selecionados.map((item, j) => `${item.servidor}: ${opcoesPorItem[j][i].label}`).join(' + '),
        valor: opcoesPorItem.reduce((total, opcoes) => total + Math.round(opcoes[i].valor * 100), 0) / 100,
      })) };
  };
  return [grupo('ambos', 'Renovar os dois servidores', itens), grupo('principal', `${itens[0].servidor} — ${itens[0].plano}`, [itens[0]]), grupo('adicional', `${itens[1].servidor} — ${itens[1].plano}`, [itens[1]])];
}

export function novoVencimentoPlano(vencimento: string, hoje: string, plano: PlanoRenovacao, periodos: number) {
  const [ano, mes, dia] = (vencimento > hoje ? vencimento : hoje).slice(0, 10).split('-').map(Number);
  const base = new Date(Date.UTC(ano, mes - 1, dia));
  const quantidade = plano.periodo * periodos;
  if (/^mes/.test(String(plano.tipo).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase())) {
    base.setUTCDate(1);
    base.setUTCMonth(base.getUTCMonth() + quantidade);
    const ultimo = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, 0)).getUTCDate();
    base.setUTCDate(Math.min(dia, ultimo));
  } else base.setUTCDate(base.getUTCDate() + quantidade);
  return base.toISOString().slice(0, 10);
}

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

import { lerPlanoAdicional } from './renovacaoOpcoes.js';
export function resumirAcessos(clientes, hoje) {
  let comDois = 0,
    ativos = 0,
    vencidos = 0,
    inativos = 0;
  const servidores = new Map();
  const adicionar = (servidor, vencimento, status) => {
    const nome = servidor.trim() || 'Sem servidor';
    const item = servidores.get(nome) ?? {
      nome,
      total: 0,
      ativos: 0,
      vencidos: 0,
      inativos: 0,
    };
    item.total++;
    if (status !== 'Ativo') {
      item.inativos++;
      inativos++;
    } else if (String(vencimento).slice(0, 10) < hoje) {
      item.vencidos++;
      vencidos++;
    } else {
      item.ativos++;
      ativos++;
    }
    servidores.set(nome, item);
  };
  for (const cliente of clientes) {
    adicionar(cliente.servidor, cliente.vencimento, cliente.status);
    const adicional = lerPlanoAdicional(cliente.plano_adicional);
    if (adicional) {
      comDois++;
      adicionar(adicional.servidor, adicional.vencimento, cliente.status);
    }
  }
  return {
    clientes: clientes.length,
    comUm: clientes.length - comDois,
    comDois,
    total: clientes.length + comDois,
    ativos,
    vencidos,
    inativos,
    servidores: [...servidores.values()].sort(
      (a, b) => b.total - a.total || a.nome.localeCompare(b.nome),
    ),
  };
}

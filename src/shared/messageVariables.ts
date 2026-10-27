// Uma opção por função. Nomes antigos são aceitos apenas por compatibilidade.
export const messageVariables = [
  {
    name: 'saudacao',
    label: 'Saudação',
    group: 'Cliente',
    description: 'Bom dia, boa tarde ou boa noite, conforme o horário.',
  },
  {
    name: 'nome',
    label: 'Nome completo',
    group: 'Cliente',
    description: 'Nome completo do cliente.',
  },
  {
    name: 'primeiro_nome',
    label: 'Primeiro nome',
    group: 'Cliente',
    description: 'Apenas o primeiro nome do cliente.',
  },
  {
    name: 'usuario',
    label: 'Usuário do acesso',
    group: 'Cliente',
    description: 'Usuário utilizado para acessar o serviço.',
  },
  {
    name: 'senha',
    label: 'Senha do acesso',
    group: 'Cliente',
    description: 'Senha de acesso ao serviço.',
  },
  {
    name: 'plano',
    label: 'Plano',
    group: 'Assinatura',
    description: 'Nome do plano contratado.',
  },
  {
    name: 'vencimento',
    label: 'Vencimento',
    group: 'Assinatura',
    description:
      'Considera os dois acessos: mostra a data do acesso cobrado ou a data comum quando vencem juntos.',
  },
  {
    name: 'valor',
    label: 'Valor da cobrança',
    group: 'Assinatura',
    description: 'Valor da cobrança, formatado em reais.',
  },
  {
    name: 'servidor',
    label: 'Servidor',
    group: 'Assinatura',
    description: 'Nome do servidor do acesso.',
  },
  {
    name: 'resumo_acessos',
    label: 'Resumo dos acessos cobrados',
    group: 'Assinatura',
    description: 'Resumo dos acessos incluídos na cobrança.',
  },
  {
    name: 'link_cliente',
    label: 'Link para renovar com Pix',
    group: 'Pagamentos',
    description: 'Link individual para o cliente renovar com Pix.',
  },
  {
    name: 'pix',
    label: 'Somente a chave Pix',
    group: 'Pagamentos',
    description: 'Somente a chave Pix cadastrada em Minha conta.',
  },
  {
    name: 'pix_bloco',
    label: 'Nome e chave Pix em texto',
    group: 'Pagamentos',
    description: 'Bloco de texto com o recebedor e a chave Pix.',
  },
  {
    name: 'cobranca_pix',
    label: 'Cobrança Pix com o valor do cliente',
    group: 'Pagamentos',
    description:
      'Envia uma cobrança Pix com o valor do cliente. Use sem anexo.',
  },
] as const;

const aliases: Record<string, string> = {
  nome_completo: 'nome',
  cliente: 'nome',
  user: 'usuario',
  link_pagamento: 'link_cliente',
  pagamento: 'link_cliente',
  link: 'link_cliente',
  url_renovacao: 'link_cliente',
  chave_pix: 'pix',
};
const availableNames = new Set<string>(
  messageVariables.map(({ name }) => name),
);

export function messageVariableName(value: string) {
  const name = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
  return Object.hasOwn(aliases, name) ? aliases[name] : name;
}

export function normalizeMessageVariables(value: unknown) {
  return String(value ?? '').replace(
    /\{([^}]+)\}/g,
    (original, key: string) => {
      const name = messageVariableName(key);
      return availableNames.has(name) ? `{${name}}` : original;
    },
  );
}

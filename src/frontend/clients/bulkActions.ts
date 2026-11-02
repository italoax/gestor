import { formatDateBr, statusByVencimento } from '../../services/format.ts';
import { normalizeSearch } from './model.ts';

export function reviewMessageRecipients(clients: any[], archived = false) {
  const eligible = [],
    excluded = [];
  for (const client of clients) {
    const digits = String(client.telefone || '').replace(/\D/g, '');
    const reason =
      archived || Boolean(Number(client.arquivado))
        ? 'Cliente arquivado'
        : normalizeSearch(client.status) !== 'ativo'
          ? 'Cliente inativo'
          : digits.length < 10 || digits.length > 15
            ? 'WhatsApp ausente ou inválido'
            : '';
    if (reason) excluded.push({ client, reason });
    else eligible.push(client);
  }
  return { eligible, excluded };
}

// Aspas protegem separadores e quebras de linha; o apóstrofo impede que dados
// de texto sejam interpretados como fórmulas ao abrir a planilha.
export function csvCell(value: unknown): string {
  let text = String(value ?? '');
  if (
    typeof value !== 'number' &&
    (/^[\s\u0000-\u001f]*[=+\-@]/.test(text) || /^[\t\r\n]/.test(text))
  )
    text = "'" + text;
  return '"' + text.replace(/"/g, '""') + '"';
}

export function clientExportRows(clients: any[], now: Date, archived = false) {
  return clients.flatMap((client) =>
    [
      { access: client, label: 'Principal' },
      ...(client.adicional
        ? [{ access: client.adicional, label: 'Adicional' }]
        : []),
    ].map(({ access, label }) => [
      client.id,
      client.nome,
      client.telefone,
      client.email,
      label,
      access.plano,
      access.servidor,
      Number.isFinite(Number(access.valor))
        ? Number(access.valor).toFixed(2).replace('.', ',')
        : '',
      Number.isFinite(Number(access.telas)) ? Number(access.telas) : '',
      access.aplicativo,
      formatDateBr(access.vencimento),
      statusByVencimento(client.status, access.vencimento, now).label,
      archived || Boolean(Number(client.arquivado)) ? 'Sim' : 'Não',
    ]),
  );
}

export function clientsCsv(clients: any[], now: Date, archived = false) {
  const headers = [
    'ID',
    'Cliente',
    'WhatsApp',
    'Email',
    'Acesso',
    'Plano',
    'Servidor',
    'Valor (R$)',
    'Telas',
    'Aplicativo',
    'Vencimento',
    'Situação',
    'Arquivado',
  ];
  return (
    '\uFEFF' +
    [headers, ...clientExportRows(clients, now, archived)]
      .map((row) => row.map(csvCell).join(';'))
      .join('\r\n') +
    '\r\n'
  );
}

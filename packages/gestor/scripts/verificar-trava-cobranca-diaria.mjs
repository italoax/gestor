import { readFileSync } from 'node:fs';

const cron = readFileSync('src/services/cobrancasCron.ts', 'utf8');
const routes = readFileSync('src/routes/cobrancas.ts', 'utf8');

const checks = [
  ['tabela de log diário existe no cron', cron.includes('CREATE TABLE IF NOT EXISTS cobrancas_envios')],
  ['índice único por cobrança/cliente/data existe', cron.includes('UNIQUE KEY uq_cobranca_cliente_data')],
  ['cron reserva envio antes de mandar', cron.includes('reservarEnvioCobranca(cobranca.id, cliente.id')],
  ['cron finaliza envio depois de mandar', cron.includes('finalizarEnvioCobranca(reservaId')],
  ['rota manual usa a mesma reserva diária', routes.includes('reservarEnvioCobranca(cobranca.id, cliente.id')],
  ['rota manual finaliza envio depois de mandar', routes.includes('finalizarEnvioCobranca(reservaId')],
  ['helpers de trava são exportados', cron.includes('export async function reservarEnvioCobranca') && cron.includes('export async function finalizarEnvioCobranca')],
];

const failed = checks.filter(([, ok]) => !ok);
if (failed.length) {
  console.error('FALHOU: trava diária ainda incompleta');
  for (const [name] of failed) console.error(`- ${name}`);
  process.exit(1);
}

console.log('OK: trava diária por cobrança/cliente/data encontrada.');

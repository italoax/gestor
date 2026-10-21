import { readFileSync } from 'node:fs';
import { probeMysqlTls } from '../lib/mysql-tls-probe.mts';

// Independent CLI: never reads .env, passwords, app configuration or SQL pools.
const args = process.argv.slice(2);
function value(name: string) {
  return args[args.indexOf(name) + 1];
}
try {
  const valid = new Set(['--host', '--port', '--ca-file', '--approve-network']);
  for (let index = 0; index < args.length; index++) {
    const name = args[index];
    if (!valid.has(name)) throw new Error('Argumento desconhecido.');
    if (
      name !== '--approve-network' &&
      (!args[++index] || args[index].startsWith('--'))
    )
      throw new Error('Argumento sem valor.');
  }
  if (!args.includes('--approve-network') || !args.includes('--host'))
    throw new Error(
      'Use --host HOST_AUTORIZADO --approve-network; nenhuma credencial e necessaria.',
    );
  const report = await probeMysqlTls({
    host: value('--host'),
    port: args.includes('--port') ? Number(value('--port')) : 3306,
    ca: args.includes('--ca-file')
      ? readFileSync(value('--ca-file'), 'utf8')
      : undefined,
  });
  console.log(
    JSON.stringify({ checkedAt: new Date().toISOString(), ...report }, null, 2),
  );
  process.exitCode = report.serverVerified ? 0 : 2;
} catch {
  console.error(
    'Diagnostico nao executado/concluido. Confira os argumentos e o arquivo CA autorizado.',
  );
  process.exitCode = 1;
}

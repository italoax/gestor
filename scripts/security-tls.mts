import tls from 'node:tls';
import { publicHttpsUrl, publicLookup } from '../src/services/publicNetwork.ts';
async function main() {
  const i = process.argv.indexOf('--url');
  if (i < 0 || !process.argv[i + 1])
    throw new Error(
      'Informe --url https://seu-dominio para uma verificação TLS somente de leitura.',
    );
  const target = publicHttpsUrl(process.argv[i + 1]);
  await new Promise<void>((resolve, reject) => {
    const socket = tls.connect(
      {
        host: target.hostname,
        servername: target.hostname,
        port: 443,
        rejectUnauthorized: true,
        lookup: publicLookup,
      },
      () => {
        const certificate = socket.getPeerCertificate();
        console.log(
          JSON.stringify({
            hostname: target.hostname,
            authorized: socket.authorized,
            protocol: socket.getProtocol(),
            validFrom: certificate.valid_from,
            validTo: certificate.valid_to,
          }),
        );
        socket.end();
        resolve();
      },
    );
    socket.setTimeout(10000, () =>
      socket.destroy(new Error('Prazo da verificação TLS excedido.')),
    );
    socket.once('error', () => {
      socket.destroy();
      reject(
        new Error(
          'Não foi possível validar o certificado e a conexão TLS do domínio informado.',
        ),
      );
    });
  });
}
void main().catch((error) => {
  const code =
    typeof error?.code === 'string' && /^[A-Z0-9_]{1,40}$/.test(error.code)
      ? error.code
      : 'FAILED';
  console.error(
    JSON.stringify({
      event: 'security.command_failed',
      command: 'tls',
      code,
      message:
        'Operação não concluída. Confira o arquivo de configuração, as chaves, o estado do destino e as permissões. Nenhum segredo foi incluído neste log.',
    }),
  );
  process.exitCode = 1;
});

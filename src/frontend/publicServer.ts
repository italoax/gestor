import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http';

type Handler = (
  request: IncomingMessage,
  response: ServerResponse,
) => Promise<void> | void;

// Deve permanecer síncrono: o carregador da hospedagem exige listen() antes
// de iniciar o backend, carregar o Next ou aguardar qualquer promessa.
export function openPublicServer(port: number, hostname = '0.0.0.0') {
  let handler: Handler | undefined;
  let closing: Promise<void> | undefined;
  const server = createServer((request, response) => {
    if (!handler) {
      const navigation =
        request.method === 'GET' &&
        request.headers.accept?.includes('text/html');
      response.writeHead(503, {
        'Retry-After': '2',
        'Cache-Control': 'no-store',
        'Content-Type': navigation
          ? 'text/html; charset=utf-8'
          : 'text/plain; charset=utf-8',
      });
      response.end(
        navigation
          ? '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="refresh" content="3"><title>Iniciando o site</title></head><body><p>O site está iniciando. Esta página será atualizada automaticamente.</p></body></html>'
          : 'O site está iniciando. Tente novamente em instantes.',
      );
      return;
    }
    void Promise.resolve()
      .then(() => handler!(request, response))
      .catch((error) => {
        console.error('Erro ao atender a requisição do site:', error);
        if (response.headersSent) response.destroy();
        else {
          response.statusCode = 500;
          response.end('Não foi possível carregar esta página.');
        }
      });
  });
  const ready = new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, hostname, () => {
      server.off('error', reject);
      resolve();
    });
  });
  // A preparação pode demorar; não deixe uma falha de bind sem observador.
  void ready.catch(() => {});
  return {
    server,
    ready,
    setHandler(next: Handler) {
      if (!closing) handler = next;
    },
    close() {
      closing ??= ready
        .catch(() => {})
        .then(
          () =>
            new Promise<void>((resolve, reject) => {
              if (!server.listening) return resolve();
              const timeout = setTimeout(
                () => server.closeAllConnections(),
                10000,
              );
              timeout.unref();
              server.close((error) => {
                clearTimeout(timeout);
                if (error) reject(error);
                else resolve();
              });
              server.closeIdleConnections();
            }),
        );
      return closing;
    },
  };
}

export type PublicListener = ReturnType<typeof openPublicServer>;

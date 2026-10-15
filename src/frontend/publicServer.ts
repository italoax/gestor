import { safeError } from '../security/safeError.ts';
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
  const pending = new Map<ServerResponse, () => void>();
  function serve(request: IncomingMessage, response: ServerResponse) {
    void Promise.resolve()
      .then(() => handler!(request, response))
      .catch((error) => {
        console.error(
          'Erro ao atender a requisição do site:',
          safeError(error),
        );
        if (response.headersSent) response.destroy();
        else {
          response.statusCode = 500;
          response.end('Não foi possível carregar esta página.');
        }
      });
  }
  const server = createServer((request, response) => {
    if (closing) return response.destroy();
    if (handler) return serve(request, response);
    // A primeira navegação recebe o site quando o Next estiver pronto.
    const resume = () => {
      pending.delete(response);
      if (!response.destroyed) serve(request, response);
    };
    pending.set(response, resume);
    response.once('close', () => {
      pending.delete(response);
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
      if (!closing) {
        handler = next;
        for (const resume of pending.values()) resume();
      }
    },
    close() {
      for (const response of pending.keys()) response.destroy();
      pending.clear();
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

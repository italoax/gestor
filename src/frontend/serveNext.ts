import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http';
import { createRequire } from 'node:module';
import path from 'node:path';
import { projectRoot } from '../config/paths.ts';

export interface NextFrontendOptions {
  port: number;
  hostname?: string;
  backendUrl: string;
}

interface NextApplication {
  prepare(): Promise<void>;
  close(): Promise<void>;
  getRequestHandler(): (
    request: IncomingMessage,
    response: ServerResponse,
  ) => Promise<void>;
}
type CreateNext = (options: {
  dev: boolean;
  dir: string;
  hostname: string;
  port: number;
  customServer: boolean;
}) => NextApplication;

// A escuta HTTP precisa ocorrer no processo carregado pelo LiteSpeed para que
// sua substituição de server.listen() conecte o site ao socket da hospedagem.
export async function startNextFrontend({
  port,
  hostname = '0.0.0.0',
  backendUrl,
}: NextFrontendOptions) {
  process.env.NEXT_BACKEND_URL = backendUrl;
  const next: CreateNext = createRequire(import.meta.url)('next');
  const app = next({
    dev: false,
    dir: path.join(projectRoot, 'web'),
    hostname,
    port,
    customServer: true,
  });
  try {
    await app.prepare();
  } catch (error) {
    await app.close().catch(() => {});
    throw error;
  }
  const handle = app.getRequestHandler();
  const server = createServer((request, response) => {
    void handle(request, response).catch((error) => {
      console.error('Erro ao atender a requisição do site:', error);
      if (response.headersSent) response.destroy();
      else {
        response.statusCode = 500;
        response.end('Não foi possível carregar esta página.');
      }
    });
  });
  try {
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, hostname, () => {
        server.off('error', reject);
        resolve();
      });
    });
  } catch (error) {
    await app.close();
    throw error;
  }
  let closing: Promise<void> | undefined;
  const close = () => {
    closing ??= new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => server.closeAllConnections(), 10000);
      timeout.unref();
      server.close((error) => {
        clearTimeout(timeout);
        if (error) reject(error);
        else resolve();
      });
      server.closeIdleConnections();
    }).finally(() => app.close());
    return closing;
  };
  return { server, close };
}

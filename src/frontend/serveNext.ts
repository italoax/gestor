import { type IncomingMessage, type ServerResponse } from 'node:http';
import { createRequire } from 'node:module';
import path from 'node:path';
import { projectRoot } from '../config/paths.ts';
import { openPublicServer, type PublicListener } from './publicServer.ts';

export interface NextFrontendOptions {
  port: number;
  hostname?: string;
  backendUrl: string;
  listener?: PublicListener;
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
  listener = openPublicServer(port, hostname),
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
    await listener.ready;
    await app.prepare();
  } catch (error) {
    await listener.close();
    await app.close().catch(() => {});
    throw error;
  }
  listener.setHandler(app.getRequestHandler());
  let closing: Promise<void> | undefined;
  const close = () => {
    closing ??= listener.close().finally(() => app.close());
    return closing;
  };
  return { server: listener.server, close };
}

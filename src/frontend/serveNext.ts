import { type IncomingMessage, type ServerResponse } from 'node:http';
import { createRequire } from 'node:module';
import path from 'node:path';
import { projectRoot } from '../config/paths.ts';
import { openPublicServer, type PublicListener } from './publicServer.ts';
import { proxyBackend } from './backendTransport.ts';
import { isSitePage, isUnknownPageNavigation } from './pageRoutes.ts';
import {
  normalizePublicOrigin,
  trustedProxyAddresses,
} from '../security/proxyTrust.ts';

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
  const require = createRequire(import.meta.url);
  require('@next/env').updateInitialEnv({
    NEXT_BACKEND_URL: backendUrl,
    BACKEND_SOCKET: process.env.BACKEND_SOCKET,
  });
  const next: CreateNext = require('next');
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
  const handle = app.getRequestHandler();
  const trustedProxies = trustedProxyAddresses(
    process.env.TRUSTED_PROXY_CIDRS || 'loopback',
  );
  listener.setHandler((request, response) => {
    normalizePublicOrigin(
      request,
      trustedProxies,
      process.env.SESSION_SECRET,
      process.env.BACKEND_SOCKET
        ? new URL(process.env.APP_URL || backendUrl).protocol.slice(0, -1)
        : undefined,
    );
    const url = new URL(request.url || '/', 'http://gestor.local');
    if (
      process.env.NODE_ENV === 'production' &&
      process.env.ENFORCE_HTTPS === 'true' &&
      request.headers['x-forwarded-proto'] !== 'https'
    ) {
      const secure = new URL(process.env.APP_URL || '');
      if (secure.protocol !== 'https:')
        throw new Error('APP_URL HTTPS é obrigatória para redirecionar.');
      secure.pathname = url.pathname;
      secure.search = url.search;
      response.writeHead(308, {
        Location: secure.href,
        'Cache-Control': 'no-store',
      });
      response.end();
      return;
    }
    if (
      isUnknownPageNavigation(
        url.pathname,
        request.method || 'GET',
        request.headers.accept || '',
      )
    ) {
      response.writeHead(307, { Location: '/', 'Cache-Control': 'no-store' });
      response.end();
      return;
    }
    if (
      process.env.BACKEND_SOCKET &&
      !url.pathname.startsWith('/_next/') &&
      (!isSitePage(url.pathname) ||
        request.headers.accept?.includes('application/json') ||
        !['GET', 'HEAD'].includes(request.method || 'GET') ||
        (url.pathname === '/login' && url.searchParams.has('session_check')) ||
        (url.pathname === '/area-cliente/login' &&
          url.searchParams.has('acesso')))
    )
      return proxyBackend(
        request,
        response,
        backendUrl,
        process.env.BACKEND_SOCKET,
      );
    return handle(request, response);
  });
  let closing: Promise<void> | undefined;
  const close = () => {
    closing ??= listener.close().finally(() => app.close());
    return closing;
  };
  return { server: listener.server, close };
}

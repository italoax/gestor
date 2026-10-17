import http from 'node:http';
import https from 'node:https';
import { setTimeout as sleep } from 'node:timers/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';

// Agentes próprios não herdam o proxy HTTP da hospedagem.
const directProxyEnv = { NODE_ENV: process.env.NODE_ENV || 'production' };
const httpAgent = new http.Agent({ keepAlive: true, proxyEnv: directProxyEnv });
const httpsAgent = new https.Agent({
  keepAlive: true,
  proxyEnv: directProxyEnv,
});

function transport(url: URL) {
  if (url.protocol === 'http:') return { client: http, agent: httpAgent };
  if (url.protocol === 'https:') return { client: https, agent: httpsAgent };
  throw new Error('Protocolo inválido para a comunicação interna.');
}

function failure(error: unknown, url: URL) {
  const code =
    (error as NodeJS.ErrnoException)?.code ||
    (error as Error)?.name ||
    'UNKNOWN';
  console.error(`Falha na comunicação interna (${code}): ${url.origin}.`);
  return new Error(`Backend interno indisponível (${code}).`, { cause: error });
}

export interface InternalRequestOptions {
  headers?: HeadersInit;
  signal?: AbortSignal;
  socketPath?: string;
  timeout?: number;
}

// Cada chamada usa a rede diretamente, sem cache ou redirecionamento automático.
function sendInternal(
  url: URL,
  options: InternalRequestOptions = {},
): Promise<Response> {
  const { client, agent } = transport(url);
  const headers = Object.fromEntries(new Headers(options.headers).entries());
  if (options.socketPath && !headers['x-forwarded-for'])
    headers['x-forwarded-for'] = '127.0.0.1';
  return new Promise((resolve, reject) => {
    const request = client.request(
      url,
      {
        agent,
        socketPath: options.socketPath,
        headers,
        signal: options.signal || AbortSignal.timeout(options.timeout || 20000),
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
        response.on('error', reject);
        response.on('end', () => {
          const responseHeaders = new Headers();
          for (let index = 0; index < response.rawHeaders.length; index += 2)
            responseHeaders.append(
              response.rawHeaders[index],
              response.rawHeaders[index + 1],
            );
          const status = response.statusCode || 502;
          resolve(
            new Response(
              [204, 205, 304].includes(status) ? null : Buffer.concat(chunks),
              { status, headers: responseHeaders },
            ),
          );
        });
      },
    );
    request.on('error', reject);
    request.end();
  });
}

export function requestInternal(
  input: string | URL,
  options: InternalRequestOptions = {},
) {
  const url = new URL(input);
  return sendInternal(url, options).catch((error) => {
    throw failure(error, url);
  });
}

export async function requestBackend(
  input: string | URL,
  options: InternalRequestOptions = {},
) {
  const url = new URL(input);
  const settings: InternalRequestOptions = {
    ...options,
    socketPath: process.env.BACKEND_SOCKET || options.socketPath,
    signal: options.signal || AbortSignal.timeout(options.timeout || 20000),
  };
  // Durante o reload local, a porta fecha por alguns instantes. Apenas estas
  // leituras GET podem aguardar o backend; o proxy de POST nunca repete ações.
  const retryDeadline =
    performance.now() + (process.env.NODE_ENV === 'development' ? 5000 : 0);
  for (;;) {
    try {
      return await sendInternal(url, settings);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException)?.code;
      if (
        !['ECONNREFUSED', 'ECONNRESET', 'EPIPE'].includes(code) ||
        settings.signal.aborted ||
        performance.now() + 250 > retryDeadline
      )
        throw failure(error, url);
      try {
        await sleep(250, undefined, { signal: settings.signal });
      } catch (aborted) {
        throw failure(aborted, url);
      }
    }
  }
}

export function proxyBackend(
  request: IncomingMessage,
  response: ServerResponse,
  backendUrl: string,
  socketPath: string,
) {
  // Um request-target absoluto nunca pode trocar o destino interno por um host externo.
  const incoming = new URL(request.url || '/', 'http://gestor.local');
  const url = new URL(backendUrl);
  url.pathname = incoming.pathname;
  url.search = incoming.search;
  const { client, agent } = transport(url);
  const headers = { ...request.headers };
  delete headers.connection;
  delete headers['x-gestor-page'];
  delete headers['x-gestor-page-url'];
  headers['x-forwarded-for'] ||= request.socket.remoteAddress || '127.0.0.1';
  headers['x-forwarded-proto'] ||= new URL(
    process.env.APP_URL || backendUrl,
  ).protocol.slice(0, -1);
  const upstream = client.request(
    url,
    {
      method: request.method,
      headers,
      socketPath,
      agent,
      signal: AbortSignal.timeout(300000),
    },
    (result) => {
      response.writeHead(result.statusCode || 502, result.headers);
      result.on('error', () => response.destroy());
      result.pipe(response);
    },
  );
  upstream.on('error', (error) => {
    failure(error, url);
    if (response.headersSent) response.destroy();
    else {
      response.statusCode = 502;
      response.end('Não foi possível acessar o serviço. Tente novamente.');
    }
  });
  request.on('aborted', () => upstream.destroy());
  response.on('close', () => {
    if (!response.writableFinished) upstream.destroy();
  });
  request.pipe(upstream);
}

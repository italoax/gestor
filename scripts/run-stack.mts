import { spawn, type ChildProcess } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import dotenv from 'dotenv';
import { pathToFileURL } from 'node:url';
import {
  openPublicServer,
  type PublicListener,
} from '../src/frontend/publicServer.ts';
import { projectRoot } from '../src/config/paths.ts';
import { startNextFrontend } from '../src/frontend/serveNext.ts';
import { createInternalSockets } from '../src/frontend/internalSockets.ts';
import { requestInternal } from '../src/frontend/backendTransport.ts';

export async function runStack(listener?: PublicListener) {
  dotenv.config({ quiet: true });
  const root = projectRoot;
  const development = process.argv.includes('--dev');
  const sockets = development ? undefined : createInternalSockets();
  const publicPort = Number(
    process.env.FRONTEND_PORT || process.env.PORT || 3000,
  );
  // Cada processo da hospedagem recebe portas privadas próprias do sistema.
  // As portas fixas são mantidas apenas para as ferramentas de desenvolvimento.
  const backendPort = development
    ? Number(process.env.BACKEND_PORT || 3001)
    : 0;
  const workerPort = development ? Number(process.env.WORKER_PORT || 3002) : 0;
  if (development && new Set([publicPort, backendPort, workerPort]).size !== 3)
    throw new Error(
      'Use portas diferentes para a interface, backend e worker.',
    );
  let backendUrl = `http://127.0.0.1:${backendPort}`;
  const runtimeEnv: NodeJS.ProcessEnv = {
    ...process.env,
    NODE_ENV: development ? 'development' : 'production',
    APP_URL: process.env.APP_URL || `http://localhost:${publicPort}`,
    NEXT_BACKEND_URL: backendUrl,
    WORKER_URL: `http://127.0.0.1:${workerPort}`,
    WORKER_PORT: String(workerPort),
    RUN_AUTOMATIONS: 'false',
    NEXT_FRONTEND_ENABLED: 'true',
    BACKEND_SOCKET: sockets?.backend,
    WORKER_SOCKET: sockets?.worker,
  };
  if (!development)
    listener ??= openPublicServer(
      publicPort,
      process.env.FRONTEND_HOST || '0.0.0.0',
    );
  const children: ChildProcess[] = [];
  let frontend: Awaited<ReturnType<typeof startNextFrontend>> | undefined;
  let stopping = false;
  function launch(
    name: string,
    args: string[],
    extraEnv: Partial<NodeJS.ProcessEnv> = {},
  ) {
    const child = spawn(process.execPath, args, {
      cwd: root,
      env: { ...runtimeEnv, ...extraEnv },
      stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
      windowsHide: true,
    });
    children.push(child);
    child.once('error', (error) => {
      console.error(`${name}: ${error.message}`);
      void shutdown(1);
    });
    child.once('exit', (code) => {
      if (!stopping) {
        console.error(`${name} encerrou (${code}).`);
        void shutdown(code || 1);
      }
    });
    return child;
  }
  async function shutdown(code = 0) {
    if (stopping) return;
    stopping = true;
    process.exitCode = code;
    await Promise.all([
      listener
        ?.close()
        .catch((error) =>
          console.error('Erro ao encerrar a escuta pública:', error),
        ),
      frontend
        ?.close()
        .catch((error) => console.error('Erro ao encerrar o site:', error)),
      ...children.map(
        (child) =>
          new Promise<void>((resolve) => {
            if (child.exitCode !== null || child.signalCode !== null)
              return resolve();
            const timeout = setTimeout(() => {
              child.kill('SIGKILL');
              resolve();
            }, 35000);
            child.once('exit', () => {
              clearTimeout(timeout);
              resolve();
            });
            child.kill('SIGTERM');
          }),
      ),
    ]);
    sockets?.close();
  }
  process.on('SIGINT', () => void shutdown(0));
  process.on('SIGTERM', () => void shutdown(0));

  try {
    if (listener) await listener.ready;
    console.log('Inicialização: servidor público aberto; iniciando o backend.');
    if (development) {
      await import('./build-react.mts');
      await import('./build-browser.mts');
      launch('Assets TypeScript', [
        '--import',
        'tsx',
        'scripts/build-browser.mts',
        '--watch',
      ]);
    } else await import('./verify-build.mts');
    if (stopping) return;
    const backend = launch(
      'Backend',
      development
        ? [
            'node_modules/tsx/dist/cli.mjs',
            'watch',
            '--tsconfig',
            'backend/tsconfig.json',
            'backend/src/main.ts',
          ]
        : ['dist/runtime/backend/src/main.js'],
      { PORT: String(backendPort), HOST: '127.0.0.1' },
    );
    if (!development) {
      const endpoint = await waitForEndpoint(backend, 'Backend');
      const port = endpoint?.port;
      if ((!port && !endpoint?.socketPath) || stopping) {
        await shutdown(1);
        return;
      }
      backendUrl = endpoint.socketPath
        ? 'http://127.0.0.1'
        : 'http://127.0.0.1:' + port;
      runtimeEnv.BACKEND_SOCKET = endpoint.socketPath;
      const probe = await requestInternal(new URL('/favicon.svg', backendUrl), {
        socketPath: endpoint.socketPath,
        timeout: 5000,
      });
      await probe.body?.cancel();
      runtimeEnv.NEXT_BACKEND_URL = backendUrl;
      console.log(
        endpoint.socketPath
          ? 'Inicialização: backend confirmou o canal interno.'
          : `Inicialização: backend confirmou a escuta em ${backendUrl}.`,
      );
    }
    // Em produção, o aviso do filho ocorre após initialize(), bootstrap e listen().
    // A consulta de saúde ao MySQL não deve impedir a preparação do Next.js.
    let ready = !development;
    for (let attempt = 0; development && attempt < 30 && !stopping; attempt++) {
      try {
        const response = await fetch(`${backendUrl}/healthz`, {
          signal: AbortSignal.timeout(6000),
          redirect: 'error',
        });
        if (response.ok) {
          ready = true;
          break;
        }
        if (attempt === 0)
          console.error(`Saúde do backend: HTTP ${response.status}.`);
        await response.body?.cancel();
      } catch (error) {
        if (attempt === 0)
          console.error('Falha ao consultar a saúde do backend:', error);
      }
      await sleep(500);
    }
    if (!ready) {
      console.error(
        'O backend não ficou disponível. Consulte o erro de inicialização acima.',
      );
      await shutdown(1);
    } else {
      if (stopping) return;
      console.log('Inicialização: preparando a interface Next.js.');
      if (development) {
        launch('Next.js', [
          'node_modules/next/dist/bin/next',
          'dev',
          'web',
          '--hostname',
          process.env.FRONTEND_HOST || '0.0.0.0',
          '--port',
          String(publicPort),
        ]);
      } else {
        Object.assign(process.env, {
          NODE_ENV: 'production',
          APP_URL: runtimeEnv.APP_URL,
        });
        if (runtimeEnv.BACKEND_SOCKET)
          process.env.BACKEND_SOCKET = runtimeEnv.BACKEND_SOCKET;
        else delete process.env.BACKEND_SOCKET;
        const started = await startNextFrontend({
          port: publicPort,
          hostname: process.env.FRONTEND_HOST || '0.0.0.0',
          backendUrl,
          listener,
        });
        if (stopping) {
          await started.close();
          return;
        }
        frontend = started;
        console.log(
          'Inicialização: interface Next.js pronta; site disponível.',
        );
      }
      if (runtimeEnv.LOCAL_MODE !== 'true') {
        const worker = launch(
          'Worker',
          development
            ? [
                'node_modules/tsx/dist/cli.mjs',
                'watch',
                '--tsconfig',
                'backend/tsconfig.json',
                'backend/src/worker.ts',
              ]
            : ['dist/runtime/backend/src/worker.js'],
        );
        if (!development) {
          const endpoint = await waitForEndpoint(worker, 'Worker');
          const port = endpoint?.port;
          if ((!port && !endpoint?.socketPath) || stopping) {
            await shutdown(1);
            return;
          }
          await new Promise<void>((resolve, reject) =>
            backend.send(
              {
                type: 'worker-url',
                url: endpoint.socketPath
                  ? 'http://127.0.0.1'
                  : 'http://127.0.0.1:' + port,
              },
              (error) => (error ? reject(error) : resolve()),
            ),
          );
        }
      }
      if (!stopping)
        console.log(
          `Gestor: ${runtimeEnv.APP_URL} — Next.js, NestJS e worker ativos.`,
        );
    }
  } catch (error) {
    await shutdown(1);
    throw error;
  }
}

function waitForEndpoint(
  child: ChildProcess,
  name: string,
): Promise<{ port?: number; socketPath?: string } | undefined> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      console.error(
        `${name}: nenhuma porta de escuta foi informada em 60 segundos.`,
      );
      finish();
    }, 60000);
    function finish(endpoint?: { port?: number; socketPath?: string }) {
      clearTimeout(timer);
      child.off('message', onMessage);
      child.off('exit', onExit);
      child.off('error', onExit);
      resolve(endpoint);
    }
    function onExit() {
      finish();
    }
    function onMessage(message: unknown) {
      const value = message as {
        type?: string;
        port?: number;
        socketPath?: string;
      };
      if (
        value?.type === 'listening' &&
        ((Number.isInteger(value.port) && value.port! > 0) ||
          typeof value.socketPath === 'string')
      )
        finish(value);
    }
    child.on('message', onMessage);
    child.once('exit', onExit);
    child.once('error', onExit);
    if (child.exitCode !== null || child.signalCode !== null) finish();
  });
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  void runStack().catch((error) => {
    console.error('Erro ao iniciar o Gestor:', error);
    process.exit(1);
  });
}

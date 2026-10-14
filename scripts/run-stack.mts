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

export async function runStack(listener?: PublicListener) {
  dotenv.config({ quiet: true });
  const root = projectRoot;
  const development = process.argv.includes('--dev');
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
  }
  process.on('SIGINT', () => void shutdown(0));
  process.on('SIGTERM', () => void shutdown(0));

  try {
    if (listener) await listener.ready;
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
      const port = await waitForPort(backend);
      if (!port || stopping) {
        await shutdown(1);
        return;
      }
      backendUrl = 'http://127.0.0.1:' + port;
      runtimeEnv.NEXT_BACKEND_URL = backendUrl;
    }
    let ready = false;
    for (let attempt = 0; attempt < 60 && !stopping; attempt++) {
      try {
        const response = await fetch(`${backendUrl}/healthz`, {
          signal: AbortSignal.timeout(1000),
        });
        if (response.ok) {
          ready = true;
          break;
        }
      } catch {}
      await sleep(500);
    }
    if (!ready) {
      console.error(
        'O backend não ficou disponível. Consulte o erro de inicialização acima.',
      );
      await shutdown(1);
    } else {
      if (stopping) return;
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
          const port = await waitForPort(worker);
          if (!port || stopping) {
            await shutdown(1);
            return;
          }
          await new Promise<void>((resolve, reject) =>
            backend.send(
              { type: 'worker-url', url: 'http://127.0.0.1:' + port },
              (error) => (error ? reject(error) : resolve()),
            ),
          );
        }
      }
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
        try {
          Object.assign(process.env, {
            NODE_ENV: 'production',
            APP_URL: runtimeEnv.APP_URL,
          });
          const started = await startNextFrontend({
            port: publicPort,
            hostname: process.env.FRONTEND_HOST || '0.0.0.0',
            backendUrl,
            listener,
          });
          if (stopping) await started.close();
          else frontend = started;
        } catch (error) {
          console.error('Erro ao iniciar o servidor público:', error);
          await shutdown(1);
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

function waitForPort(child: ChildProcess): Promise<number | undefined> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => finish(), 60000);
    function finish(port?: number) {
      clearTimeout(timer);
      child.off('message', onMessage);
      child.off('exit', onExit);
      child.off('error', onExit);
      resolve(port);
    }
    function onExit() {
      finish();
    }
    function onMessage(message: unknown) {
      const value = message as { type?: string; port?: number };
      if (
        value?.type === 'listening' &&
        Number.isInteger(value.port) &&
        value.port! > 0
      )
        finish(value.port);
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

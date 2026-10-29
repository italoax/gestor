import { spawn, type ChildProcess } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import dotenv from 'dotenv';
import { pathToFileURL } from 'node:url';
import {
  openPublicServer,
  type PublicListener,
} from '../../src/frontend/publicServer.ts';
import { projectRoot } from '../../src/config/paths.ts';
import { startNextFrontend } from '../../src/frontend/serveNext.ts';
import { createInternalSockets } from '../../src/frontend/internalSockets.ts';
import { requestInternal } from '../../src/frontend/backendTransport.ts';
import { safeError } from '../../src/security/safeError.ts';
import {
  childProcessResources,
  currentThreadCount,
  accountProcessResources,
} from '../../src/config/processResources.ts';

export async function runStack(listener?: PublicListener) {
  const configuration = dotenv.config({
    quiet: true,
    path: process.env.GESTOR_ENV_FILE || '.env',
  });
  if (process.env.GESTOR_ENV_FILE && configuration.error)
    throw new Error(
      'Não foi possível carregar a configuração explícita do ambiente.',
    );
  const root = projectRoot;
  const explicitLocal = process.argv.includes('--local');
  const development = explicitLocal || process.argv.includes('--dev');
  if (process.argv.includes('--verbose')) process.env.LOG_VERBOSE = 'true';
  const compactLogs = development && process.env.LOG_VERBOSE !== 'true';
  // Os scripts de build também são importados neste processo.
  process.env.GESTOR_COMPACT_LOGS = compactLogs ? 'true' : 'false';
  const localMode = explicitLocal
    ? 'true'
    : (process.env.LOCAL_MODE ?? (development ? 'true' : 'false'));
  const workerEnabled =
    localMode !== 'true' && process.env.RUN_AUTOMATIONS === 'true';
  const sockets = development ? undefined : createInternalSockets();
  const publicPort = Number(
    process.env.FRONTEND_PORT || (development ? 80 : process.env.PORT || 3000),
  );
  const localUrl = new URL(`http://localhost:${publicPort}`).origin;
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
    // --local mantém a opção de sessões em memória e envios desativados.
    // O desenvolvimento normal segue a configuração usada em produção.
    LOCAL_MODE: localMode,
    COOKIE_SECURE: development ? 'false' : process.env.COOKIE_SECURE,
    FRONTEND_HOST: development ? '127.0.0.1' : process.env.FRONTEND_HOST,
    APP_URL: explicitLocal ? localUrl : process.env.APP_URL || localUrl,
    NEXT_BACKEND_URL: backendUrl,
    WORKER_PORT: String(workerPort),
    RUN_AUTOMATIONS:
      !explicitLocal && process.env.RUN_AUTOMATIONS === 'true'
        ? 'true'
        : 'false',
    NEXT_FRONTEND_ENABLED: 'true',
    BACKEND_SOCKET: sockets?.backend,
    WORKER_SOCKET: workerEnabled ? sockets?.worker : undefined,
  };
  const resources = childProcessResources(runtimeEnv);
  Object.assign(runtimeEnv, resources.env);
  // Bibliotecas nativas carregadas depois deste ponto também recebem o limite.
  process.env.RAYON_NUM_THREADS = runtimeEnv.RAYON_NUM_THREADS;
  if (!development)
    listener ??= openPublicServer(
      publicPort,
      process.env.FRONTEND_HOST || '0.0.0.0',
    );
  const children = new Set<ChildProcess>();
  let frontend: Awaited<ReturnType<typeof startNextFrontend>> | undefined;
  let stopping = false;
  let workerReady = false;
  let workerRetryTimer: NodeJS.Timeout | undefined;
  let workerRetries = 0;
  function runtimeLog(event: string, details: Record<string, unknown> = {}) {
    if (
      compactLogs &&
      !['child.error', 'fatal-error', 'worker.start-failed'].includes(event)
    )
      return;
    console.log(
      '[Runtime]',
      JSON.stringify({
        event,
        pid: process.pid,
        parentPid: process.ppid,
        uptimeSeconds: Math.round(process.uptime()),
        rssMiB: Math.round(process.memoryUsage().rss / 1048576),
        threads: currentThreadCount(),
        ...details,
      }),
    );
  }
  runtimeLog('start', { workerEnabled, childThreadLimits: resources.limits });
  // Uma leitura após estabilizar o boot; não cria processo de monitoramento.
  const resourceTimer = compactLogs
    ? undefined
    : setTimeout(() => {
        runtimeLog('resources', { account: accountProcessResources() });
      }, 30000);
  resourceTimer?.unref();
  process.once('exit', (code) => runtimeLog('exit', { code }));
  process.on('uncaughtExceptionMonitor', (error, origin) =>
    runtimeLog('fatal-error', { ...safeError(error), origin }),
  );
  function launch(
    name: string,
    args: string[],
    extraEnv: Partial<NodeJS.ProcessEnv> = {},
    options: { critical?: boolean; onFailure?: () => void } = {},
  ) {
    const child = spawn(process.execPath, [...resources.nodeArgs, ...args], {
      cwd: root,
      env: { ...runtimeEnv, ...extraEnv },
      stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
      windowsHide: true,
    });
    children.add(child);
    runtimeLog('child.started', { name, childPid: child.pid });
    let failureReported = false;
    function failed() {
      if (stopping || failureReported) return;
      failureReported = true;
      if (options.critical !== false) void shutdown(1, `child-failed:${name}`);
      else options.onFailure?.();
    }
    child.once('error', (error) => {
      runtimeLog('child.error', {
        name,
        childPid: child.pid,
        ...safeError(error),
      });
      if (!child.pid) {
        children.delete(child);
        failed();
      } else if (options.critical === false) {
        // Só agenda a substituição após o processo anterior realmente sair.
        child.kill('SIGTERM');
      } else failed();
    });
    child.once('exit', (code, signal) => {
      children.delete(child);
      runtimeLog('child.exit', {
        name,
        childPid: child.pid,
        code,
        signal,
        expected: stopping,
      });
      if (!stopping) {
        console.error(
          `${name} encerrou (PID ${child.pid}; código ${code}; sinal ${signal || 'nenhum'}).`,
        );
        failed();
      }
    });
    return child;
  }
  async function shutdown(code = 0, reason = 'shutdown') {
    if (stopping) return;
    stopping = true;
    clearTimeout(resourceTimer);
    clearTimeout(workerRetryTimer);
    runtimeLog('shutdown', { code, reason });
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
      ...[...children].map(
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
  process.on('SIGINT', () => void shutdown(0, 'SIGINT'));
  process.on('SIGTERM', () => void shutdown(0, 'SIGTERM'));

  function scheduleWorkerRetry() {
    workerReady = false;
    if (stopping || workerRetryTimer) return;
    const delay = [5000, 15000, 60000][workerRetries];
    if (delay === undefined) {
      runtimeLog('worker.unavailable', { retries: workerRetries });
      console.error(
        'Worker indisponível após 3 novas tentativas; o site continua ativo. Verifique os logs antes de reiniciar as automações.',
      );
      return;
    }
    workerRetries++;
    runtimeLog('worker.retry', { attempt: workerRetries, delayMs: delay });
    if (compactLogs)
      console.warn(
        `[Automações] Nova tentativa em ${delay / 1000}s (${workerRetries}/3).`,
      );
    workerRetryTimer = setTimeout(function retryWorker() {
      workerRetryTimer = undefined;
      void startWorker();
    }, delay);
  }
  async function startWorker() {
    if (stopping) return;
    let worker: ChildProcess | undefined;
    try {
      worker = launch(
        'Worker',
        development
          ? [
              'node_modules/tsx/dist/cli.mjs',
              'watch',
              '--tsconfig',
              'apps/api/tsconfig.json',
              'apps/api/src/worker.ts',
            ]
          : ['dist/runtime/apps/api/src/worker.js'],
        {},
        { critical: false, onFailure: scheduleWorkerRetry },
      );
      if (!development) {
        const endpoint = await waitForEndpoint(worker, 'Worker');
        if (stopping) return;
        if (!endpoint?.port && !endpoint?.socketPath) {
          if (
            worker.exitCode === null &&
            worker.signalCode === null &&
            worker.pid
          )
            worker.kill('SIGTERM');
          return;
        }
      }
      if (stopping || worker.exitCode !== null || worker.signalCode !== null)
        return;
      workerReady = true;
      runtimeLog('worker.ready', { childPid: worker.pid });
    } catch (error) {
      runtimeLog('worker.start-failed', safeError(error));
      if (worker) worker.kill('SIGTERM');
      else scheduleWorkerRetry();
    }
  }
  let backend: ChildProcess;

  try {
    if (listener) await listener.ready;
    console.log(
      compactLogs
        ? '[Gestor IXTV] Preparando arquivos e iniciando o backend...'
        : listener
          ? 'Inicialização: servidor público aberto; iniciando o backend.'
          : 'Inicialização: iniciando o backend de desenvolvimento.',
    );
    if (development) {
      await import('../build/build-react.mts');
      await import('../build/build-browser.mts');
      launch('Assets TypeScript', [
        '--import',
        'tsx',
        'scripts/build/build-browser.mts',
        '--watch',
      ]);
    } else await import('../build/verify-build.mts');
    if (stopping) return;
    backend = launch(
      'Backend',
      development
        ? [
            'node_modules/tsx/dist/cli.mjs',
            'watch',
            '--tsconfig',
            'apps/api/tsconfig.json',
            'apps/api/src/main.ts',
          ]
        : ['dist/runtime/apps/api/src/main.js'],
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
    let lastHealthError: unknown;
    // A primeira transformação do tsx e a conexão ao MySQL podem levar mais
    // de 15 segundos. Use o mesmo prazo de inicialização da produção.
    const healthDeadline = performance.now() + 60000;
    while (development && performance.now() < healthDeadline && !stopping) {
      try {
        const response = await fetch(`${backendUrl}/healthz`, {
          signal: AbortSignal.timeout(
            Math.max(
              1,
              Math.min(6000, Math.ceil(healthDeadline - performance.now())),
            ),
          ),
          redirect: 'error',
        });
        if (response.ok) {
          await response.body?.cancel();
          ready = true;
          break;
        }
        lastHealthError = new Error(
          `Saúde do backend: HTTP ${response.status}.`,
        );
        await response.body?.cancel();
      } catch (error) {
        // A porta ainda pode estar fechada enquanto o Nest inicializa.
        // Reporte a falha somente se o backend não ficar pronto no prazo.
        lastHealthError = error;
      }
      await sleep(
        Math.max(0, Math.min(500, healthDeadline - performance.now())),
      );
    }
    if (!ready) {
      if (stopping) return;
      console.error('Falha ao consultar a saúde do backend:', lastHealthError);
      console.error(
        'O backend não ficou disponível em 60 segundos. Consulte o erro de inicialização acima.',
      );
      await shutdown(1);
    } else {
      if (stopping) return;
      console.log(
        compactLogs
          ? '[Gestor IXTV] Iniciando a interface...'
          : 'Inicialização: preparando a interface Next.js.',
      );
      if (development) {
        launch('Next.js', [
          'node_modules/next/dist/bin/next',
          'dev',
          'apps/web',
          '--hostname',
          runtimeEnv.FRONTEND_HOST || '0.0.0.0',
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
      if (workerEnabled) await startWorker();
      if (!stopping && compactLogs) {
        console.log(
          `[Gestor IXTV] Acesso: ${localUrl} | Ctrl+C para encerrar.`,
        );
        if (!workerEnabled)
          console.log(
            localMode === 'true'
              ? '[Automações] Desativadas no modo local; sessões em memória.'
              : '[Automações] Desativadas na configuração.',
          );
      } else if (!stopping)
        console.log(
          !workerEnabled
            ? `Gestor IXTV: ${runtimeEnv.APP_URL} — Next.js e NestJS; automações desativadas pela configuração, worker não iniciado.`
            : workerReady
              ? `Gestor IXTV: ${runtimeEnv.APP_URL} — Next.js, NestJS e worker ativos.`
              : `Gestor IXTV: ${runtimeEnv.APP_URL} — site ativo; worker indisponível, consulte os logs.`,
        );
    }
  } catch (error) {
    await shutdown(1, 'startup-failed');
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
    console.error('Erro ao iniciar o Gestor IXTV:', error);
    process.exit(1);
  });
}

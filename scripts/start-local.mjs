import { spawn } from 'node:child_process';
import { watch } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const watchMode = process.argv.includes('--watch');
const buildOnly = process.argv.includes('--build-only');
if (buildOnly) {
  await import('./check-js.mjs');
}
if (process.argv.includes('--serve')) {
  process.chdir(projectRoot);
  process.env.LOCAL_MODE = 'false';
  process.env.NODE_ENV = process.env.NODE_ENV || 'production';
  process.env.HOST = '127.0.0.1';
  process.env.PORT = process.env.PORT || '80';
  process.env.APP_URL =
    Number(process.env.PORT) === 80
      ? 'http://localhost'
      : `http://localhost:${process.env.PORT}`;
  // O acesso local usa HTTP, mesmo com as rotinas de produção habilitadas.
  process.env.COOKIE_SECURE = 'false';

  await import(new URL('../src/server.js', import.meta.url).href);
} else {
  let server, debounce, retry;
  let building = false,
    pending = false,
    stopping = false;
  let failures = 0;
  const watchers = [];
  const waitForExit = (child) =>
    new Promise((resolve) => {
      if (!child || child.exitCode !== null || child.signalCode !== null)
        return resolve();
      child.once('exit', resolve);
    });
  async function stopServer() {
    const previous = server;
    server = undefined;
    if (!previous) return;
    const exited = waitForExit(previous);
    previous.kill('SIGTERM');
    const force = setTimeout(() => previous.kill('SIGKILL'), 35000);
    await exited;
    clearTimeout(force);
  }
  function startServer() {
    if (stopping) return;
    const child = spawn(
      process.execPath,
      ['scripts/start-local.mjs', '--serve'],
      {
        cwd: projectRoot,
        stdio: 'inherit',
        env: {
          ...process.env,
          NODE_ENV:
            process.env.NODE_ENV || (watchMode ? 'development' : 'production'),
        },
      },
    );
    server = child;
    const started = Date.now();
    child.on('error', (error) =>
      console.error('[local] Falha ao iniciar:', error.message),
    );
    child.on('exit', (code) => {
      if (server !== child || stopping) return;
      server = undefined;
      if (!watchMode) {
        process.exitCode = code ?? 1;
        return;
      }
      failures = Date.now() - started > 60000 ? 1 : failures + 1;
      const delay = Math.min(30000, failures * 5000);
      console.error(
        '[local] Servidor encerrou (' +
          code +
          '). Nova tentativa em ' +
          delay / 1000 +
          's. Confira o erro acima.',
      );
      retry = setTimeout(() => {
        if (!building && !server) startServer();
      }, delay);
    });
  }
  async function rebuild() {
    if (stopping) return;
    if (building) {
      pending = true;
      return;
    }
    building = true;
    clearTimeout(retry);
    try {
      await stopServer();
      if (!buildOnly && !stopping) startServer();
    } finally {
      building = false;
      if (pending && !stopping) {
        pending = false;
        void rebuild();
      }
    }
  }
  function changed(file, script = false) {
    if (!file || stopping) return;
    const name = String(file).replaceAll('\\', '/');
    if (script ? !name.endsWith('.mjs') : !/\.(js|json)$/.test(name)) return;
    clearTimeout(debounce);
    debounce = setTimeout(() => void rebuild(), 700);
  }
  if (watchMode) {
    watchers.push(
      watch(
        new URL('../src/', import.meta.url),
        { recursive: true },
        (_event, file) => changed(file),
      ),
    );
    watchers.push(
      watch(new URL('./', import.meta.url), (_event, file) =>
        changed(file, true),
      ),
    );
  }
  async function shutdown() {
    if (stopping) return;
    stopping = true;
    clearTimeout(debounce);
    clearTimeout(retry);
    watchers.forEach((watcher) => watcher.close());
    await stopServer();
  }
  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());
  if (watchMode)
    console.log('[local] Backend JavaScript com reinicio automatico.');
  await rebuild();
}

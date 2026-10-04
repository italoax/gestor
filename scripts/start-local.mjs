import { spawn } from 'node:child_process';
import { watch, readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const watchMode = process.argv.includes('--watch');
const buildOnly = process.argv.includes('--build-only');
if (process.argv.includes('--serve')) {
  process.chdir(projectRoot);
  process.env.LOCAL_MODE = "false";
  process.env.NODE_ENV = process.env.NODE_ENV || "production";
  process.env.HOST = "127.0.0.1";
  process.env.PORT = process.env.PORT || "80";
  process.env.APP_URL = Number(process.env.PORT) === 80
    ? "http://localhost"
    : `http://localhost:${process.env.PORT}`;
  // O acesso local usa HTTP, mesmo com as rotinas de produção habilitadas.
  process.env.COOKIE_SECURE = "false";

  await import(new URL("../dist/server.js", import.meta.url).href);

} else {

  let server, compiler, debounce, retry;
  let building = false, pending = false, stopping = false;
  let failures = 0;
  const watchers = [];
  const waitForExit = child => new Promise(resolve => {
    if (!child || child.exitCode !== null || child.signalCode !== null) return resolve();
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
    const child = spawn(process.execPath, ['scripts/start-local.mjs', '--serve'], {
      cwd: projectRoot, stdio: 'inherit', env: { ...process.env, NODE_ENV: process.env.NODE_ENV || (watchMode ? 'development' : 'production') },
    });
    server = child;
    const started = Date.now();
    child.on('error', error => console.error('[local] Falha ao iniciar:', error.message));
    child.on('exit', code => {
      if (server !== child || stopping) return;
      server = undefined;
      if (!watchMode) { process.exitCode = code ?? 1; return; }
      failures = Date.now() - started > 60000 ? 1 : failures + 1;
      const delay = Math.min(30000, failures * 5000);
      console.error('[local] Servidor encerrou (' + code + '). Nova tentativa em ' + delay / 1000 + 's. Confira o erro acima.');
      retry = setTimeout(() => { if (!building && !server) startServer(); }, delay);
    });
  }
  function sourceFingerprint() {
    const hash = createHash('sha256');
    const sources = [];
    function scan(directory) {
      for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
        const file = path.join(directory, entry.name);
        if (entry.isDirectory()) scan(file);
        else if (/\.(ts|js|json)$/.test(entry.name)) {
          sources.push(file);
          hash.update(path.relative(projectRoot, file)).update(readFileSync(file));
        }
      }
    }
    scan(path.join(projectRoot, 'src'));
    for (const name of ['tsconfig.json', 'package.json', 'package-lock.json']) {
      hash.update(readFileSync(path.join(projectRoot, name)));
    }
    hash.update(readFileSync(require.resolve('typescript/package.json')));
    const outputsPresent = sources.filter(file => !file.endsWith('.d.ts')).every(file => {
      const relative = path.relative(path.join(projectRoot, 'src'), file).replace(/\.ts$/, '.js');
      return existsSync(path.join(projectRoot, 'dist', relative));
    });
    return { fingerprint: hash.digest('hex'), outputsPresent };
  }
  async function rebuild() {
    if (stopping) return;
    if (building) { pending = true; return; }
    building = true;
    clearTimeout(retry);
    const { fingerprint, outputsPresent } = sourceFingerprint();
    const cacheFile = path.join(projectRoot, 'dist', '.local-inputs');
    if (outputsPresent && existsSync(cacheFile) && readFileSync(cacheFile, 'utf8') === fingerprint) {
      console.log('[local] Backend sem alteracoes: usando compilacao existente.');
      building = false;
      if (!buildOnly && !server) startServer();
      return;
    }
    console.log('[local] Compilando alteracoes do backend...');
    compiler = spawn(process.execPath, [require.resolve('typescript/bin/tsc'), '--noEmitOnError', '--incremental', '--tsBuildInfoFile', 'dist/.local.tsbuildinfo'], { cwd: projectRoot, stdio: 'inherit' });
    const code = await new Promise(resolve => {
      compiler.once('error', error => { console.error(error.message); resolve(1); });
      compiler.once('exit', resolve);
    });
    compiler = undefined;
    if (code === 0 && !stopping) {
      writeFileSync(cacheFile, fingerprint);
      await stopServer();
      if (!buildOnly) startServer();
    } else if (!stopping) {
      if (!watchMode) process.exitCode = code || 1;
      console.error('[local] Corrija os erros e salve novamente. A instancia anterior continua ativa, se disponivel.');
    }
    building = false;
    if (pending && !stopping) { pending = false; void rebuild(); }
  }
  function changed(file, script = false) {
    if (!file || stopping) return;
    const name = String(file).replaceAll('\\', '/');
    if (script ? !name.endsWith('.mjs') : !/\.(ts|js|json)$/.test(name)) return;
    clearTimeout(debounce);
    debounce = setTimeout(() => void rebuild(), 700);
  }
  if (watchMode) {
  watchers.push(watch(new URL('../src/', import.meta.url), { recursive: true }, (_event, file) => changed(file)));
  watchers.push(watch(new URL('./', import.meta.url), (_event, file) => changed(file, true)));
  watchers.push(watch(new URL('../tsconfig.json', import.meta.url), () => changed('tsconfig.json')));
  }
  async function shutdown() {
    if (stopping) return;
    stopping = true;
    clearTimeout(debounce); clearTimeout(retry);
    watchers.forEach(watcher => watcher.close());
    compiler?.kill('SIGTERM');
    await stopServer();
  }
  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());
  if (watchMode) console.log('[local] Backend com recompilacao automatica.');
  await rebuild();

}

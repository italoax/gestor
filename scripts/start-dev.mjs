import { spawn } from 'node:child_process';
import { watch } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const projectRoot = fileURLToPath(new URL('../', import.meta.url));
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
  const force = setTimeout(() => previous.kill('SIGKILL'), 12000);
  await exited;
  clearTimeout(force);
}
function startServer() {
  if (stopping) return;
  const child = spawn(process.execPath, ['scripts/start-local.mjs'], {
    cwd: projectRoot, stdio: 'inherit', env: { ...process.env, NODE_ENV: 'development' },
  });
  server = child;
  const started = Date.now();
  child.on('error', error => console.error('[dev] Falha ao iniciar:', error.message));
  child.on('exit', code => {
    if (server !== child || stopping) return;
    server = undefined;
    failures = Date.now() - started > 60000 ? 1 : failures + 1;
    const delay = Math.min(30000, failures * 5000);
    console.error('[dev] Servidor encerrou (' + code + '). Nova tentativa em ' + delay / 1000 + 's. Confira o erro acima.');
    retry = setTimeout(() => { if (!building && !server) startServer(); }, delay);
  });
}
async function rebuild() {
  if (stopping) return;
  if (building) { pending = true; return; }
  building = true;
  clearTimeout(retry);
  console.log('[dev] Compilando alteracoes do backend...');
  compiler = spawn(process.execPath, [require.resolve('typescript/bin/tsc'), '--noEmitOnError'], { cwd: projectRoot, stdio: 'inherit' });
  const code = await new Promise(resolve => {
    compiler.once('error', error => { console.error(error.message); resolve(1); });
    compiler.once('exit', resolve);
  });
  compiler = undefined;
  if (code === 0 && !stopping) {
    await stopServer();
    startServer();
  } else if (!stopping) {
    console.error('[dev] Corrija os erros e salve novamente. A instancia anterior continua ativa, se disponivel.');
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
watchers.push(watch(new URL('../src/', import.meta.url), { recursive: true }, (_event, file) => changed(file)));
watchers.push(watch(new URL('./', import.meta.url), (_event, file) => changed(file, true)));
watchers.push(watch(new URL('../tsconfig.json', import.meta.url), () => changed('tsconfig.json')));
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
console.log('[dev] HTML/CSS/JS publico: recarregue o navegador. Backend: recompilacao automatica.');
await rebuild();

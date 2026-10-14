import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

dotenv.config();
const root = fileURLToPath(new URL('../', import.meta.url));
const development = process.argv.includes('--dev');
const publicPort = Number(
  process.env.FRONTEND_PORT || process.env.PORT || 3000,
);
const backendPort = Number(process.env.BACKEND_PORT || 3001);
const workerPort = Number(process.env.WORKER_PORT || 3002);
if (new Set([publicPort, backendPort, workerPort]).size !== 3)
  throw new Error('Use portas diferentes para a interface, backend e worker.');
const backendUrl = `http://127.0.0.1:${backendPort}`;
const runtimeEnv = {
  ...process.env,
  NODE_ENV: development ? 'development' : 'production',
  APP_URL: process.env.APP_URL || `http://localhost:${publicPort}`,
  NEXT_BACKEND_URL: backendUrl,
  WORKER_URL: `http://127.0.0.1:${workerPort}`,
  WORKER_PORT: String(workerPort),
  RUN_AUTOMATIONS: 'false',
  NEXT_FRONTEND_ENABLED: 'true',
};
const children = [];
let stopping = false;
function launch(name, args, extraEnv = {}) {
  const child = spawn(process.execPath, args, {
    cwd: root,
    env: { ...runtimeEnv, ...extraEnv },
    stdio: 'inherit',
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
  await Promise.all(
    children.map(
      (child) =>
        new Promise((resolve) => {
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
  );
}
process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());

if (development) await import('./build-react.mjs');
else await import('./verify-build.mjs');
launch(
  'Backend',
  development
    ? [
        'node_modules/tsx/dist/cli.mjs',
        'watch',
        '--tsconfig',
        'backend/tsconfig.json',
        'backend/src/main.ts',
      ]
    : ['backend/dist/main.js'],
  { PORT: String(backendPort), HOST: '127.0.0.1' },
);
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
    'O backend não ficou disponível. Confira a conexão com o MySQL.',
  );
  await shutdown(1);
} else {
  if (runtimeEnv.LOCAL_MODE !== 'true')
    launch(
      'Worker',
      development
        ? [
            'node_modules/tsx/dist/cli.mjs',
            'watch',
            '--tsconfig',
            'backend/tsconfig.json',
            'backend/src/worker.ts',
          ]
        : ['backend/dist/worker.js'],
    );
  launch('Next.js', [
    'node_modules/next/dist/bin/next',
    development ? 'dev' : 'start',
    'web',
    '--hostname',
    process.env.FRONTEND_HOST || '0.0.0.0',
    '--port',
    String(publicPort),
  ]);
  console.log(
    `Gestor: ${runtimeEnv.APP_URL} — Next.js, NestJS e worker separados.`,
  );
}

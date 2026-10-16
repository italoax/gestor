import { readFileSync } from 'node:fs';

function threadLimit(value: string | undefined, fallback: number) {
  if (value === undefined || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 16)
    throw new Error('Limites de threads devem ser inteiros entre 1 e 16.');
  return parsed;
}

// Aplicar antes de spawn(): os pools são criados na inicialização do filho.
// Não altera o pool V8 do processo que a hospedagem já iniciou.
export function childProcessResources(environment: NodeJS.ProcessEnv) {
  const v8Threads = threadLimit(environment.GESTOR_V8_POOL_SIZE, 1);
  const uvThreads = threadLimit(environment.UV_THREADPOOL_SIZE, 2);
  const rayonThreads = threadLimit(environment.RAYON_NUM_THREADS, 1);
  return {
    nodeArgs: [`--v8-pool-size=${v8Threads}`],
    env: {
      ...environment,
      UV_THREADPOOL_SIZE: String(uvThreads),
      RAYON_NUM_THREADS: String(rayonThreads),
    },
    limits: { v8Threads, uvThreads, rayonThreads },
  };
}

export function currentThreadCount(): number | undefined {
  if (process.platform !== 'linux') return undefined;
  try {
    const value = readFileSync('/proc/self/status', 'utf8').match(
      /^Threads:\s+(\d+)/m,
    );
    return value ? Number(value[1]) : undefined;
  } catch {
    return undefined;
  }
}

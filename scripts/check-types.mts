import { execFileSync } from 'node:child_process';
import { projectRoot } from '../src/config/paths.ts';

for (const config of [
  'tsconfig.json',
  'web/tsconfig.json',
  'src/browser/tsconfig.json',
  'src/browser/tsconfig.worker.json',
]) {
  execFileSync(
    process.execPath,
    ['node_modules/typescript/bin/tsc', '--noEmit', '-p', config],
    {
      cwd: projectRoot,
      stdio: 'inherit',
    },
  );
}
console.log(
  'Tipos verificados: backend, serviços, frontend, scripts e navegador.',
);

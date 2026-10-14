import { execFileSync } from 'node:child_process';
execFileSync(
  process.execPath,
  ['node_modules/typescript/bin/tsc', '-p', 'tsconfig.json'],
  { stdio: 'inherit' },
);
console.log('Backend, serviços e scripts compilados em dist/runtime.');

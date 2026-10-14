import { execFileSync } from 'node:child_process';
execFileSync(
  process.execPath,
  ['node_modules/typescript/bin/tsc', '-p', 'backend/tsconfig.json'],
  { stdio: 'inherit' },
);
console.log('Backend NestJS compilado em backend/dist.');

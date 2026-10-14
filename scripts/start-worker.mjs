import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
dotenv.config();
if (process.env.NODE_ENV === 'production')
  await import('../backend/dist/worker.js');
else {
  const { tsImport } = await import('tsx/esm/api');
  await tsImport('../backend/src/worker.ts', {
    parentURL: import.meta.url,
    tsconfig: fileURLToPath(
      new URL('../backend/tsconfig.json', import.meta.url),
    ),
  });
}

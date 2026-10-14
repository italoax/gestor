import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import { projectRoot } from '../src/config/paths.ts';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
dotenv.config();
if (process.env.NODE_ENV === 'production')
  await import(
    pathToFileURL(path.join(projectRoot, 'dist/runtime/backend/src/worker.js'))
      .href
  );
else {
  const { tsImport } = await import('tsx/esm/api');
  await tsImport('../backend/src/worker.ts', {
    parentURL: import.meta.url,
    tsconfig: fileURLToPath(
      new URL('../backend/tsconfig.json', import.meta.url),
    ),
  });
}

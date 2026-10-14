import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import { projectRoot } from '../src/config/paths.ts';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
dotenv.config();
process.env.PORT = process.env.BACKEND_PORT || '3001';
process.env.HOST = '127.0.0.1';
process.env.RUN_AUTOMATIONS = 'false';
process.env.NEXT_FRONTEND_ENABLED = 'true';
process.env.WORKER_URL =
  process.env.WORKER_URL ||
  `http://127.0.0.1:${process.env.WORKER_PORT || 3002}`;
if (process.env.NODE_ENV === 'production')
  await import(
    pathToFileURL(path.join(projectRoot, 'dist/runtime/backend/src/main.js'))
      .href
  );
else {
  const { tsImport } = await import('tsx/esm/api');
  await tsImport('../backend/src/main.ts', {
    parentURL: import.meta.url,
    tsconfig: fileURLToPath(
      new URL('../backend/tsconfig.json', import.meta.url),
    ),
  });
}

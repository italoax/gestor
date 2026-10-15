import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import { projectRoot } from '../src/config/paths.ts';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const configuration = dotenv.config({
  quiet: true,
  path: process.env.GESTOR_ENV_FILE || '.env',
});
if (process.env.GESTOR_ENV_FILE && configuration.error)
  throw new Error(
    'Não foi possível carregar a configuração explícita do ambiente.',
  );
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

import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import { projectRoot } from '../../src/config/paths.ts';
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
process.env.PORT = process.env.BACKEND_PORT || '3001';
process.env.HOST = '127.0.0.1';
process.env.RUN_AUTOMATIONS =
  process.env.RUN_AUTOMATIONS === 'true' ? 'true' : 'false';
process.env.NEXT_FRONTEND_ENABLED = 'true';
if (process.env.NODE_ENV === 'production')
  await import(
    pathToFileURL(path.join(projectRoot, 'dist/runtime/apps/api/src/main.js'))
      .href
  );
else {
  const { tsImport } = await import('tsx/esm/api');
  await tsImport('../../apps/api/src/main.ts', {
    parentURL: import.meta.url,
    tsconfig: fileURLToPath(
      new URL('../../apps/api/tsconfig.json', import.meta.url),
    ),
  });
}

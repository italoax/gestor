import { existsSync } from 'node:fs';
import path from 'node:path';
import { projectRoot } from '../../src/config/paths.ts';
import { verifyPublicAssets } from '../check/check-public-assets.mts';
if (
  ![
    'apps/web/.next/BUILD_ID',
    'dist/react/clients.server.mjs',
    'dist/runtime/apps/api/src/main.js',
    'dist/runtime/apps/api/src/worker.js',
    'public/assets/js/main.js',
    'public/assets/js/panel-runtime.js',
    'public/assets/js/offline.js',
    'public/sw.js',
  ].every((file) => existsSync(path.join(projectRoot, file)))
) {
  throw new Error(
    'Build de produção ausente. Execute npm run build antes de iniciar o gestor.',
  );
}
verifyPublicAssets();

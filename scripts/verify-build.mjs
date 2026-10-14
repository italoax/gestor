import { existsSync } from 'node:fs';
if (
  ![
    '../web/.next/BUILD_ID',
    '../dist/react/clients.server.mjs',
    '../backend/dist/main.js',
    '../backend/dist/worker.js',
  ].every((file) => existsSync(new URL(file, import.meta.url)))
) {
  throw new Error(
    'Build de produção ausente. Execute npm run build antes de iniciar o gestor.',
  );
}

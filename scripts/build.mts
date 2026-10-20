await import('./prepare-next.mts');
await import('./check-types.mts');
await import('./build-react.mts');
await import('./build-browser.mts');
await import('./build-backend.mts');
await import('./check-js.mts');
await import('./check-views.mts');
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createAssetVersions } from '../src/services/assetVersions.ts';
import { execFileSync } from 'node:child_process';
import { hostingEntrySource } from './hosting-entry.mts';
import { verifyPublicAssets } from './check-public-assets.mts';

verifyPublicAssets({ includeNext: false });

// Compatibilidade com hospedagens ainda configuradas para dist/server.js.
const output = new URL('../dist/', import.meta.url);
mkdirSync(output, { recursive: true });
const assets = createAssetVersions(
  fileURLToPath(new URL('../public/', import.meta.url)),
);
writeFileSync(
  new URL('assets-manifest.json', output),
  JSON.stringify(assets.versions, null, 2) + '\n',
);
writeFileSync(new URL('sw.js', output), assets.workerSource);
console.log('Versões automáticas dos assets geradas: ' + assets.cacheName);
// A hospedagem pode servir arquivos públicos antes do Node. Uma nova versão
// precisa de novas URLs também nas páginas e nos controladores do Next.
process.env.NEXT_PUBLIC_ASSET_VERSION = assets.cacheName;
execFileSync(
  process.execPath,
  ['node_modules/next/dist/bin/next', 'build', 'web', '--webpack'],
  { stdio: 'inherit' },
);
verifyPublicAssets();
writeFileSync(new URL('server.js', output), hostingEntrySource());
console.log('Entrada de compatibilidade criada: dist/server.js');

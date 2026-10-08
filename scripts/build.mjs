import './check-js.mjs';
import './check-views.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createAssetVersions } from '../src/services/assetVersions.js';

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
writeFileSync(new URL('server.js', output), "import '../src/server.js';\n");
console.log('Entrada de compatibilidade criada: dist/server.js');

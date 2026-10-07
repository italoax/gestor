import './check-js.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';

// Compatibilidade com hospedagens ainda configuradas para dist/server.js.
const output = new URL('../dist/', import.meta.url);
mkdirSync(output, { recursive: true });
writeFileSync(new URL('server.js', output), "import '../src/server.js';\n");
console.log('Entrada de compatibilidade criada: dist/server.js');

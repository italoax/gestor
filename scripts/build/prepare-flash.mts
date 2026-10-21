import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const flashPath = require.resolve('connect-flash/lib/flash.js');
const source = readFileSync(flashPath, 'utf8');
const original = "var isArray = require('util').isArray;";
const corrected = 'var isArray = Array.isArray;';

// connect-flash 0.1.1 ainda usa a API obsoleta do Node. Corrige a cópia
// instalada sem alterar a fila de mensagens nem suprimir outros avisos.
if (!source.includes(corrected)) {
  if (source.split(original).length !== 2) {
    throw new Error(
      'O connect-flash mudou. Revise a correção de compatibilidade antes de publicar.',
    );
  }
  writeFileSync(flashPath, source.replace(original, corrected));
  console.log('connect-flash: util.isArray substituído por Array.isArray.');
}

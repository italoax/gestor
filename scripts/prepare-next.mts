import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const nextVersion = require('next/package.json').version;
const wasmVersion = require('@next/swc-wasm-nodejs/package.json').version;
if (nextVersion !== '16.4.0' || wasmVersion !== nextVersion) {
  throw new Error(
    'A compatibilidade SWC exige Next.js e @next/swc-wasm-nodejs na versão 16.4.0.',
  );
}

// Next 16.4.0 aplica pathToFileURL() a um nome de pacote, que não é um caminho.
// Resolva o pacote instalado antes dessa conversão. O caminho de download e
// todos os erros do compilador continuam sendo tratados pelo próprio Next.
const compilerPath = require.resolve('next/dist/build/swc/index.js');
const source = readFileSync(compilerPath, 'utf8');
const original = 'let pkgPath = pkg;';
const corrected = 'let pkgPath = importPath ? pkg : require.resolve(pkg);';
if (!source.includes(corrected)) {
  if (source.split(original).length !== 2) {
    throw new Error(
      'O carregador SWC mudou. Revise a correção de compatibilidade antes de publicar.',
    );
  }
  writeFileSync(compilerPath, source.replace(original, corrected));
  console.log(
    'SWC: resolução do pacote WebAssembly corrigida para Next.js 16.4.0.',
  );
}

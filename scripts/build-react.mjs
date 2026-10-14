import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
await build({
  absWorkingDir: root,
  entryPoints: ['src/frontend/clients/index.jsx'],
  outfile: 'public/assets/js/react/clients.js',
  bundle: true,
  minify: true,
  format: 'iife',
  platform: 'browser',
  target: ['es2020'],
  jsx: 'automatic',
  legalComments: 'none',
  define: { 'process.env.NODE_ENV': '"production"' },
});
await build({
  absWorkingDir: root,
  entryPoints: ['src/frontend/clients/server.jsx'],
  outfile: 'dist/react/clients.server.mjs',
  bundle: true,
  packages: 'external',
  platform: 'node',
  format: 'esm',
  jsx: 'automatic',
});
console.log('React: tela de clientes compilada para o servidor e o navegador.');

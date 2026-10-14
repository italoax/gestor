import { readdirSync } from 'node:fs';
import path from 'node:path';
import { build, context, type BuildOptions } from 'esbuild';
import { projectRoot } from '../src/config/paths.ts';

function sources(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory()
      ? sources(file)
      : file.endsWith('.ts')
        ? [file]
        : [];
  });
}

const sourceRoot = path.join(projectRoot, 'src/browser/assets/js');
const browserOptions: BuildOptions = {
  entryPoints: sources(sourceRoot),
  outbase: sourceRoot,
  outdir: path.join(projectRoot, 'public/assets/js'),
  target: 'es2020',
  platform: 'browser',
  bundle: false,
  legalComments: 'none',
};
const workerOptions: BuildOptions = {
  entryPoints: [path.join(projectRoot, 'src/browser/sw.ts')],
  outfile: path.join(projectRoot, 'public/sw.js'),
  format: 'iife',
  target: 'es2020',
  platform: 'browser',
  bundle: false,
  legalComments: 'none',
};
if (process.argv.includes('--watch')) {
  const browser = await context(browserOptions);
  const worker = await context(workerOptions);
  await browser.watch();
  await worker.watch();
  const stop = async () => {
    await Promise.all([browser.dispose(), worker.dispose()]);
  };
  process.once('SIGINT', () => void stop());
  process.once('SIGTERM', () => void stop());
} else {
  await build(browserOptions);
  await build(workerOptions);
}
console.log(
  'Controles do navegador e service worker compilados de TypeScript.',
);

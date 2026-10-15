import { readdirSync } from 'node:fs';
import path from 'node:path';
import { build, context, type BuildOptions } from 'esbuild';
import { projectRoot } from '../src/config/paths.ts';
import { writeReleaseNotes } from './release-notes.mts';

writeReleaseNotes();

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
const shellEntry = path.join(sourceRoot, 'app-shell.ts');
const browserOptions: BuildOptions = {
  entryPoints: sources(sourceRoot).filter((file) => file !== shellEntry),
  outbase: sourceRoot,
  outdir: path.join(projectRoot, 'public/assets/js'),
  target: 'es2020',
  platform: 'browser',
  bundle: false,
  legalComments: 'none',
};
// Agrupa o shell e seus módulos em um script clássico para as páginas React e EJS.
const shellOptions: BuildOptions = {
  ...browserOptions,
  entryPoints: [shellEntry],
  bundle: true,
  format: 'iife',
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
  const shell = await context(shellOptions);
  const worker = await context(workerOptions);
  await browser.watch();
  await shell.watch();
  await worker.watch();
  const stop = async () => {
    await Promise.all([browser.dispose(), shell.dispose(), worker.dispose()]);
  };
  process.once('SIGINT', () => void stop());
  process.once('SIGTERM', () => void stop());
} else {
  await build(browserOptions);
  await build(shellOptions);
  await build(workerOptions);
}
console.log(
  'Controles do navegador e service worker compilados de TypeScript.',
);

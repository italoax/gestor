import { readdirSync } from 'node:fs';
import path from 'node:path';
import { build, context, type BuildOptions } from 'esbuild';
import { projectRoot } from '../src/config/paths.ts';
import { writeReleaseNotes } from './release-notes.mts';
import { copyFileSync, mkdirSync } from 'node:fs';

writeReleaseNotes();
const vendorDirectory = path.join(projectRoot, 'public/assets/js/vendor');
mkdirSync(path.join(vendorDirectory, 'maps'), { recursive: true });
copyFileSync(
  path.join(projectRoot, 'node_modules/chart.js/dist/chart.umd.js'),
  path.join(vendorDirectory, 'chart.umd.js'),
);
for (const map of ['brazil', 'world'])
  await build({
    stdin: {
      contents: `import map from '@svg-maps/${map}'; export default map;`,
      resolveDir: projectRoot,
    },
    bundle: true,
    format: 'esm',
    platform: 'browser',
    outfile: path.join(vendorDirectory, 'maps', `${map}.js`),
  });

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
const panelEntry = path.join(sourceRoot, 'panel-runtime.ts');
const classicEntries = [
  'main',
  'navigation',
  'login',
  'portal-login',
  'pages/client-access',
  'pages/catalogs',
  'pages/automacao',
  'pages/mensagens',
].map((name) => path.join(sourceRoot, `${name}.ts`));
const browserOptions: BuildOptions = {
  entryPoints: sources(sourceRoot).filter(
    (file) =>
      file !== shellEntry &&
      file !== panelEntry &&
      !classicEntries.includes(file),
  ),
  outbase: sourceRoot,
  outdir: path.join(projectRoot, 'public/assets/js'),
  target: 'es2020',
  platform: 'browser',
  bundle: false,
  legalComments: 'none',
};
const classicOptions: BuildOptions = {
  ...browserOptions,
  entryPoints: classicEntries,
  bundle: true,
  format: 'iife',
};
// Agrupa o shell e seus módulos em um script clássico para as páginas React e EJS.
const shellOptions: BuildOptions = {
  ...browserOptions,
  entryPoints: [shellEntry],
  bundle: true,
  format: 'iife',
};
const panelOptions: BuildOptions = {
  ...shellOptions,
  entryPoints: [panelEntry],
  minify: true,
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
  const classic = await context(classicOptions);
  const shell = await context(shellOptions);
  const panel = await context(panelOptions);
  const worker = await context(workerOptions);
  await browser.watch();
  await classic.watch();
  await shell.watch();
  await panel.watch();
  await worker.watch();
  const stop = async () => {
    await Promise.all([
      browser.dispose(),
      classic.dispose(),
      shell.dispose(),
      panel.dispose(),
      worker.dispose(),
    ]);
  };
  process.once('SIGINT', () => void stop());
  process.once('SIGTERM', () => void stop());
} else {
  await build(browserOptions);
  await build(classicOptions);
  await build(shellOptions);
  await build(panelOptions);
  await build(workerOptions);
}
if (process.env.GESTOR_COMPACT_LOGS !== 'true')
  console.log(
    'Controles do navegador e service worker compilados de TypeScript.',
  );

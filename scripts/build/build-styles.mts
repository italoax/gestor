import { build, context, type BuildOptions } from 'esbuild';
import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { projectRoot } from '../../src/config/paths.ts';

export function stylesheetSources(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory()
      ? stylesheetSources(file)
      : entry.isFile() &&
          entry.name.endsWith('.css') &&
          !entry.name.endsWith('.min.css')
        ? [file]
        : [];
  });
}

export async function buildStyles({
  directory = path.join(projectRoot, 'public/assets/css'),
  watch = false,
} = {}) {
  const entryPoints = stylesheetSources(directory);
  const options: BuildOptions = {
    entryPoints,
    outbase: directory,
    outdir: directory,
    outExtension: { '.css': '.min.css' },
    bundle: false,
    minify: true,
    sourcemap: false,
    legalComments: 'none',
    charset: 'utf8',
  };
  if (watch) {
    const styles = await context(options);
    await styles.watch();
    return styles;
  }
  await build(options);
  const original = entryPoints.reduce(
    (total, file) => total + statSync(file).size,
    0,
  );
  const minified = entryPoints.reduce(
    (total, file) => total + statSync(file.replace(/\.css$/, '.min.css')).size,
    0,
  );
  if (process.env.GESTOR_COMPACT_LOGS !== 'true')
    console.log(
      `CSS: ${entryPoints.length} arquivos minificados; ${Math.round(original / 1024)} KB → ${Math.round(minified / 1024)} KB (${Math.round((1 - minified / original) * 100)}% menores).`,
    );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  await buildStyles({ watch: process.argv.includes('--watch') });

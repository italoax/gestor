import { readFile, readdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import * as prettier from 'prettier';
import { projectRoot } from '../../src/config/paths.ts';
import { formatSource } from '../lib/format-source.mts';

const check = process.argv.includes('--check');
const ignorePath = path.join(projectRoot, '.prettierignore');
const extensions = /\.(?:m?js|jsx|m?ts|tsx|css|json|html|ejs|md)$/;

async function files(directory) {
  if (!existsSync(directory)) return [];
  const entries = await readdir(directory, { withFileTypes: true });
  const paths = await Promise.all(
    entries.map(async (entry) => {
      const file = path.join(directory, entry.name);
      const info = await prettier.getFileInfo(file, { ignorePath });
      if (info.ignored) return [];
      if (entry.isDirectory()) return files(file);
      return entry.isFile() && extensions.test(entry.name) ? [file] : [];
    }),
  );
  return paths.flat();
}

const targets = [
  '.prettierrc.json',
  'package.json',
  'tsconfig.json',
  ...(existsSync(path.join(projectRoot, 'README.md')) ? ['README.md'] : []),
  ...(await files(path.join(projectRoot, 'src'))),
  ...(await files(path.join(projectRoot, 'apps'))),
  ...(await files(path.join(projectRoot, 'public'))),
  ...(await files(path.join(projectRoot, 'scripts'))),
  ...(await files(path.join(projectRoot, 'docs'))),
]
  .map((file) => path.resolve(projectRoot, file))
  .sort();
let changed = 0;
for (const file of targets) {
  const source = await readFile(file, 'utf8');
  const formatted = await formatSource(source, file);
  if (source === formatted) continue;
  changed++;
  console.log(path.relative(projectRoot, file));
  if (!check) await writeFile(file, formatted);
}
console.log(
  check
    ? `Formatação verificada: ${targets.length} arquivos, ${changed} pendentes.`
    : `Formatação aplicada: ${changed} arquivos.`,
);
if (check && changed) process.exitCode = 1;

import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
function scripts(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory()
      ? scripts(file)
      : /\.m?js$/.test(file)
        ? [file]
        : [];
  });
}
const files = ['src', 'public', 'scripts'].flatMap((dir) =>
  scripts(path.join(root, dir)),
);
for (const file of files)
  execFileSync(process.execPath, ['--check', file], { stdio: 'inherit' });
console.log(`Sintaxe verificada: ${files.length} arquivos JavaScript.`);

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, lstatSync } from 'node:fs';
import path from 'node:path';
import { projectRoot } from '../../src/config/paths.ts';
import { resolveStoragePaths } from '../../src/config/storagePaths.ts';
import '../build/verify-build.mts';

// Inspeção local: não publica, não abre conexões com o banco e não imprime .env.
const files = execFileSync(
  'git',
  ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
  {
    cwd: projectRoot,
    encoding: 'utf8',
    windowsHide: true,
  },
)
  .split('\0')
  .filter((file) => file && existsSync(path.join(projectRoot, file)));
const required = [
  'package.json',
  'package-lock.json',
  '.node-version',
  'tsconfig.json',
  'apps/web/next.config.mjs',
  'apps/api/src/main.ts',
  'src/config/storagePaths.ts',
  'src/services/runtimeStorage.ts',
  'scripts/build/build.mts',
  'scripts/deploy/hosting-entry.mts',
];
for (const file of required)
  if (!files.includes(file))
    throw new Error('Arquivo necessário ausente do código publicável: ' + file);
const forbidden =
  /(?:\.[mM][dD]$|(?:^|\/)(?:node_modules|\.next|\.local|backups|gestor-data|secrets|tokens|sessions)(?:\/|$)|^dist\/|^public\/uploads\/|(?:^|\/)\.env(?:\..*)?$|\.(?:keyring\.json|security\.env)$)/;
for (const file of files) {
  if (file === '.env.example') continue;
  if (
    forbidden.test(file) ||
    lstatSync(path.join(projectRoot, file)).isSymbolicLink()
  )
    throw new Error(
      'Arquivo privado, gerado ou simbólico incluído no Git: ' + file,
    );
}
const manifest = JSON.parse(
  readFileSync(path.join(projectRoot, 'package.json'), 'utf8'),
);
if (manifest.main !== 'dist/server.js' || manifest.engines?.node !== '22.x')
  throw new Error(
    'A entrada ou a versão do Node diverge da configuração de deploy.',
  );
const data = resolveStoragePaths({
  root: '/home/CONTA/domains/DOMINIO/hbuilds/versions/RELEASE/nodejs',
  environment: {},
});
console.log(
  `Deploy verificado: ${files.length} arquivos de origem; build completo; Markdown e dados privados fora do Git.`,
);
console.log(
  'Hostinger: raiz . | Node 22 | instalar npm ci | build npm run build | entrada dist/server.js',
);
console.log('Uploads existentes na hospedagem: ' + data.uploads);
console.log('Backups privados na hospedagem: ' + data.backups);
console.log(
  'Publicação: enviar o código ao GitHub e usar o deploy automático do repositório na Hostinger.',
);

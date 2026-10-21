import path from 'node:path';
import { projectRoot } from './paths.ts';

export function resolveStoragePaths({
  root = projectRoot,
  environment = process.env,
} = {}) {
  // O caminho pode vir de um diagnóstico de outra plataforma.
  const paths = /^[A-Za-z]:[\\/]/.test(root) ? path.win32 : path.posix;
  root = paths.resolve(root);
  const hosting = root
    .replace(/\\/g, '/')
    .match(
      /^((\/home\/[^/]+)\/domains\/[^/]+)\/hbuilds\/(?:versions\/[^/]+|current)\/nodejs\/?$/,
    );
  const configured = environment.GESTOR_DATA_DIR?.trim();
  if (configured && !paths.isAbsolute(configured))
    throw new Error('GESTOR_DATA_DIR deve ser um caminho absoluto.');
  // Reaproveita uploads na raiz da conta. Dados privados ficam numa subpasta
  // oculta, que o servidor de arquivos recusa publicar.
  const accountUploads = hosting && paths.join(hosting[2], 'uploads');
  const dataRoot = configured
    ? paths.resolve(configured)
    : accountUploads
      ? paths.join(accountUploads, '.gestor-ixtv')
      : root;
  const relative = paths.relative(root, dataRoot);
  if (
    configured &&
    (relative === '' ||
      (!relative.startsWith('..' + paths.sep) &&
        relative !== '..' &&
        !paths.isAbsolute(relative)))
  )
    throw new Error('GESTOR_DATA_DIR deve ficar fora da pasta do projeto.');
  if (
    hosting &&
    /\/(?:hbuilds|public_html)(?:\/|$)/.test(dataRoot.replace(/\\/g, '/'))
  )
    throw new Error(
      'GESTOR_DATA_DIR deve ficar fora de hbuilds e public_html.',
    );
  return {
    projectRoot: root,
    dataRoot,
    backups: paths.join(dataRoot, 'backups'),
    uploads:
      !configured && accountUploads
        ? accountUploads
        : paths.join(
            dataRoot,
            dataRoot === root ? 'public/uploads' : 'uploads',
          ),
    // Permite importar as cópias da versão anterior no primeiro deploy.
    versions: hosting ? paths.join(hosting[1], 'hbuilds/versions') : undefined,
    previousDataRoot:
      hosting && !configured
        ? paths.join(hosting[1], 'gestor-data')
        : undefined,
  };
}

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import dotenv from 'dotenv';
import { projectRoot } from '../../src/config/paths.ts';
import { assertPublicBuildSafe } from '../../src/security/publicBuild.ts';

export function verifyPublicAssets({ includeNext = true } = {}) {
  const configurations: Record<string, string | undefined>[] = [process.env];
  for (const directory of [projectRoot, path.join(projectRoot, 'apps/web')]) {
    for (const filename of [
      '.env',
      '.env.local',
      '.env.production',
      '.env.production.local',
    ]) {
      const file = path.join(directory, filename);
      if (existsSync(file))
        configurations.push(dotenv.parse(readFileSync(file)));
    }
  }
  if (process.env.GESTOR_ENV_FILE)
    configurations.push(
      dotenv.parse(readFileSync(process.env.GESTOR_ENV_FILE)),
    );
  const roots = [
    {
      directory: path.join(projectRoot, 'public'),
      label: 'public',
      excludeUploads: true,
    },
  ];
  const nextStatic = path.join(projectRoot, 'apps/web/.next/static');
  if (includeNext && existsSync(nextStatic))
    roots.push({
      directory: nextStatic,
      label: 'apps/web/.next/static',
      excludeUploads: false,
    });
  assertPublicBuildSafe({ roots, configurations });
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  verifyPublicAssets();
  console.log(
    'Arquivos públicos verificados: sem originais, backups, links simbólicos ou credenciais conhecidas.',
  );
}

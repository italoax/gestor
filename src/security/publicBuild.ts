import { lstatSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const serverSecrets = new Set([
  'SESSION_SECRET',
  'DB_PASSWORD',
  'DB_PASS',
  'WA_SESSION_API_TOKEN',
  'DATA_ENCRYPTION_KEYS',
]);
const privateDirectories = new Set([
  'node_modules',
  'backups',
  'secrets',
  'sessions',
]);
const privateFilename =
  /(?:\.(?:map|[cm]?tsx?|pem|key|p12|pfx|sql|sqlite\d?|db|bak|backup|old|orig|swp)(?:\.(?:gz|zip|br))?$|~$|^(?:package(?:-lock)?\.json|tsconfig(?:\.[^.]+)?\.json|next\.config\.[cm]?js|dockerfile)$)/i;

export interface PublicBuildFinding {
  file: string;
  reason: string;
}

export function inspectPublicBuild({
  roots,
  configurations = [],
}: {
  roots: { directory: string; label: string; excludeUploads?: boolean }[];
  configurations?: Record<string, string | undefined>[];
}): PublicBuildFinding[] {
  const findings: PublicBuildFinding[] = [];
  const secrets = new Map<string, Set<string>>();
  for (const config of configurations) {
    for (const [name, value] of Object.entries(config)) {
      if (!value) continue;
      if (
        name.startsWith('NEXT_PUBLIC_') &&
        serverSecrets.has(name.slice('NEXT_PUBLIC_'.length))
      )
        findings.push({
          file: name,
          reason: 'configuração privada marcada como pública',
        });
      if (!serverSecrets.has(name) || value.length < 16) continue;
      const variants = secrets.get(name) || new Set<string>();
      variants.add(value);
      variants.add(JSON.stringify(value).slice(1, -1));
      secrets.set(name, variants);
    }
  }
  for (const root of roots) {
    function inspect(directory: string, prefix = '') {
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const relative = prefix + entry.name;
        // Uploads seguem as regras próprias de validação e armazenamento.
        if (root.excludeUploads && relative === 'uploads') continue;
        const file = root.label + '/' + relative;
        const absolute = path.join(directory, entry.name);
        if (entry.isSymbolicLink()) {
          findings.push({
            file,
            reason: 'link simbólico em diretório público',
          });
          continue;
        }
        if (
          (entry.name.startsWith('.') && entry.name !== '.well-known') ||
          privateDirectories.has(entry.name.toLowerCase()) ||
          privateFilename.test(entry.name)
        ) {
          findings.push({ file, reason: 'arquivo privado ou de depuração' });
          continue;
        }
        if (entry.isDirectory()) {
          inspect(absolute, relative + '/');
          continue;
        }
        if (!entry.isFile()) {
          findings.push({
            file,
            reason: 'tipo de arquivo público não permitido',
          });
          continue;
        }
        if (!/\.(?:[cm]?js|css|json|html|txt|xml)$/i.test(entry.name)) continue;
        const content = readFileSync(absolute, 'utf8');
        if (
          /\/\/[#@]\s*sourceMappingURL\s*=|\/\*[#@]\s*sourceMappingURL\s*=/.test(
            content,
          )
        )
          findings.push({
            file,
            reason: 'referência pública a mapa de depuração',
          });
        for (const [name, variants] of secrets) {
          if ([...variants].some((value) => content.includes(value)))
            findings.push({ file, reason: `credencial de servidor: ${name}` });
        }
      }
    }
    if (lstatSync(root.directory).isSymbolicLink()) {
      findings.push({
        file: root.label,
        reason: 'raiz pública é um link simbólico',
      });
      continue;
    }
    inspect(root.directory);
  }
  return findings;
}

export function assertPublicBuildSafe(
  options: Parameters<typeof inspectPublicBuild>[0],
) {
  const findings = inspectPublicBuild(options);
  if (findings.length)
    throw new Error(
      'Publicação bloqueada por arquivos públicos inseguros:\n' +
        findings.map(({ file, reason }) => `- ${file}: ${reason}`).join('\n'),
    );
}

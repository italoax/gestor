import path from 'node:path';
import type { LocalDatabaseDeployment } from './localDatabaseDeployments.ts';

export interface DatabaseRuntimeIdentity {
  platform: string;
  hostname: string;
  uid: number;
  effectiveUid: number;
  gid: number;
  effectiveGid: number;
  applicationRoot: string;
  networkNamespace: string;
}

// Pure evaluator for tests and policy review. Application connection factories
// always obtain their own OS identity and use the compiled approval registry.
export function assertApprovedLocalDatabase(
  config: Record<string, string | undefined>,
  runtime: DatabaseRuntimeIdentity,
  approvals: readonly LocalDatabaseDeployment[],
  now = Date.now(),
) {
  if (
    config.DB_HOST !== 'localhost' ||
    (config.DB_PORT !== undefined && config.DB_PORT !== '3306')
  )
    throw new Error(
      'TCP local autorizado exige DB_HOST=localhost e DB_PORT=3306.',
    );
  if (config.DB_SSL !== 'false')
    throw new Error(
      'Declare explicitamente DB_SSL=false para revisar a exceção local.',
    );
  if (config.DB_SSL_CA)
    throw new Error('Configuração TLS não pode ser misturada à exceção local.');
  const approved =
    runtime.platform === 'linux' &&
    approvals.some((entry) => {
      const relative = path.posix.relative(
        entry.releasesRoot,
        runtime.applicationRoot,
      );
      const expiry = Date.parse(entry.validUntil);
      return (
        entry.domain === 'ixstreaming.com.br' &&
        path.posix.isAbsolute(entry.releasesRoot) &&
        /^\/[a-zA-Z0-9/_.-]+$/.test(entry.releasesRoot) &&
        path.posix.normalize(entry.releasesRoot) === entry.releasesRoot &&
        /^\/home\/[a-zA-Z0-9_-]+\/domains\/ixstreaming\.com\.br\/hbuilds\/versions$/.test(
          entry.releasesRoot,
        ) &&
        /^[a-zA-Z0-9-]+\/nodejs$/.test(relative) &&
        entry.hostname === runtime.hostname &&
        Number.isSafeInteger(entry.uid) &&
        entry.uid > 0 &&
        entry.uid === runtime.uid &&
        entry.uid === runtime.effectiveUid &&
        Number.isSafeInteger(entry.gid) &&
        entry.gid > 0 &&
        entry.gid === runtime.gid &&
        entry.gid === runtime.effectiveGid &&
        /^net:\[\d+\]$/.test(entry.networkNamespace) &&
        entry.networkNamespace === runtime.networkNamespace &&
        Boolean(entry.evidenceReference?.trim()) &&
        Boolean(entry.approvedBy?.trim()) &&
        Number.isFinite(expiry) &&
        expiry > now &&
        entry.controls?.sameHostDatabase === true &&
        entry.controls.tenantIsolation === true &&
        entry.controls.databaseAccessRestricted === true &&
        entry.controls.noForwardingOrTunnel === true
      );
    });
  if (!approved)
    throw new Error(
      'TCP local sem TLS bloqueado: topologia e ambiente de hospedagem ainda não aprovados.',
    );
}

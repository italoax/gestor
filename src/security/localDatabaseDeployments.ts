export interface LocalDatabaseDeployment {
  domain: 'ixstreaming.com.br';
  hostname: string;
  uid: number;
  gid: number;
  // Canonical absolute directory containing the Hostinger release directories.
  releasesRoot: string;
  networkNamespace: string;
  evidenceReference: string;
  approvedBy: string;
  validUntil: string;
  controls: {
    sameHostDatabase: boolean;
    tenantIsolation: boolean;
    databaseAccessRestricted: boolean;
    noForwardingOrTunnel: boolean;
  };
}

// Trust is part of the reviewed release, never supplied through environment,
// request headers or an arbitrary JSON file. No hosting topology is approved.
export const approvedLocalDatabaseDeployments: readonly LocalDatabaseDeployment[] =
  Object.freeze([]);

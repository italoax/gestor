import { isIP } from 'node:net';
import { hostname } from 'node:os';
import { realpathSync, readlinkSync } from 'node:fs';
import { projectRoot } from '../config/paths.ts';
import { approvedLocalDatabaseDeployments } from './localDatabaseDeployments.ts';
import { assertApprovedLocalDatabase } from './localDatabasePolicy.ts';

// mysql2 only performs its hostname check when host is a DNS name. Do not
// silently weaken identity checks for literal IPs (including a matching IP SAN).
export function databaseTls(
  config: Record<string, string | undefined>,
  requireRemote = config.NODE_ENV === 'production',
) {
  return databaseConnection(config, requireRemote).ssl;
}

export function databaseConnection(
  config: Record<string, string | undefined>,
  _requireRemote = true,
) {
  // Do not accept aliases, URLs, injected streams or socket paths as alternative
  // ways around the transport policy. Callers only spread these curated options.
  if (
    config.DB_SOCKET_PATH ||
    config.DB_SOCKET ||
    config.DATABASE_URL ||
    config.DB_URL
  )
    throw new Error(
      'Destino SQL alternativo não suportado pela política de transporte.',
    );
  if (
    config.DB_TRANSPORT &&
    !['tls', 'hostinger-local-tcp'].includes(config.DB_TRANSPORT)
  )
    throw new Error('DB_TRANSPORT inválido.');
  const host = config.DB_HOST || '127.0.0.1';
  if (!/^[a-zA-Z0-9.:-]+$/.test(host)) throw new Error('DB_HOST inválido.');
  const port = Number(config.DB_PORT || 3306);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error('DB_PORT inválida.');
  if (config.DB_SSL !== undefined && !['true', 'false'].includes(config.DB_SSL))
    throw new Error('DB_SSL deve ser true ou false.');
  if (config.DB_TRANSPORT === 'hostinger-local-tcp') {
    assertApprovedLocalDatabase(
      config,
      {
        platform: process.platform,
        hostname: hostname(),
        uid: process.getuid?.() ?? -1,
        effectiveUid: process.geteuid?.() ?? -1,
        gid: process.getgid?.() ?? -1,
        effectiveGid: process.getegid?.() ?? -1,
        applicationRoot: realpathSync(projectRoot),
        networkNamespace:
          process.platform === 'linux' ? readlinkSync('/proc/self/ns/net') : '',
      },
      approvedLocalDatabaseDeployments,
    );
    // Literal destination: no hosts-file/DNS alias can turn localhost remote.
    return { host: '127.0.0.1', port: 3306, ssl: undefined };
  }
  const local = ['127.0.0.1', 'localhost', '::1'].includes(host);
  if (config.DB_SSL !== 'true') {
    if (
      config.NODE_ENV === 'production' ||
      config.MIGRATION_ENVIRONMENT === 'production' ||
      !local ||
      config.DB_TRANSPORT === 'tls'
    )
      throw new Error(
        'Banco de produção ou remoto exige TLS com identidade validada.',
      );
    // Laboratory TCP also uses a literal destination, never resolves localhost.
    return {
      host: host === 'localhost' ? '127.0.0.1' : host,
      port,
      ssl: undefined,
    };
  }
  if (isIP(host))
    throw new Error('TLS SQL exige hostname DNS coberto pelo certificado.');
  return {
    host,
    port,
    ssl: {
      rejectUnauthorized: true,
      verifyIdentity: true,
      minVersion: 'TLSv1.2' as const,
      ...(config.DB_SSL_CA
        ? { ca: config.DB_SSL_CA.replace(/\\n/g, '\n') }
        : {}),
    },
  };
}

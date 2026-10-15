import { isIP } from 'node:net';

// mysql2 only performs its hostname check when host is a DNS name. Do not
// silently weaken identity checks for literal IPs (including a matching IP SAN).
export function databaseTls(
  config: Record<string, string | undefined>,
  requireRemote = config.NODE_ENV === 'production',
) {
  const host = config.DB_HOST || '127.0.0.1';
  const local = ['127.0.0.1', 'localhost', '::1'].includes(host);
  if (config.DB_SSL !== 'true') {
    if (
      config.NODE_ENV === 'production' ||
      config.MIGRATION_ENVIRONMENT === 'production' ||
      (requireRemote && !local)
    )
      throw new Error(
        'Banco de produção ou remoto exige TLS com identidade validada.',
      );
    return undefined;
  }
  if (isIP(host))
    throw new Error('TLS SQL exige hostname DNS coberto pelo certificado.');
  return {
    rejectUnauthorized: true,
    verifyIdentity: true,
    minVersion: 'TLSv1.2' as const,
    ...(config.DB_SSL_CA ? { ca: config.DB_SSL_CA.replace(/\\n/g, '\n') } : {}),
  };
}

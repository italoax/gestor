import { env } from '../../src/config/env.ts';
import { loadVault } from '../../src/security/secretVault.ts';
import { trustedProxyAddresses } from '../../src/security/proxyTrust.ts';
import { statSync } from 'node:fs';
const vault = loadVault();
trustedProxyAddresses(env.trustedProxyCidrs);
const file = process.env.DATA_ENCRYPTION_KEY_FILE;
console.log(
  JSON.stringify(
    {
      environment: env.nodeEnv,
      httpsConfigured: new URL(env.appUrl).protocol === 'https:',
      httpsRedirectConfigured: process.env.ENFORCE_HTTPS === 'true',
      secureCookie: env.cookieSecure,
      persistentSessions: !env.localMode,
      sharedRateLimits:
        env.nodeEnv === 'production' ||
        process.env.SHARED_RATE_LIMITS === 'true',
      databaseTls: Boolean(env.db.ssl),
      databaseLoopback: ['127.0.0.1', 'localhost', '::1'].includes(env.db.host),
      dataEncryptionConfigured: Boolean(vault),
      dataEncryptionRequired: process.env.DATA_ENCRYPTION_REQUIRED === 'true',
      keyFilePermissions: file
        ? process.platform === 'win32'
          ? 'verificar ACL com icacls'
          : (statSync(file).mode & 0o077) === 0
            ? 'restricted'
            : 'too-open'
        : 'not-configured',
      trustedProxyConfigurationValid: true,
      productionInfrastructureVerified: false,
    },
    null,
    2,
  ),
);

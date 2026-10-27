import path from 'node:path';
import { execute, queryOne, withTransaction } from '../db/mysql.ts';
import { runtimeStorage } from '../services/runtimeStorage.ts';
import { createTwoFactorService } from './twoFactor.ts';
import { persistentTwoFactorVault } from './twoFactorVault.ts';
import type { SecretVault } from './secretVault.ts';

let vault: SecretVault | undefined;
export const twoFactor = createTwoFactorService({
  execute,
  queryOne,
  withTransaction,
  vault: (create = false) =>
    (vault ??= persistentTwoFactorVault(
      process.env.TOTP_ENCRYPTION_KEY_FILE ||
        path.join(runtimeStorage().dataRoot, 'secrets', 'totp.keyring.json'),
      create,
    )),
});

import crypto from 'node:crypto';
import { env } from '../config/env.ts';
import {
  dataVault,
  encryptionWrites,
  openStoredSecret,
} from '../security/storedSecrets.ts';
import { isProtectedSecret } from '../security/secretVault.ts';
// O formato v2 usa chaves independentes e versionadas, com contexto por conta.
// A chave derivada de SESSION_SECRET permanece exclusivamente para compatibilidade
// com integra??es legadas durante o rollout. N?o a rotacione antes de migr?-las.
const KEY = crypto
  .createHash('sha256')
  .update(String(env.sessionSecret))
  .digest();
// Formato do valor guardado: base64(iv).base64(authTag).base64(ciphertext)
export function encryptSecret(plain, owner: unknown = 'legacy') {
  if (encryptionWrites)
    return dataVault!.seal(String(plain ?? ''), `integration:${owner}`);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const enc = Buffer.concat([
    cipher.update(String(plain ?? ''), 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [
    iv.toString('base64'),
    tag.toString('base64'),
    enc.toString('base64'),
  ].join('.');
}
export function decryptSecret(stored, owner: unknown = 'legacy') {
  if (!stored) return '';
  if (isProtectedSecret(stored))
    return openStoredSecret(stored, 'integration', owner);
  const parts = String(stored).split('.');
  if (parts.length !== 3) return ''; // valor inválido/legado — trata como vazio
  try {
    const [ivB64, tagB64, dataB64] = parts;
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      KEY,
      Buffer.from(ivB64, 'base64'),
    );
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    const dec = Buffer.concat([
      decipher.update(Buffer.from(dataB64, 'base64')),
      decipher.final(),
    ]);
    return dec.toString('utf8');
  } catch {
    throw new Error(
      'Não foi possível abrir a credencial legada da integração.',
    );
  }
}

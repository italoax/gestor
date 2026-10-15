import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';

export interface KeyringConfig {
  active: string;
  keys: Record<string, string>;
}
const PREFIX = 'gestor:v2:';
export class SecretVault {
  private keys = new Map<string, Buffer>();
  readonly active: string;
  constructor(config: KeyringConfig) {
    this.active = config.active;
    for (const [id, encoded] of Object.entries(config.keys)) {
      const key = Buffer.from(encoded, 'base64');
      if (
        !/^[a-zA-Z0-9_-]{1,40}$/.test(id) ||
        key.length !== 32 ||
        key.toString('base64') !== encoded
      )
        throw new Error('Chave de criptografia inválida.');
      this.keys.set(id, key);
    }
    if (!this.keys.has(this.active))
      throw new Error('Chave ativa de criptografia indisponível.');
  }
  seal(plain: string, context: string) {
    const iv = randomBytes(12);
    const cipher = createCipheriv(
      'aes-256-gcm',
      this.keys.get(this.active)!,
      iv,
    );
    cipher.setAAD(Buffer.from(`${PREFIX}${this.active}:${context}`, 'utf8'));
    const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    return `${PREFIX}${this.active}:${iv.toString('base64url')}:${cipher.getAuthTag().toString('base64url')}:${data.toString('base64url')}`;
  }
  open(stored: string, context: string) {
    try {
      const parts = stored.split(':');
      if (parts.length !== 6 || `${parts[0]}:${parts[1]}:` !== PREFIX)
        throw new Error();
      const [, , id, ivText, tagText, dataText] = parts;
      const key = this.keys.get(id),
        iv = Buffer.from(ivText, 'base64url'),
        tag = Buffer.from(tagText, 'base64url');
      if (!key || iv.length !== 12 || tag.length !== 16) throw new Error();
      const decipher = createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAAD(Buffer.from(`${PREFIX}${id}:${context}`, 'utf8'));
      decipher.setAuthTag(tag);
      return Buffer.concat([
        decipher.update(Buffer.from(dataText, 'base64url')),
        decipher.final(),
      ]).toString('utf8');
    } catch {
      throw new Error(
        'Não foi possível abrir o segredo protegido. Verifique as chaves e a integridade dos dados.',
      );
    }
  }
  rotate(stored: string, context: string) {
    return this.seal(this.open(stored, context), context);
  }
}
export const isProtectedSecret = (value: unknown): value is string =>
  typeof value === 'string' && value.startsWith(PREFIX);
export function loadVault(config = process.env): SecretVault | undefined {
  const raw = config.DATA_ENCRYPTION_KEY_FILE
    ? readFileSync(config.DATA_ENCRYPTION_KEY_FILE, 'utf8')
    : config.DATA_ENCRYPTION_KEYS;
  if (!raw) {
    if (config.DATA_ENCRYPTION_REQUIRED === 'true')
      throw new Error(
        'Configure chaves independentes para a criptografia de dados.',
      );
    return undefined;
  }
  try {
    const parsed = JSON.parse(raw);
    return new SecretVault({
      active: config.DATA_ENCRYPTION_ACTIVE_KEY || parsed.active,
      keys: parsed.keys || parsed,
    });
  } catch {
    throw new Error('Configuração de chaves de dados inválida.');
  }
}

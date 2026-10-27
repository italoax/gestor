import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { SecretVault, loadVault } from './secretVault.ts';

// A chave fica fora do banco e das pastas públicas, no armazenamento persistente.
export function persistentTwoFactorVault(file: string, create = false) {
  if (!create && !fs.existsSync(file))
    throw new Error(
      'A chave privada do autenticador não foi encontrada. Restaure a chave preservada para acessar os autenticadores existentes.',
    );
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const temporary = `${file}.${randomBytes(8).toString('hex')}.tmp`;
  try {
    if (fs.existsSync(file)) return readVault(file);
    const keyring = {
      active: 'totp-v1',
      keys: { 'totp-v1': randomBytes(32).toString('base64') },
    };
    fs.writeFileSync(temporary, JSON.stringify(keyring), {
      flag: 'wx',
      mode: 0o600,
    });
    if (process.platform === 'win32') {
      const user = execFileSync('whoami', {
        encoding: 'utf8',
        windowsHide: true,
      }).trim();
      execFileSync(
        'icacls',
        [
          temporary,
          '/inheritance:r',
          '/grant:r',
          `${user}:(F)`,
          '*S-1-5-18:(F)',
        ],
        { stdio: 'pipe', windowsHide: true },
      );
    }
    // Publica somente depois de restringir as permissões, sem substituir outra chave.
    fs.linkSync(temporary, file);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST')
      throw new Error(
        'Não foi possível preparar a chave privada do autenticador.',
      );
  } finally {
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
  return readVault(file);
}
function readVault(file: string): SecretVault {
  const stat = fs.lstatSync(file);
  if (
    !stat.isFile() ||
    stat.isSymbolicLink() ||
    (process.platform !== 'win32' && (stat.mode & 0o077) !== 0)
  )
    throw new Error(
      'O arquivo da chave do autenticador precisa de permissões privadas.',
    );
  return loadVault({ DATA_ENCRYPTION_KEY_FILE: file })!;
}

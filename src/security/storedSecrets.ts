import { isProtectedSecret, loadVault } from './secretVault.ts';
import '../config/env.ts';
// Leitura dos formatos legados é mantida durante o rollout; ativação exige chave explícita.
export const dataVault = loadVault();
export const encryptionWrites =
  Boolean(dataVault) && process.env.DATA_ENCRYPTION_WRITE !== 'false';
if (process.env.DATA_ENCRYPTION_REQUIRED === 'true' && !encryptionWrites)
  throw new Error('A política exige criptografia para novas gravações.');
export function sealStoredSecret(
  value: string,
  purpose: string,
  owner: unknown,
) {
  return encryptionWrites
    ? dataVault!.seal(value, `${purpose}:${owner}`)
    : value;
}
export function openStoredSecret(
  value: string,
  purpose: string,
  owner: unknown,
) {
  if (!isProtectedSecret(value)) return value;
  if (!dataVault)
    throw new Error('Chave de dados necessária para acessar este registro.');
  return dataVault.open(value, `${purpose}:${owner}`);
}
export const protectIptvPassword = (value: string | null, owner: unknown) =>
  value ? sealStoredSecret(value, 'iptv', owner) : value;
export const revealIptvPassword = (value: unknown, owner: unknown) =>
  openStoredSecret(String(value ?? ''), 'iptv', owner);

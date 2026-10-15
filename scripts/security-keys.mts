import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { SecretVault } from '../src/security/secretVault.ts';
async function main() {
  const args = process.argv.slice(2);
  const arg = (name: string) => {
    const i = args.indexOf(name);
    return i < 0 ? undefined : args[i + 1];
  };
  const file = arg('--file'),
    previous = arg('--from'),
    id = arg('--id') || 'key-' + randomBytes(8).toString('hex');
  if (!file)
    throw new Error(
      'Informe --file em diretório protegido, separado do banco e do repositório. Use --from para preservar as chaves anteriores na rotação.',
    );
  const keys = previous ? JSON.parse(readFileSync(previous, 'utf8')).keys : {};
  if (!keys || typeof keys !== 'object' || Object.hasOwn(keys, id))
    throw new Error('Identificador de chave inválido ou já existente.');
  const keyring = {
    active: id,
    keys: { ...keys, [id]: randomBytes(32).toString('base64') },
  };
  const vault = new SecretVault(keyring);
  const proof = vault.seal('recovery-check', 'key-generation');
  if (vault.open(proof, 'key-generation') !== 'recovery-check')
    throw new Error('Falha na verificação da chave.');
  writeFileSync(file, JSON.stringify(keyring, null, 2), {
    mode: 0o600,
    flag: 'wx',
  });
  if (process.platform === 'win32') {
    try {
      const user = execFileSync('whoami', {
        encoding: 'utf8',
        windowsHide: true,
      }).trim();
      execFileSync(
        'icacls',
        [file, '/inheritance:r', '/grant:r', `${user}:(F)`, '*S-1-5-18:(F)'],
        { stdio: 'pipe', windowsHide: true },
      );
    } catch {
      unlinkSync(file);
      throw new Error(
        'Não foi possível restringir a ACL do novo arquivo de chaves.',
      );
    }
  }
  console.log(
    JSON.stringify({
      created: true,
      keyId: id,
      retainedKeys: Object.keys(keyring.keys).length - 1,
      recoveryCheck: true,
    }),
  );
}
void main().catch((error) => {
  const code =
    typeof error?.code === 'string' && /^[A-Z0-9_]{1,40}$/.test(error.code)
      ? error.code
      : 'FAILED';
  console.error(
    JSON.stringify({
      event: 'security.command_failed',
      command: 'keys',
      code,
      message:
        'Operação não concluída. Confira o arquivo de configuração, as chaves, o estado do destino e as permissões. Nenhum segredo foi incluído neste log.',
    }),
  );
  process.exitCode = 1;
});

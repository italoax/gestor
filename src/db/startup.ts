import { setTimeout as pause } from 'node:timers/promises';

const temporaryConnectionErrors = new Set([
  'ETIMEDOUT',
  'ECONNREFUSED',
  'ECONNRESET',
  'EAI_AGAIN',
  'PROTOCOL_CONNECTION_LOST',
]);

// Somente a leitura de saúde pode ser repetida. Migrações e outras escritas
// continuam fora deste bloco, para não executar uma operação duas vezes.
export async function waitForDatabase(
  probe: () => Promise<unknown>,
  options: {
    wait?: (milliseconds: number) => Promise<unknown>;
    onRetry?: (attempt: number, code: string, delayMs: number) => void;
  } = {},
) {
  const wait = options.wait ?? pause;
  for (let attempt = 1; ; attempt++) {
    try {
      await probe();
      return;
    } catch (error) {
      const code = String((error as { code?: string })?.code ?? '');
      if (attempt >= 3 || !temporaryConnectionErrors.has(code)) throw error;
      const delayMs = attempt * 1000;
      options.onRetry?.(attempt + 1, code, delayMs);
      await wait(delayMs);
    }
  }
}

export function databaseStartupMessage(error: unknown): string | undefined {
  const code = String((error as { code?: string })?.code ?? '');
  if (['ETIMEDOUT', 'ECONNREFUSED'].includes(code))
    return `Não foi possível conectar ao MySQL (${code}). Confira a conexão de rede, o endereço e a porta do banco e a liberação deste computador no acesso remoto da hospedagem.`;
  if (['ENOTFOUND', 'EAI_AGAIN'].includes(code))
    return `Não foi possível resolver o endereço do MySQL (${code}). Confira o DNS e o DB_HOST.`;
  if (['ECONNRESET', 'PROTOCOL_CONNECTION_LOST'].includes(code))
    return `A conexão com o MySQL foi interrompida (${code}). Confira a rede e a disponibilidade do banco.`;
  if (code === 'ER_ACCESS_DENIED_ERROR')
    return 'O MySQL recusou a autenticação. Confira o usuário, a senha e as permissões de acesso remoto ao banco.';
  if (code === 'ER_BAD_DB_ERROR')
    return 'O banco configurado não existe nesse servidor MySQL. Confira o DB_NAME.';
  if (
    [
      'ERR_TLS_CERT_ALTNAME_INVALID',
      'CERT_HAS_EXPIRED',
      'DEPTH_ZERO_SELF_SIGNED_CERT',
      'SELF_SIGNED_CERT_IN_CHAIN',
      'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
      'HANDSHAKE_NO_SSL_SUPPORT',
    ].includes(code)
  )
    return 'Não foi possível validar a conexão TLS do MySQL. Confira o hostname e o certificado do banco.';
}

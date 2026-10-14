import { mkdtempSync, unlinkSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export function createInternalSockets() {
  if (
    !process.env.LSNODE_SOCKET &&
    process.env.GESTOR_INTERNAL_SOCKETS !== 'true'
  )
    return;
  const directory = mkdtempSync(path.join(tmpdir(), 'gestor-runtime-'));
  const id = randomUUID();
  const endpoint = (name: string) =>
    process.platform === 'win32'
      ? `\\\\.\\pipe\\gestor-${id}-${name}`
      : path.join(directory, `${name}.sock`);
  const backend = endpoint('backend');
  const worker = endpoint('worker');
  return {
    backend,
    worker,
    close() {
      if (process.platform !== 'win32')
        for (const file of [backend, worker]) {
          try {
            unlinkSync(file);
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
          }
        }
      rmdirSync(directory);
    },
  };
}

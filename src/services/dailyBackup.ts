import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { SecretVault } from '../security/secretVault.ts';

export function createDailyBackup({
  directory,
  today,
  generate,
  database,
  vault,
}: {
  directory: string;
  today: () => string;
  generate: () => Promise<string>;
  database: string;
  vault?: Pick<SecretVault, 'seal' | 'open'>;
}) {
  function decode(content: string) {
    if (!vault) return content;
    const artifact = JSON.parse(content);
    if (artifact.version !== 2 || artifact.sourceDatabase !== database)
      throw new Error('Backup incompatível com o banco configurado.');
    return vault.open(artifact.payload, `database-backup:${database}`);
  }

  function complete(content: string) {
    return (
      content.startsWith('-- Backup do gestor') &&
      content.trimEnd().endsWith('SET FOREIGN_KEY_CHECKS=1;')
    );
  }

  function removeOlderBackups(filename: string) {
    // A limpeza só começa depois de confirmar a cópia que será mantida.
    if (
      !complete(decode(fs.readFileSync(path.join(directory, filename), 'utf8')))
    )
      throw new Error(
        'Backup diário não está pronto para substituir o anterior.',
      );
    const date = filename.slice(7, 17);
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const match = /^gestor-(\d{4}-\d{2}-\d{2})\.sql(?:\.enc)?$/.exec(
        entry.name,
      );
      if (
        !entry.isFile() ||
        !match ||
        entry.name === filename ||
        match[1] > date
      )
        continue;
      try {
        fs.unlinkSync(path.join(directory, entry.name));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
    }
  }

  return async function run() {
    const filename = `gestor-${today()}.sql${vault ? '.enc' : ''}`;
    const destination = path.join(directory, filename);
    let existing: string | undefined;
    try {
      existing = fs.readFileSync(destination, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    if (existing !== undefined) {
      let valid = false;
      try {
        valid = complete(decode(existing));
      } catch {
        // Uma cópia truncada ou que não autentica precisa ser refeita.
      }
      if (valid) {
        removeOlderBackups(filename);
        return { gerado: false, arquivo: destination };
      }
      // Preserva a cópia inválida para análise e permite uma nova tentativa.
      try {
        fs.renameSync(destination, `${destination}.invalid-${randomUUID()}`);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
    }

    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    const dump = await generate();
    if (!complete(dump)) throw new Error('Dump SQL incompleto.');
    const content = vault
      ? JSON.stringify({
          version: 2,
          sourceDatabase: database,
          payload: vault.seal(dump, `database-backup:${database}`),
        })
      : dump;
    const temporary = path.join(directory, `.${filename}.${randomUUID()}.tmp`);
    try {
      fs.writeFileSync(temporary, content, {
        encoding: 'utf8',
        mode: 0o600,
        flag: 'wx',
        flush: true,
      });
      if (decode(fs.readFileSync(temporary, 'utf8')) !== dump)
        throw new Error('Backup não passou na verificação de recuperação.');
      try {
        // Publica apenas o arquivo completo, sem sobrescrever outra instância.
        fs.linkSync(temporary, destination);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
        removeOlderBackups(filename);
        return { gerado: false, arquivo: destination };
      }
      removeOlderBackups(filename);
      return { gerado: true, arquivo: destination };
    } finally {
      fs.rmSync(temporary, { force: true });
    }
  };
}

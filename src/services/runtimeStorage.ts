import fs from 'node:fs';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { resolveStoragePaths } from '../config/storagePaths.ts';

type StoragePaths = ReturnType<typeof resolveStoragePaths>;

function exists(file: string) {
  try {
    return fs.lstatSync(file);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
}

function directory(target: string) {
  const current = exists(target);
  if (current) {
    if (!current.isDirectory() || current.isSymbolicLink())
      throw new Error(
        'Armazenamento não aceita diretórios simbólicos ou arquivos.',
      );
    return;
  }
  const parent = path.dirname(target);
  if (parent !== target) directory(parent);
  try {
    fs.mkdirSync(target, { mode: 0o700 });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    directory(target);
  }
}

function fingerprint(file: string) {
  const hash = createHash('sha256');
  const descriptor = fs.openSync(file, 'r');
  try {
    const buffer = Buffer.allocUnsafe(64 * 1024);
    let length: number;
    while ((length = fs.readSync(descriptor, buffer, 0, buffer.length, null)))
      hash.update(buffer.subarray(0, length));
    return hash.digest('hex');
  } finally {
    fs.closeSync(descriptor);
  }
}

function copyMissing(source: string, destination: string): number {
  const sourceStat = exists(source);
  if (!sourceStat) return 0;
  if (!sourceStat.isDirectory() || sourceStat.isSymbolicLink())
    throw new Error(
      'Migração de dados exige uma pasta real, sem links simbólicos.',
    );
  directory(destination);
  let copied = 0;
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const from = path.join(source, entry.name);
    const to = path.join(destination, entry.name);
    if (entry.isSymbolicLink())
      throw new Error('Migração de dados não aceita links simbólicos.');
    if (entry.isDirectory()) {
      copied += copyMissing(from, to);
      continue;
    }
    if (!entry.isFile())
      throw new Error('Migração de dados aceita somente arquivos e pastas.');
    const current = exists(to);
    if (current) {
      if (!current.isFile() || current.isSymbolicLink())
        throw new Error('Destino da migração não é um arquivo regular.');
      // Dados persistentes têm prioridade, inclusive após rollback do código.
      continue;
    }
    const temporary = path.join(destination, '.migrate-' + randomUUID());
    try {
      fs.copyFileSync(from, temporary, fs.constants.COPYFILE_EXCL);
      fs.chmodSync(temporary, 0o600);
      const descriptor = fs.openSync(temporary, 'r+');
      try {
        fs.fsyncSync(descriptor);
      } finally {
        fs.closeSync(descriptor);
      }
      if (fingerprint(from) !== fingerprint(temporary))
        throw new Error('A cópia de migração não passou pela verificação.');
      try {
        // Publica o arquivo completo, sem sobrescrever outra instância.
        fs.linkSync(temporary, to);
        copied++;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      }
    } finally {
      if (exists(temporary)) fs.unlinkSync(temporary);
    }
  }
  return copied;
}

export function prepareRuntimeStorage(storage = resolveStoragePaths()) {
  directory(storage.dataRoot);
  if (storage.dataRoot !== storage.projectRoot) {
    const relative = path.relative(
      fs.realpathSync(storage.projectRoot),
      fs.realpathSync(storage.dataRoot),
    );
    if (
      relative === '' ||
      (!relative.startsWith('..' + path.sep) &&
        relative !== '..' &&
        !path.isAbsolute(relative))
    )
      throw new Error(
        'O armazenamento persistente não pode apontar para o projeto.',
      );
  }
  directory(storage.backups);
  directory(storage.uploads);
  if (storage.dataRoot === storage.projectRoot)
    return { ...storage, copied: 0 };
  const marker = path.join(storage.dataRoot, '.migration-v1.json');
  const markerStat = exists(marker);
  if (markerStat) {
    if (
      !markerStat.isFile() ||
      markerStat.isSymbolicLink() ||
      JSON.parse(fs.readFileSync(marker, 'utf8')).version !== 1
    )
      throw new Error('Registro de migração de dados inválido.');
    return { ...storage, copied: 0 };
  }
  const sources = [storage.projectRoot];
  if (storage.versions && exists(storage.versions)) {
    const previous = fs
      .readdirSync(storage.versions, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && !entry.isSymbolicLink())
      .map((entry) => path.join(storage.versions!, entry.name, 'nodejs'))
      .filter(
        (root) => root !== storage.projectRoot && exists(root)?.isDirectory(),
      )
      .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
    sources.push(...previous);
  }
  let copied = 0;
  if (storage.previousDataRoot) {
    copied += copyMissing(
      path.join(storage.previousDataRoot, 'backups'),
      storage.backups,
    );
    copied += copyMissing(
      path.join(storage.previousDataRoot, 'uploads'),
      storage.uploads,
    );
  }
  for (const source of sources) {
    if (storage.backups !== path.join(source, 'backups'))
      copied += copyMissing(path.join(source, 'backups'), storage.backups);
    if (storage.uploads !== path.join(source, 'public/uploads'))
      copied += copyMissing(
        path.join(source, 'public/uploads'),
        storage.uploads,
      );
  }
  // Só marca a migração depois de verificar todas as cópias. Em reinícios,
  // arquivos removidos pelo usuário não voltam de uma versão antiga.
  const temporary = path.join(storage.dataRoot, '.migrate-' + randomUUID());
  try {
    fs.writeFileSync(temporary, JSON.stringify({ version: 1 }), {
      flag: 'wx',
      mode: 0o600,
      flush: true,
    });
    try {
      fs.linkSync(temporary, marker);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    }
  } finally {
    if (exists(temporary)) fs.unlinkSync(temporary);
  }
  return { ...storage, copied };
}

let prepared: ReturnType<typeof prepareRuntimeStorage> | undefined;
export function runtimeStorage(): StoragePaths {
  prepared ??= prepareRuntimeStorage();
  return prepared;
}

import fs from 'node:fs';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';

import {
  SCHEDULER_HEARTBEAT_MS,
  SCHEDULER_STALE_MS,
  type SchedulerWorkerState as WorkerState,
  type SchedulerHealth,
} from '../shared/schedulerHealth.ts';
interface Heartbeat {
  version: 1;
  startedAt: number;
  heartbeatAt: number;
  checkedAt: number | null;
  state: WorkerState;
}
export interface SchedulerObserver {
  start(): void;
  checking(): void;
  checked(): void;
  idle(): void;
  failed(): void;
  stop(): void;
}

// Versões, www e processos simultâneos do mesmo site compartilham a leitura.
// Outros sites da conta têm diretórios próprios.
export function schedulerHealthDirectory(dataRoot: string, root: string) {
  const site = root.replace(/\\/g, '/').split('/hbuilds/')[0];
  const scope = createHash('sha256').update(site).digest('hex').slice(0, 24);
  return path.join(dataRoot, 'monitoring', 'scheduler', scope);
}

export function createSchedulerHeartbeat({
  directory,
  now = Date.now,
  onError = (_error: unknown) => {},
}: {
  directory: string;
  now?: () => number;
  onError?: (error: unknown) => void;
}): SchedulerObserver {
  const file = path.join(directory, randomUUID() + '.json');
  let timer: ReturnType<typeof setInterval> | undefined;
  let record: Heartbeat | undefined;
  let stopped = false;
  function publish() {
    if (!record) return;
    const temporary = file + '.tmp';
    try {
      fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
      record.heartbeatAt = now();
      fs.writeFileSync(temporary, JSON.stringify(record), { mode: 0o600 });
      fs.renameSync(temporary, file);
    } catch (error) {
      onError(error);
    } finally {
      try {
        fs.unlinkSync(temporary);
      } catch {
        /* já publicado ou não criado */
      }
    }
  }
  function update(state: WorkerState, checked = false) {
    if (!record || stopped) return;
    record.state = state;
    if (checked) record.checkedAt = now();
    publish();
  }
  return {
    start() {
      if (record || stopped) return;
      record = {
        version: 1,
        startedAt: now(),
        heartbeatAt: now(),
        checkedAt: null,
        state: 'starting',
      };
      publish();
      timer = setInterval(publish, SCHEDULER_HEARTBEAT_MS);
      timer.unref();
    },
    checking() {
      update(
        record?.state === 'error'
          ? 'error'
          : record?.checkedAt == null
            ? 'starting'
            : 'running',
      );
    },
    checked() {
      update('running', true);
    },
    idle() {
      update(record?.checkedAt == null ? 'starting' : 'idle');
    },
    failed() {
      update('error');
    },
    stop() {
      if (stopped) return;
      clearInterval(timer);
      update('stopped');
      stopped = true;
    },
  };
}

export async function readSchedulerHealth({
  directory,
  enabled,
  now: fixedNow,
}: {
  directory: string;
  enabled: boolean;
  now?: number;
}): Promise<SchedulerHealth> {
  let now = fixedNow ?? Date.now();
  const result: SchedulerHealth = {
    state: enabled ? 'unconfirmed' : 'disabled',
    lastHeartbeatAt: null,
    lastCheckAt: null,
    serverNow: new Date(now).toISOString(),
    staleAfterMs: SCHEDULER_STALE_MS,
  };
  if (!enabled) return result;
  let files: import('node:fs').Dirent[];
  try {
    files = await fs.promises.readdir(directory, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return result;
    throw error;
  }
  const records: Heartbeat[] = [];
  for (const entry of files) {
    if (!entry.isFile() || !/^[a-f0-9-]{36}\.json$/.test(entry.name)) continue;
    const file = path.join(directory, entry.name);
    try {
      const stat = await fs.promises.lstat(file);
      if (!stat.isFile() || stat.size > 1024) continue;
      const item = JSON.parse(
        await fs.promises.readFile(file, 'utf8'),
      ) as Heartbeat;
      // Uma publicação pode ocorrer enquanto a leitura dos arquivos está em curso.
      now = fixedNow ?? Date.now();
      if (
        !item ||
        item.version !== 1 ||
        !['starting', 'running', 'idle', 'error', 'stopped'].includes(
          item.state,
        ) ||
        !Number.isFinite(item.startedAt) ||
        !Number.isFinite(item.heartbeatAt) ||
        item.startedAt > item.heartbeatAt ||
        item.heartbeatAt > now ||
        (item.checkedAt !== null &&
          (!Number.isFinite(item.checkedAt) ||
            item.checkedAt < item.startedAt ||
            item.checkedAt > item.heartbeatAt))
      )
        continue;
      records.push(item);
      // Arquivos de workers encerrados não crescem indefinidamente entre deploys.
      if (now - stat.mtimeMs > 7 * 86400_000) await fs.promises.unlink(file);
    } catch (error) {
      if (
        error instanceof SyntaxError ||
        (error as NodeJS.ErrnoException).code === 'ENOENT'
      )
        continue;
      throw error;
    }
  }
  records.sort((a, b) => b.heartbeatAt - a.heartbeatAt);
  result.serverNow = new Date(now).toISOString();
  const fresh = (item: Heartbeat) =>
    now - item.heartbeatAt < SCHEDULER_STALE_MS;
  const record =
    records.find(
      (item) =>
        fresh(item) &&
        item.checkedAt !== null &&
        ['idle', 'running'].includes(item.state),
    ) ||
    records.find(fresh) ||
    records[0];
  if (!record) return result;
  result.lastHeartbeatAt = new Date(record.heartbeatAt).toISOString();
  const checkedAt = records.reduce(
    (latest, item) => Math.max(latest, item.checkedAt || 0),
    0,
  );
  result.lastCheckAt = checkedAt ? new Date(checkedAt).toISOString() : null;
  result.state = !fresh(record)
    ? 'stale'
    : record.state === 'starting' &&
        now - record.startedAt >= SCHEDULER_STALE_MS
      ? 'error'
      : record.state;
  return result;
}

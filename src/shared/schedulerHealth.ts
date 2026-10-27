export const SCHEDULER_HEARTBEAT_MS = 20_000;
export const SCHEDULER_STALE_MS = 90_000;
export type SchedulerWorkerState =
  'starting' | 'running' | 'idle' | 'error' | 'stopped';
export interface SchedulerHealth {
  state: SchedulerWorkerState | 'stale' | 'unconfirmed' | 'disabled';
  lastHeartbeatAt: string | null;
  lastCheckAt: string | null;
  serverNow: string;
  staleAfterMs: number;
}

import { env } from '../config/env.ts';
import { projectRoot } from '../config/paths.ts';
import { resolveStoragePaths } from '../config/storagePaths.ts';
import { automationsEnabled } from '../security/automationPolicy.ts';
import { createLogger } from './logger.ts';
import {
  createSchedulerHeartbeat,
  readSchedulerHealth,
  schedulerHealthDirectory,
} from './schedulerHealth.ts';

const logger = createLogger('monitor-agendador');
const directory = () =>
  schedulerHealthDirectory(resolveStoragePaths().dataRoot, projectRoot);
export const createDefaultSchedulerHeartbeat = () =>
  createSchedulerHeartbeat({
    directory: directory(),
    onError: (error) =>
      logger.error('Não foi possível atualizar o sinal do agendador.', error),
  });
export const readDefaultSchedulerHealth = () =>
  readSchedulerHealth({
    directory: directory(),
    enabled: automationsEnabled(env),
  });

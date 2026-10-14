import { Module, type DynamicModule } from '@nestjs/common';
import { RuntimeModule } from './runtime.module.js';
import { HealthModule } from './health/health.module.js';
import { CronModule } from './features/cron/cron.module.js';
import { LifecycleService } from './lifecycle.service.js';
import type { BackendRuntime } from './runtime.js';

@Module({})
export class WorkerModule {
  static register(runtime: BackendRuntime): DynamicModule {
    return {
      module: WorkerModule,
      imports: [RuntimeModule.register(runtime), HealthModule, CronModule],
      providers: [LifecycleService],
    };
  }
}

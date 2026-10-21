import { Module, type DynamicModule } from '@nestjs/common';
import { RuntimeModule } from './runtime.module.ts';
import { HealthModule } from './health/health.module.ts';
import { LifecycleService } from './lifecycle.service.ts';
import type { BackendRuntime } from './runtime.ts';

@Module({})
export class WorkerModule {
  static register(runtime: BackendRuntime): DynamicModule {
    return {
      module: WorkerModule,
      imports: [RuntimeModule.register(runtime), HealthModule],
      providers: [LifecycleService],
    };
  }
}

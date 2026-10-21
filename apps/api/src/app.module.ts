import { Module, type DynamicModule } from '@nestjs/common';
import type { BackendRuntime } from './runtime.ts';
import { RuntimeModule } from './runtime.module.ts';
import { HealthModule } from './health/health.module.ts';
import { LifecycleService } from './lifecycle.service.ts';
import { CatalogModule } from './catalogs/catalog.module.ts';
import { PlansServersModule } from './plans-servers/plans-servers.module.ts';
import { ClientsModule } from './clients/clients.module.ts';
import { AuthModule } from './auth/auth.module.ts';
import { PaymentsModule } from './payments/payments.module.ts';
import { featureModules } from './features/feature-modules.ts';
@Module({})
export class AppModule {
  static register(runtime: BackendRuntime): DynamicModule {
    return {
      module: AppModule,
      imports: [
        RuntimeModule.register(runtime),
        HealthModule,
        CatalogModule,
        PlansServersModule,
        ClientsModule,
        AuthModule,
        PaymentsModule,
        ...featureModules,
      ],
      providers: [LifecycleService],
    };
  }
}

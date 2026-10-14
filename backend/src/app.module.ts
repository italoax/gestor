import { Module, type DynamicModule } from '@nestjs/common';
import type { BackendRuntime } from './runtime.js';
import { RuntimeModule } from './runtime.module.js';
import { HealthModule } from './health/health.module.js';
import { LifecycleService } from './lifecycle.service.js';
import { CatalogModule } from './catalogs/catalog.module.js';
import { PlansServersModule } from './plans-servers/plans-servers.module.js';
import { ClientsModule } from './clients/clients.module.js';
import { AuthModule } from './auth/auth.module.js';
import { PaymentsModule } from './payments/payments.module.js';
import { featureModules } from './features/feature-modules.js';
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

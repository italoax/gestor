import { Module } from '@nestjs/common';
import { PlansServersController } from './plans-servers.controller.ts';
import { PlansService } from './plans.service.ts';
import { ServersService } from './servers.service.ts';
import { PlansServersStore } from './plans-servers.store.ts';
import { CatalogAuthGuard } from '../catalogs/catalog.guard.ts';
import { CatalogExceptionFilter } from '../catalogs/catalog.filter.ts';
@Module({
  controllers: [PlansServersController],
  providers: [
    PlansService,
    ServersService,
    PlansServersStore,
    CatalogAuthGuard,
    CatalogExceptionFilter,
  ],
})
export class PlansServersModule {}

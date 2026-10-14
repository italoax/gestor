import { Module } from '@nestjs/common';
import { PlansServersController } from './plans-servers.controller.js';
import { PlansService } from './plans.service.js';
import { ServersService } from './servers.service.js';
import { PlansServersStore } from './plans-servers.store.js';
import { CatalogAuthGuard } from '../catalogs/catalog.guard.js';
import { CatalogExceptionFilter } from '../catalogs/catalog.filter.js';
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

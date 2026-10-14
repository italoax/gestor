import { Module } from '@nestjs/common';
import { PortalController } from './portal.controller.js';
import { PortalService } from './portal.service.js';
import { CatalogExceptionFilter } from '../../catalogs/catalog.filter.js';
import { ClientsAuthGuard } from '../../clients/clients.guard.js';
import { PortalAuthGuard } from './portal.guard.js';
@Module({
  controllers: [PortalController],
  providers: [
    PortalService,
    CatalogExceptionFilter,
    ClientsAuthGuard,
    PortalAuthGuard,
  ],
})
export class PortalModule {}

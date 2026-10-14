import { Module } from '@nestjs/common';
import { PortalController } from './portal.controller.ts';
import { PortalService } from './portal.service.ts';
import { CatalogExceptionFilter } from '../../catalogs/catalog.filter.ts';
import { ClientsAuthGuard } from '../../clients/clients.guard.ts';
import { PortalAuthGuard } from './portal.guard.ts';
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

import { Module } from '@nestjs/common';
import { ClientsController } from './clients.controller.js';
import { ClientsService } from './clients.service.js';
import { ClientMutationsService } from './client-mutations.service.js';
import { ClientsAuthGuard } from './clients.guard.js';
import { CatalogExceptionFilter } from '../catalogs/catalog.filter.js';
@Module({
  controllers: [ClientsController],
  providers: [
    ClientsService,
    ClientMutationsService,
    ClientsAuthGuard,
    CatalogExceptionFilter,
  ],
})
export class ClientsModule {}

import { Module } from '@nestjs/common';
import { ClientsController } from './clients.controller.ts';
import { ClientsService } from './clients.service.ts';
import { ClientMutationsService } from './client-mutations.service.ts';
import { ClientsAuthGuard } from './clients.guard.ts';
import { CatalogExceptionFilter } from '../catalogs/catalog.filter.ts';
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

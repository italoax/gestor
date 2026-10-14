import { Module } from '@nestjs/common';
import { StatusController } from './status.controller.ts';
import { StatusService } from './status.service.ts';
import { CatalogExceptionFilter } from '../../catalogs/catalog.filter.ts';
import { ClientsAuthGuard } from '../../clients/clients.guard.ts';

@Module({
  controllers: [StatusController],
  providers: [StatusService, CatalogExceptionFilter, ClientsAuthGuard],
})
export class StatusModule {}

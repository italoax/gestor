import { Module } from '@nestjs/common';
import { StatusController } from './status.controller.js';
import { StatusService } from './status.service.js';
import { CatalogExceptionFilter } from '../../catalogs/catalog.filter.js';
import { ClientsAuthGuard } from '../../clients/clients.guard.js';

@Module({
  controllers: [StatusController],
  providers: [StatusService, CatalogExceptionFilter, ClientsAuthGuard],
})
export class StatusModule {}

import { Module } from '@nestjs/common';
import { IntegrationsController } from './integrations.controller.js';
import { IntegrationsService } from './integrations.service.js';
import { CatalogExceptionFilter } from '../../catalogs/catalog.filter.js';
import { ClientsAuthGuard } from '../../clients/clients.guard.js';

@Module({
  controllers: [IntegrationsController],
  providers: [IntegrationsService, CatalogExceptionFilter, ClientsAuthGuard],
})
export class IntegrationsModule {}

import { Module } from '@nestjs/common';
import { IntegrationsController } from './integrations.controller.ts';
import { IntegrationsService } from './integrations.service.ts';
import { CatalogExceptionFilter } from '../../catalogs/catalog.filter.ts';
import { ClientsAuthGuard } from '../../clients/clients.guard.ts';

@Module({
  controllers: [IntegrationsController],
  providers: [IntegrationsService, CatalogExceptionFilter, ClientsAuthGuard],
})
export class IntegrationsModule {}

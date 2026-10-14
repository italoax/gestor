import { Module } from '@nestjs/common';
import { AutomationController } from './automation.controller.js';
import { AutomationService } from './automation.service.js';
import { CatalogExceptionFilter } from '../../catalogs/catalog.filter.js';
import { ClientsAuthGuard } from '../../clients/clients.guard.js';

@Module({
  controllers: [AutomationController],
  providers: [AutomationService, CatalogExceptionFilter, ClientsAuthGuard],
})
export class AutomationModule {}

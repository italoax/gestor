import { Module } from '@nestjs/common';
import { AutomationController } from './automation.controller.ts';
import { AutomationService } from './automation.service.ts';
import { CatalogExceptionFilter } from '../../catalogs/catalog.filter.ts';
import { ClientsAuthGuard } from '../../clients/clients.guard.ts';

@Module({
  controllers: [AutomationController],
  providers: [AutomationService, CatalogExceptionFilter, ClientsAuthGuard],
})
export class AutomationModule {}

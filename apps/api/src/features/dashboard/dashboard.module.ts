import { Module } from '@nestjs/common';
import { DashboardController } from './dashboard.controller.ts';
import { DashboardService } from './dashboard.service.ts';
import { CatalogExceptionFilter } from '../../catalogs/catalog.filter.ts';
import { ClientsAuthGuard } from '../../clients/clients.guard.ts';

@Module({
  controllers: [DashboardController],
  providers: [DashboardService, CatalogExceptionFilter, ClientsAuthGuard],
})
export class DashboardModule {}

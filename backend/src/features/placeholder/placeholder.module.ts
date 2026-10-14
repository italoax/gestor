import { Module } from '@nestjs/common';
import { PlaceholderController } from './placeholder.controller.js';
import { PlaceholderService } from './placeholder.service.js';
import { CatalogExceptionFilter } from '../../catalogs/catalog.filter.js';
import { ClientsAuthGuard } from '../../clients/clients.guard.js';

@Module({
  controllers: [PlaceholderController],
  providers: [PlaceholderService, CatalogExceptionFilter, ClientsAuthGuard],
})
export class PlaceholderModule {}

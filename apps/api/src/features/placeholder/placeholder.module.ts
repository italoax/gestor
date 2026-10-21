import { Module } from '@nestjs/common';
import { PlaceholderController } from './placeholder.controller.ts';
import { PlaceholderService } from './placeholder.service.ts';
import { CatalogExceptionFilter } from '../../catalogs/catalog.filter.ts';
import { ClientsAuthGuard } from '../../clients/clients.guard.ts';

@Module({
  controllers: [PlaceholderController],
  providers: [PlaceholderService, CatalogExceptionFilter, ClientsAuthGuard],
})
export class PlaceholderModule {}

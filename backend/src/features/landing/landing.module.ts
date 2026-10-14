import { Module } from '@nestjs/common';
import { LandingController } from './landing.controller.js';
import { LandingService } from './landing.service.js';
import { CatalogExceptionFilter } from '../../catalogs/catalog.filter.js';
import { ClientsAuthGuard } from '../../clients/clients.guard.js';

@Module({
  controllers: [LandingController],
  providers: [LandingService, CatalogExceptionFilter, ClientsAuthGuard],
})
export class LandingModule {}

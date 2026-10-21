import { Module } from '@nestjs/common';
import { LandingController } from './landing.controller.ts';
import { LandingService } from './landing.service.ts';
import { CatalogExceptionFilter } from '../../catalogs/catalog.filter.ts';
import { ClientsAuthGuard } from '../../clients/clients.guard.ts';

@Module({
  controllers: [LandingController],
  providers: [LandingService, CatalogExceptionFilter, ClientsAuthGuard],
})
export class LandingModule {}

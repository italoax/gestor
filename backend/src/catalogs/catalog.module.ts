import { Module } from '@nestjs/common';
import { CatalogController } from './catalog.controller.js';
import { CatalogService } from './catalog.service.js';
import { CatalogAuthGuard } from './catalog.guard.js';
import { CatalogExceptionFilter } from './catalog.filter.js';
@Module({
  controllers: [CatalogController],
  providers: [CatalogService, CatalogAuthGuard, CatalogExceptionFilter],
})
export class CatalogModule {}

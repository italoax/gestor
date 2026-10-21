import { Module } from '@nestjs/common';
import { CatalogController } from './catalog.controller.ts';
import { CatalogService } from './catalog.service.ts';
import { CatalogAuthGuard } from './catalog.guard.ts';
import { CatalogExceptionFilter } from './catalog.filter.ts';
@Module({
  controllers: [CatalogController],
  providers: [CatalogService, CatalogAuthGuard, CatalogExceptionFilter],
})
export class CatalogModule {}

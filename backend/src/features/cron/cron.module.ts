import { Module } from '@nestjs/common';
import { CronController } from './cron.controller.js';
import { CronService } from './cron.service.js';
import { CatalogExceptionFilter } from '../../catalogs/catalog.filter.js';
import { ClientsAuthGuard } from '../../clients/clients.guard.js';

@Module({
  controllers: [CronController],
  providers: [CronService, CatalogExceptionFilter, ClientsAuthGuard],
})
export class CronModule {}

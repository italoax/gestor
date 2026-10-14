import { Module } from '@nestjs/common';
import { CronController } from './cron.controller.ts';
import { CronService } from './cron.service.ts';
import { CatalogExceptionFilter } from '../../catalogs/catalog.filter.ts';
import { ClientsAuthGuard } from '../../clients/clients.guard.ts';

@Module({
  controllers: [CronController],
  providers: [CronService, CatalogExceptionFilter, ClientsAuthGuard],
})
export class CronModule {}

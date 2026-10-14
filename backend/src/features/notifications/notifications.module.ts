import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller.ts';
import { NotificationsService } from './notifications.service.ts';
import { CatalogExceptionFilter } from '../../catalogs/catalog.filter.ts';
import { ClientsAuthGuard } from '../../clients/clients.guard.ts';

@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService, CatalogExceptionFilter, ClientsAuthGuard],
})
export class NotificationsModule {}

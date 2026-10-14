import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller.js';
import { NotificationsService } from './notifications.service.js';
import { CatalogExceptionFilter } from '../../catalogs/catalog.filter.js';
import { ClientsAuthGuard } from '../../clients/clients.guard.js';

@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService, CatalogExceptionFilter, ClientsAuthGuard],
})
export class NotificationsModule {}

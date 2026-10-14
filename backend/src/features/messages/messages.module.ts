import { Module } from '@nestjs/common';
import { MessagesController } from './messages.controller.js';
import { MessagesService } from './messages.service.js';
import { CatalogExceptionFilter } from '../../catalogs/catalog.filter.js';
import { ClientsAuthGuard } from '../../clients/clients.guard.js';

@Module({
  controllers: [MessagesController],
  providers: [MessagesService, CatalogExceptionFilter, ClientsAuthGuard],
})
export class MessagesModule {}

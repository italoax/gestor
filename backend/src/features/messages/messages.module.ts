import { Module } from '@nestjs/common';
import { MessagesController } from './messages.controller.ts';
import { MessagesService } from './messages.service.ts';
import { CatalogExceptionFilter } from '../../catalogs/catalog.filter.ts';
import { ClientsAuthGuard } from '../../clients/clients.guard.ts';

@Module({
  controllers: [MessagesController],
  providers: [MessagesService, CatalogExceptionFilter, ClientsAuthGuard],
})
export class MessagesModule {}

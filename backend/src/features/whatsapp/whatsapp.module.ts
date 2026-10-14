import { Module } from '@nestjs/common';
import { WhatsappController } from './whatsapp.controller.js';
import { WhatsappService } from './whatsapp.service.js';
import { CatalogExceptionFilter } from '../../catalogs/catalog.filter.js';
import { ClientsAuthGuard } from '../../clients/clients.guard.js';

@Module({
  controllers: [WhatsappController],
  providers: [WhatsappService, CatalogExceptionFilter, ClientsAuthGuard],
})
export class WhatsappModule {}

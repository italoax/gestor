import { Module } from '@nestjs/common';
import { WhatsappController } from './whatsapp.controller.ts';
import { WhatsappService } from './whatsapp.service.ts';
import { CatalogExceptionFilter } from '../../catalogs/catalog.filter.ts';
import { ClientsAuthGuard } from '../../clients/clients.guard.ts';

@Module({
  controllers: [WhatsappController],
  providers: [WhatsappService, CatalogExceptionFilter, ClientsAuthGuard],
})
export class WhatsappModule {}

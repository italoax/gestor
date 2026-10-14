import { Module } from '@nestjs/common';
import { PushController } from './push.controller.js';
import { PushService } from './push.service.js';
import { CatalogExceptionFilter } from '../../catalogs/catalog.filter.js';
import { ClientsAuthGuard } from '../../clients/clients.guard.js';

@Module({
  controllers: [PushController],
  providers: [PushService, CatalogExceptionFilter, ClientsAuthGuard],
})
export class PushModule {}

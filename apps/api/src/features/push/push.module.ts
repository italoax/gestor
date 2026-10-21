import { Module } from '@nestjs/common';
import { PushController } from './push.controller.ts';
import { PushService } from './push.service.ts';
import { CatalogExceptionFilter } from '../../catalogs/catalog.filter.ts';
import { ClientsAuthGuard } from '../../clients/clients.guard.ts';

@Module({
  controllers: [PushController],
  providers: [PushService, CatalogExceptionFilter, ClientsAuthGuard],
})
export class PushModule {}

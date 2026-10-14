import { Module } from '@nestjs/common';
import { AccountController } from './account.controller.js';
import { AccountService } from './account.service.js';
import { CatalogExceptionFilter } from '../../catalogs/catalog.filter.js';
import { ClientsAuthGuard } from '../../clients/clients.guard.js';

@Module({
  controllers: [AccountController],
  providers: [AccountService, CatalogExceptionFilter, ClientsAuthGuard],
})
export class AccountModule {}

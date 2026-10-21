import { Module } from '@nestjs/common';
import { AccountController } from './account.controller.ts';
import { AccountService } from './account.service.ts';
import { CatalogExceptionFilter } from '../../catalogs/catalog.filter.ts';
import { ClientsAuthGuard } from '../../clients/clients.guard.ts';

@Module({
  controllers: [AccountController],
  providers: [AccountService, CatalogExceptionFilter, ClientsAuthGuard],
})
export class AccountModule {}

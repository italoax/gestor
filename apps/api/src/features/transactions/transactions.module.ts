import { Module } from '@nestjs/common';
import { TransactionsController } from './transactions.controller.ts';
import { TransactionsService } from './transactions.service.ts';
import { CatalogExceptionFilter } from '../../catalogs/catalog.filter.ts';
import { ClientsAuthGuard } from '../../clients/clients.guard.ts';

@Module({
  controllers: [TransactionsController],
  providers: [TransactionsService, CatalogExceptionFilter, ClientsAuthGuard],
})
export class TransactionsModule {}

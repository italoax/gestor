import { Module } from '@nestjs/common';
import { TransactionsController } from './transactions.controller.js';
import { TransactionsService } from './transactions.service.js';
import { CatalogExceptionFilter } from '../../catalogs/catalog.filter.js';
import { ClientsAuthGuard } from '../../clients/clients.guard.js';

@Module({
  controllers: [TransactionsController],
  providers: [TransactionsService, CatalogExceptionFilter, ClientsAuthGuard],
})
export class TransactionsModule {}

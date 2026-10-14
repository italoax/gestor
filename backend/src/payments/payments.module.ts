import { Module } from '@nestjs/common';
import { PaymentsController } from './payments.controller.ts';
import { PaymentsService } from './payments.service.ts';
import { CatalogExceptionFilter } from '../catalogs/catalog.filter.ts';
import { ClientsAuthGuard } from '../clients/clients.guard.ts';
import { PaymentConfirmationController } from './payment-confirmation.controller.ts';
@Module({
  controllers: [PaymentsController, PaymentConfirmationController],
  providers: [PaymentsService, CatalogExceptionFilter, ClientsAuthGuard],
})
export class PaymentsModule {}

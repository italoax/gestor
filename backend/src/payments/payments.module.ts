import { Module } from '@nestjs/common';
import { PaymentsController } from './payments.controller.js';
import { PaymentsService } from './payments.service.js';
import { CatalogExceptionFilter } from '../catalogs/catalog.filter.js';
import { ClientsAuthGuard } from '../clients/clients.guard.js';
import { PaymentConfirmationController } from './payment-confirmation.controller.js';
@Module({
  controllers: [PaymentsController, PaymentConfirmationController],
  providers: [PaymentsService, CatalogExceptionFilter, ClientsAuthGuard],
})
export class PaymentsModule {}

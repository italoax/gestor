import { Module } from '@nestjs/common';
import { PaymentSettingsController } from './payment-settings.controller.js';
import { PaymentSettingsService } from './payment-settings.service.js';
import { CatalogExceptionFilter } from '../../catalogs/catalog.filter.js';
import { ClientsAuthGuard } from '../../clients/clients.guard.js';

@Module({
  controllers: [PaymentSettingsController],
  providers: [PaymentSettingsService, CatalogExceptionFilter, ClientsAuthGuard],
})
export class PaymentSettingsModule {}

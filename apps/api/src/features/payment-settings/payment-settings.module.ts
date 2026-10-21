import { Module } from '@nestjs/common';
import { PaymentSettingsController } from './payment-settings.controller.ts';
import { PaymentSettingsService } from './payment-settings.service.ts';
import { CatalogExceptionFilter } from '../../catalogs/catalog.filter.ts';
import { ClientsAuthGuard } from '../../clients/clients.guard.ts';

@Module({
  controllers: [PaymentSettingsController],
  providers: [PaymentSettingsService, CatalogExceptionFilter, ClientsAuthGuard],
})
export class PaymentSettingsModule {}

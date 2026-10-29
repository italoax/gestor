import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller.ts';
import { AuthService } from './auth.service.ts';
import { TwoFactorController } from './two-factor.controller.ts';
import { SessionConfirmationController } from './session-confirmation.controller.ts';
import { CatalogExceptionFilter } from '../catalogs/catalog.filter.ts';
@Module({
  controllers: [
    AuthController,
    TwoFactorController,
    SessionConfirmationController,
  ],
  providers: [AuthService, CatalogExceptionFilter],
})
export class AuthModule {}

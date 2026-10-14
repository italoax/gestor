import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller.ts';
import { AuthService } from './auth.service.ts';
import { CatalogExceptionFilter } from '../catalogs/catalog.filter.ts';
@Module({
  controllers: [AuthController],
  providers: [AuthService, CatalogExceptionFilter],
})
export class AuthModule {}

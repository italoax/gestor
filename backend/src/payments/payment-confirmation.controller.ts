import {
  Controller,
  Post,
  Req,
  Res,
  Inject,
  UseGuards,
  UseFilters,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { PaymentsService } from './payments.service.js';
import { ClientsAuthGuard } from '../clients/clients.guard.js';
import { CatalogExceptionFilter } from '../catalogs/catalog.filter.js';
interface PanelRequest extends Request {
  session: { user: { id: number } };
}
@Controller('pagamentos')
@UseGuards(ClientsAuthGuard)
@UseFilters(CatalogExceptionFilter)
export class PaymentConfirmationController {
  constructor(
    @Inject(PaymentsService) private readonly payments: PaymentsService,
  ) {}
  @Post(':id/confirmar-renovacao')
  async confirm(@Req() request: PanelRequest, @Res() response: Response) {
    const result = await this.payments.confirm(
      request.session.user.id,
      String(request.params.id),
    );
    return response.status(result.status).json(result.data);
  }
}

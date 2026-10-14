import {
  Controller,
  Get,
  Post,
  Req,
  Res,
  Inject,
  UseFilters,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { PaymentsService } from './payments.service.js';
import type { PaymentResponse } from './payments.types.js';
import { CatalogExceptionFilter } from '../catalogs/catalog.filter.js';
@Controller()
@UseFilters(CatalogExceptionFilter)
export class PaymentsController {
  constructor(
    @Inject(PaymentsService) private readonly payments: PaymentsService,
  ) {}
  private send(response: Response, result: PaymentResponse) {
    response
      .set('Cache-Control', 'no-store')
      .set('Referrer-Policy', 'no-referrer')
      .status(result.status);
    if (result.kind === 'view')
      return response.render(result.view, result.data);
    if (result.kind === 'redirect')
      return response.redirect(result.status, result.path);
    return response.json(result.data);
  }
  @Get('r/:alias')
  async alias(@Req() request: Request, @Res() response: Response) {
    response
      .set('Cache-Control', 'no-store')
      .set('Referrer-Policy', 'no-referrer');
    return this.send(
      response,
      await this.payments.alias(String(request.params.alias)),
    );
  }
  @Get(['pagar/:token', 'p/:token'])
  async page(@Req() request: Request, @Res() response: Response) {
    return this.send(
      response,
      await this.payments.page(
        String(request.params.token),
        request.path.startsWith('/p/'),
        request.query,
      ),
    );
  }
  @Post('pagar/:token/criar')
  async create(@Req() request: Request, @Res() response: Response) {
    return this.send(
      response,
      await this.payments.create(
        String(request.params.token),
        request.body ?? {},
      ),
    );
  }
  @Get('pagar/:token/status/:pagamentoId')
  async status(@Req() request: Request, @Res() response: Response) {
    return this.send(
      response,
      await this.payments.status(
        String(request.params.token),
        String(request.params.pagamentoId),
      ),
    );
  }
  @Post([
    'webhook/mercadopago',
    'webhook/asaas',
    'webhook/openpix',
    'webhook/pagbank',
    'webhook/pagarme',
  ])
  async webhook(@Req() request: Request, @Res() response: Response) {
    const provider = request.path
      .replace(/\/$/, '')
      .split('/')
      .at(-1)!
      .toLowerCase();
    await this.payments.webhook(provider, request.body ?? {});
    return response.sendStatus(200);
  }
}

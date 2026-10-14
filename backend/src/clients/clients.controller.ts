import {
  Controller,
  Get,
  Post,
  Req,
  Res,
  Inject,
  UseGuards,
  UseFilters,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { ClientsService } from './clients.service.js';
import { ClientMutationsService } from './client-mutations.service.js';
import { ClientsAuthGuard } from './clients.guard.js';
import { CatalogExceptionFilter } from '../catalogs/catalog.filter.js';
import { createClientPageData } from '../../../src/services/clientPageData.js';
interface ClientsRequest extends Request {
  session: { user: { id: number; name: string; isAdmin?: boolean } };
  flash(type: string, message?: string): string[];
}
@Controller()
@UseGuards(ClientsAuthGuard)
@UseFilters(CatalogExceptionFilter)
export class ClientsController {
  constructor(
    @Inject(ClientsService) private readonly clients: ClientsService,
    @Inject(ClientMutationsService)
    private readonly mutations: ClientMutationsService,
  ) {}
  @Get(['clientes', 'api/clientes'])
  async list(@Req() request: ClientsRequest, @Res() response: Response) {
    const page = {
      ...(await this.clients.list(
        request.session.user.id,
        request.query.arquivados,
      )),
      noticeSuccess: request.flash('modal-success'),
      noticeError: request.flash('modal-error'),
    };
    response.set('Cache-Control', 'no-store');
    if (request.path === '/api/clientes') {
      const { id, name, isAdmin } = request.session.user;
      return response.json({
        page: createClientPageData({
          ...page,
          csrfToken: response.locals.csrfToken,
        }),
        user: { id, name, isAdmin: Boolean(isAdmin) },
        title: page.title,
        subtitle: page.subtitle,
        success: response.locals.success || [],
        error: response.locals.error || [],
      });
    }
    return response.render('pages/clientes', page);
  }
  @Post('clientes')
  async save(@Req() request: ClientsRequest, @Res() response: Response) {
    const result = await this.mutations.save(
      request.session.user.id,
      request.body ?? {},
    );
    for (const notice of result.notices)
      request.flash(notice.type, notice.message);
    return response.redirect(result.redirect);
  }
  @Get('clientes/:id/planos-renovacao')
  async renewalOptions(
    @Req() request: ClientsRequest,
    @Res() response: Response,
  ) {
    const result = await this.clients.renewalOptions(
      request.session.user.id,
      request.params.id,
    );
    response.set('Cache-Control', 'no-store');
    return result ? response.json(result) : response.sendStatus(404);
  }
  @Get('clientes/preferencias/mensagem-pagamento')
  async preference(@Req() request: ClientsRequest, @Res() response: Response) {
    return response
      .set('Cache-Control', 'no-store')
      .json(await this.clients.paymentPreference(request.session.user.id));
  }
  @Post('clientes/preferencias/mensagem-pagamento')
  async savePreference(
    @Req() request: ClientsRequest,
    @Res() response: Response,
  ) {
    const result = await this.clients.savePaymentPreference(
      request.session.user.id,
      request.body?.mensagemId,
    );
    return response.status(result.status).json(result.data);
  }
  @Get('clientes/:id/link-pagamento')
  async link(@Req() request: ClientsRequest, @Res() response: Response) {
    const result = await this.clients.paymentLink(
      request.session.user.id,
      request.params.id,
    );
    return response
      .set('Cache-Control', 'no-store')
      .status(result.status)
      .json(result.data);
  }
}

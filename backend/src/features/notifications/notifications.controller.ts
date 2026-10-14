import {
  Controller,
  Get,
  Post,
  Inject,
  Req,
  Res,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { CatalogExceptionFilter } from '../../catalogs/catalog.filter.js';
import { ClientsAuthGuard } from '../../clients/clients.guard.js';
import { NotificationsService } from './notifications.service.js';
import { workflowInput, sendWorkflowResponse } from '../workflow.http.js';
@Controller()
@UseFilters(CatalogExceptionFilter)
@UseGuards(ClientsAuthGuard)
export class NotificationsController {
  constructor(
    @Inject(NotificationsService)
    private readonly service: NotificationsService,
  ) {}
  @Get('/avisos')
  async overview(@Req() request: Request, @Res() response: Response) {
    sendWorkflowResponse(
      response,
      await this.service.overview(workflowInput(request, response)),
    );
  }
  @Get('/notificacoes')
  async list(@Req() request: Request, @Res() response: Response) {
    sendWorkflowResponse(
      response,
      await this.service.list(workflowInput(request, response)),
    );
  }
  @Post('/notificacoes/marcar-todas-lidas')
  async readAll(@Req() request: Request, @Res() response: Response) {
    sendWorkflowResponse(
      response,
      await this.service.readAll(workflowInput(request, response)),
    );
  }
  @Post('/notificacoes/:id/lida')
  async read(@Req() request: Request, @Res() response: Response) {
    sendWorkflowResponse(
      response,
      await this.service.read(workflowInput(request, response)),
    );
  }
  @Post('/notificacoes/:id/excluir')
  async remove(@Req() request: Request, @Res() response: Response) {
    sendWorkflowResponse(
      response,
      await this.service.remove(workflowInput(request, response)),
    );
  }
  @Post('/notificacoes/limpar')
  async clear(@Req() request: Request, @Res() response: Response) {
    sendWorkflowResponse(
      response,
      await this.service.clear(workflowInput(request, response)),
    );
  }
}

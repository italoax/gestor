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
import { CatalogExceptionFilter } from '../../catalogs/catalog.filter.ts';
import { ClientsAuthGuard } from '../../clients/clients.guard.ts';
import { AutomationService } from './automation.service.ts';
import { workflowInput, sendWorkflowResponse } from '../workflow.http.ts';
@Controller()
@UseFilters(CatalogExceptionFilter)
@UseGuards(ClientsAuthGuard)
export class AutomationController {
  constructor(
    @Inject(AutomationService) private readonly service: AutomationService,
  ) {}
  @Get('/api/automacao/status')
  async status(@Res() response: Response) {
    response.set('Cache-Control', 'no-store').json(await this.service.status());
  }
  @Get('/automacao')
  async list(@Req() request: Request, @Res() response: Response) {
    sendWorkflowResponse(
      response,
      await this.service.list(workflowInput(request, response)),
    );
  }
  @Get('/api/automacao/central')
  async monitor(@Req() request: Request, @Res() response: Response) {
    sendWorkflowResponse(
      response,
      await this.service.monitor(workflowInput(request, response)),
    );
  }
  @Post('/automacao')
  async change(@Req() request: Request, @Res() response: Response) {
    sendWorkflowResponse(
      response,
      await this.service.change(workflowInput(request, response)),
    );
  }
  @Post('/api/automacao/previa')
  async preview(@Req() request: Request, @Res() response: Response) {
    sendWorkflowResponse(
      response,
      await this.service.preview(workflowInput(request, response)),
    );
  }
  @Get('/automacao/regra/:id/recebedores')
  async recipients(@Req() request: Request, @Res() response: Response) {
    sendWorkflowResponse(
      response,
      await this.service.recipients(workflowInput(request, response)),
    );
  }
  @Get('/automacao/clientes')
  async clients(@Req() request: Request, @Res() response: Response) {
    sendWorkflowResponse(
      response,
      await this.service.clients(workflowInput(request, response)),
    );
  }
}

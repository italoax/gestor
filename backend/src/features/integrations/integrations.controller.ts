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
import { IntegrationsService } from './integrations.service.js';
import { workflowInput, sendWorkflowResponse } from '../workflow.http.js';
@Controller()
@UseFilters(CatalogExceptionFilter)
@UseGuards(ClientsAuthGuard)
export class IntegrationsController {
  constructor(
    @Inject(IntegrationsService) private readonly service: IntegrationsService,
  ) {}
  @Get('/integracoes')
  async list(@Req() request: Request, @Res() response: Response) {
    sendWorkflowResponse(
      response,
      await this.service.list(workflowInput(request, response)),
    );
  }
  @Post('/integracoes')
  async change(@Req() request: Request, @Res() response: Response) {
    sendWorkflowResponse(
      response,
      await this.service.change(workflowInput(request, response)),
    );
  }
}

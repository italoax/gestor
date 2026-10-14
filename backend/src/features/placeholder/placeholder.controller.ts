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
import { PlaceholderService } from './placeholder.service.js';
import { workflowInput, sendWorkflowResponse } from '../workflow.http.js';
@Controller()
@UseFilters(CatalogExceptionFilter)
@UseGuards(ClientsAuthGuard)
export class PlaceholderController {
  constructor(
    @Inject(PlaceholderService) private readonly service: PlaceholderService,
  ) {}
  @Get('/em-breve/:slug')
  async page(@Req() request: Request, @Res() response: Response) {
    sendWorkflowResponse(
      response,
      await this.service.page(workflowInput(request, response)),
    );
  }
}

import {
  Controller,
  Get,
  Inject,
  Req,
  Res,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { CatalogExceptionFilter } from '../../catalogs/catalog.filter.ts';
import { ClientsAuthGuard } from '../../clients/clients.guard.ts';
import { PlaceholderService } from './placeholder.service.ts';
import { workflowInput, sendWorkflowResponse } from '../workflow.http.ts';
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

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
import { DashboardService } from './dashboard.service.ts';
import { workflowInput, sendWorkflowResponse } from '../workflow.http.ts';
@Controller()
@UseFilters(CatalogExceptionFilter)
@UseGuards(ClientsAuthGuard)
export class DashboardController {
  constructor(
    @Inject(DashboardService) private readonly service: DashboardService,
  ) {}
  @Get('/dashboard')
  async overview(@Req() request: Request, @Res() response: Response) {
    sendWorkflowResponse(
      response,
      await this.service.overview(workflowInput(request, response)),
    );
  }
}

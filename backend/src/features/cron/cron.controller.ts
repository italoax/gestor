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
import { CronService } from './cron.service.js';
import { workflowInput, sendWorkflowResponse } from '../workflow.http.js';
@Controller()
@UseFilters(CatalogExceptionFilter)
export class CronController {
  constructor(@Inject(CronService) private readonly service: CronService) {}
  @Get('/__cron/cobrancas')
  async run(@Req() request: Request, @Res() response: Response) {
    sendWorkflowResponse(
      response,
      await this.service.run(workflowInput(request, response)),
    );
  }
}

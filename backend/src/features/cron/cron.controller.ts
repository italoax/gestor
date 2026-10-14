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
import { CronService } from './cron.service.ts';
import { workflowInput, sendWorkflowResponse } from '../workflow.http.ts';
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

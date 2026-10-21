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
import { TransactionsService } from './transactions.service.ts';
import { workflowInput, sendWorkflowResponse } from '../workflow.http.ts';
@Controller()
@UseFilters(CatalogExceptionFilter)
@UseGuards(ClientsAuthGuard)
export class TransactionsController {
  constructor(
    @Inject(TransactionsService) private readonly service: TransactionsService,
  ) {}
  @Get('/transacoes')
  async list(@Req() request: Request, @Res() response: Response) {
    sendWorkflowResponse(
      response,
      await this.service.list(workflowInput(request, response)),
    );
  }
  @Post('/transacoes')
  async change(@Req() request: Request, @Res() response: Response) {
    sendWorkflowResponse(
      response,
      await this.service.change(workflowInput(request, response)),
    );
  }
}

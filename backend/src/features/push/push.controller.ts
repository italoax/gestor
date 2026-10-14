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
import { PushService } from './push.service.ts';
import { workflowInput, sendWorkflowResponse } from '../workflow.http.ts';
@Controller()
@UseFilters(CatalogExceptionFilter)
@UseGuards(ClientsAuthGuard)
export class PushController {
  constructor(@Inject(PushService) private readonly service: PushService) {}
  @Get('/push/public-key')
  async publicKey(@Req() request: Request, @Res() response: Response) {
    sendWorkflowResponse(
      response,
      await this.service.publicKey(workflowInput(request, response)),
    );
  }
  @Post('/push/subscribe')
  async subscribe(@Req() request: Request, @Res() response: Response) {
    sendWorkflowResponse(
      response,
      await this.service.subscribe(workflowInput(request, response)),
    );
  }
  @Post('/push/unsubscribe')
  async unsubscribe(@Req() request: Request, @Res() response: Response) {
    sendWorkflowResponse(
      response,
      await this.service.unsubscribe(workflowInput(request, response)),
    );
  }
}

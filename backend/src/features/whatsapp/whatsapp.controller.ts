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
import { WhatsappService } from './whatsapp.service.js';
import { workflowInput, sendWorkflowResponse } from '../workflow.http.js';
@Controller()
@UseFilters(CatalogExceptionFilter)
@UseGuards(ClientsAuthGuard)
export class WhatsappController {
  constructor(
    @Inject(WhatsappService) private readonly service: WhatsappService,
  ) {}
  @Get('/whatsapp')
  async list(@Req() request: Request, @Res() response: Response) {
    sendWorkflowResponse(
      response,
      await this.service.list(workflowInput(request, response)),
    );
  }
  @Post('/whatsapp')
  async change(@Req() request: Request, @Res() response: Response) {
    sendWorkflowResponse(
      response,
      await this.service.change(workflowInput(request, response)),
    );
  }
  @Get('/whatsapp/status')
  async status(@Req() request: Request, @Res() response: Response) {
    sendWorkflowResponse(
      response,
      await this.service.status(workflowInput(request, response)),
    );
  }
  @Post('/whatsapp/device/:id/:op')
  async device(@Req() request: Request, @Res() response: Response) {
    sendWorkflowResponse(
      response,
      await this.service.device(workflowInput(request, response)),
    );
  }
}

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
import { StatusService } from './status.service.ts';
import { workflowInput, sendWorkflowResponse } from '../workflow.http.ts';
@Controller()
@UseFilters(CatalogExceptionFilter)
@UseGuards(ClientsAuthGuard)
export class StatusController {
  constructor(@Inject(StatusService) private readonly service: StatusService) {}
  @Get('/status/:id/imagem')
  async image(@Req() request: Request, @Res() response: Response) {
    sendWorkflowResponse(
      response,
      await this.service.image(workflowInput(request, response)),
    );
  }
  @Get('/status/historico')
  async history(@Req() request: Request, @Res() response: Response) {
    sendWorkflowResponse(
      response,
      await this.service.history(workflowInput(request, response)),
    );
  }
  @Get('/status')
  async list(@Req() request: Request, @Res() response: Response) {
    sendWorkflowResponse(
      response,
      await this.service.list(workflowInput(request, response)),
    );
  }
  @Post('/status')
  async change(@Req() request: Request, @Res() response: Response) {
    sendWorkflowResponse(
      response,
      await this.service.change(workflowInput(request, response)),
    );
  }
}

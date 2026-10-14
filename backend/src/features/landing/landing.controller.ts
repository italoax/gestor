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
import { LandingService } from './landing.service.js';
import { workflowInput, sendWorkflowResponse } from '../workflow.http.js';
@Controller()
@UseFilters(CatalogExceptionFilter)
export class LandingController {
  constructor(
    @Inject(LandingService) private readonly service: LandingService,
  ) {}
  @Get('/ix-streaming')
  async alias(@Req() request: Request, @Res() response: Response) {
    sendWorkflowResponse(
      response,
      await this.service.alias(workflowInput(request, response)),
    );
  }
  @Get('/')
  async home(@Req() request: Request, @Res() response: Response) {
    sendWorkflowResponse(
      response,
      await this.service.home(workflowInput(request, response)),
    );
  }
}

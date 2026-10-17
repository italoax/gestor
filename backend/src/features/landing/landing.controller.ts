import { Controller, Get, Inject, Req, Res, UseFilters } from '@nestjs/common';
import type { Request, Response } from 'express';
import { CatalogExceptionFilter } from '../../catalogs/catalog.filter.ts';
import { LandingService } from './landing.service.ts';
import { workflowInput, sendWorkflowResponse } from '../workflow.http.ts';
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

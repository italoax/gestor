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
import { AccountService } from './account.service.js';
import { workflowInput, sendWorkflowResponse } from '../workflow.http.js';
@Controller()
@UseFilters(CatalogExceptionFilter)
@UseGuards(ClientsAuthGuard)
export class AccountController {
  constructor(
    @Inject(AccountService) private readonly service: AccountService,
  ) {}
  @Get('/minha-conta')
  async profile(@Req() request: Request, @Res() response: Response) {
    sendWorkflowResponse(
      response,
      await this.service.profile(workflowInput(request, response)),
    );
  }
  @Post('/minha-conta/pix')
  async savePix(@Req() request: Request, @Res() response: Response) {
    sendWorkflowResponse(
      response,
      await this.service.savePix(workflowInput(request, response)),
    );
  }
  @Post('/minha-conta')
  async saveProfile(@Req() request: Request, @Res() response: Response) {
    sendWorkflowResponse(
      response,
      await this.service.saveProfile(workflowInput(request, response)),
    );
  }
  @Get('/minha-conta/backup')
  async backup(@Req() request: Request, @Res() response: Response) {
    sendWorkflowResponse(
      response,
      await this.service.backup(workflowInput(request, response)),
    );
  }
}

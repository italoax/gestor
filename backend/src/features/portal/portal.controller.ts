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
import { PortalService } from './portal.service.js';
import { workflowInput, sendWorkflowResponse } from '../workflow.http.js';
import { PortalAuthGuard } from './portal.guard.js';
@Controller()
@UseFilters(CatalogExceptionFilter)
export class PortalController {
  constructor(@Inject(PortalService) private readonly service: PortalService) {}
  @Get('/area-cliente/login')
  async loginPage(@Req() request: Request, @Res() response: Response) {
    sendWorkflowResponse(
      response,
      await this.service.loginPage(workflowInput(request, response)),
    );
  }
  @Post('/area-cliente/login')
  async login(@Req() request: Request, @Res() response: Response) {
    sendWorkflowResponse(
      response,
      await this.service.login(workflowInput(request, response)),
    );
  }
  @Post('/area-cliente/sair')
  async logout(@Req() request: Request, @Res() response: Response) {
    sendWorkflowResponse(
      response,
      await this.service.logout(workflowInput(request, response)),
    );
  }
  @Get('/area-cliente')
  @UseGuards(PortalAuthGuard)
  async home(@Req() request: Request, @Res() response: Response) {
    sendWorkflowResponse(
      response,
      await this.service.home(workflowInput(request, response)),
    );
  }
  @Post('/area-cliente/renovar')
  @UseGuards(PortalAuthGuard)
  async renew(@Req() request: Request, @Res() response: Response) {
    sendWorkflowResponse(
      response,
      await this.service.renew(workflowInput(request, response)),
    );
  }
  @Get('/acessos-clientes')
  @UseGuards(ClientsAuthGuard)
  async accesses(@Req() request: Request, @Res() response: Response) {
    sendWorkflowResponse(
      response,
      await this.service.accesses(workflowInput(request, response)),
    );
  }
  @Post('/acessos-clientes')
  @UseGuards(ClientsAuthGuard)
  async changeAccess(@Req() request: Request, @Res() response: Response) {
    sendWorkflowResponse(
      response,
      await this.service.changeAccess(workflowInput(request, response)),
    );
  }
}

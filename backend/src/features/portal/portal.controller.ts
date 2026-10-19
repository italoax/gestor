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
import { PortalService } from './portal.service.ts';
import { workflowInput, sendWorkflowResponse } from '../workflow.http.ts';
import { PortalAuthGuard } from './portal.guard.ts';
import { servePortalSession } from '../../../../src/services/portalSessionStream.ts';
@Controller()
@UseFilters(CatalogExceptionFilter)
export class PortalController {
  constructor(@Inject(PortalService) private readonly service: PortalService) {}
  @Get('/area-cliente/sessao')
  async session(@Req() request: Request, @Res() response: Response) {
    return servePortalSession(request, response, () =>
      this.service.authorize(workflowInput(request, response)),
    );
  }
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

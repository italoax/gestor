import {
  Controller,
  Get,
  Post,
  Req,
  Res,
  Inject,
  UseGuards,
  UseFilters,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { PlansService } from './plans.service.js';
import { ServersService } from './servers.service.js';
import { CatalogAuthGuard } from '../catalogs/catalog.guard.js';
import { CatalogExceptionFilter } from '../catalogs/catalog.filter.js';
type PlansServersName = 'planos' | 'servidores';
interface PlansServersRequest extends Request {
  session: { user: { id: number } };
  flash(type: string, message: string): unknown;
}
@Controller(['planos', 'servidores'])
@UseGuards(CatalogAuthGuard)
@UseFilters(CatalogExceptionFilter)
export class PlansServersController {
  constructor(
    @Inject(PlansService) private readonly plans: PlansService,
    @Inject(ServersService) private readonly servers: ServersService,
  ) {}
  private name(request: Request): PlansServersName {
    return request.path
      .replace(/^\/|\/$/g, '')
      .toLowerCase() as PlansServersName;
  }
  @Get()
  async list(@Req() request: PlansServersRequest, @Res() response: Response) {
    const name = this.name(request);
    response.render(
      `pages/${name}`,
      await (name === 'planos' ? this.plans : this.servers).list(
        request.session.user.id,
      ),
    );
  }
  @Post()
  async save(@Req() request: PlansServersRequest, @Res() response: Response) {
    const name = this.name(request),
      result = await (name === 'planos' ? this.plans : this.servers).save(
        request.session.user.id,
        request.body ?? {},
      );
    request.flash(result.type, result.message);
    response.redirect(`/${name}`);
  }
}

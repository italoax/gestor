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
import { PlansService } from './plans.service.ts';
import { ServersService } from './servers.service.ts';
import { CatalogAuthGuard } from '../catalogs/catalog.guard.ts';
import { CatalogExceptionFilter } from '../catalogs/catalog.filter.ts';
type PlansServersName = 'planos' | 'servidores';
interface PlansServersRequest extends Request {
  session: Request['session'] & { user: { id: number } };
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

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
import type { CatalogName } from './catalog.types.js';
import { CatalogService } from './catalog.service.js';
import { CatalogAuthGuard } from './catalog.guard.js';
import { CatalogExceptionFilter } from './catalog.filter.js';
interface CatalogRequest extends Request {
  session: { user: { id: number } };
  flash(type: string, message: string): unknown;
}
@Controller(['aplicativos', 'dispositivos'])
@UseGuards(CatalogAuthGuard)
@UseFilters(CatalogExceptionFilter)
export class CatalogController {
  constructor(
    @Inject(CatalogService) private readonly catalogs: CatalogService,
  ) {}
  private name(request: Request): CatalogName {
    return request.path.replace(/^\/|\/$/g, '').toLowerCase() as CatalogName;
  }
  @Get()
  async list(@Req() request: CatalogRequest, @Res() response: Response) {
    const name = this.name(request);
    response.render(
      `pages/${name}`,
      await this.catalogs.list(name, request.session.user.id),
    );
  }
  @Post()
  async save(@Req() request: CatalogRequest, @Res() response: Response) {
    const name = this.name(request),
      result = await this.catalogs.save(
        name,
        request.session.user.id,
        request.body ?? {},
      );
    request.flash(result.type, result.message);
    response.redirect(`/${name}`);
  }
}

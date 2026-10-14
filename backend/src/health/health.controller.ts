import { Controller, Get, Inject, Res } from '@nestjs/common';
import type { Response } from 'express';
import { HealthService } from './health.service.js';

@Controller('healthz')
export class HealthController {
  constructor(@Inject(HealthService) private readonly health: HealthService) {}
  @Get()
  async check(@Res() response: Response) {
    const status = await this.health.check();
    response.setHeader('Cache-Control', 'no-store');
    response.status(status.ok ? 200 : 503).json(status);
  }
}

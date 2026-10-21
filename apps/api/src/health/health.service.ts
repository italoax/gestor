import { Inject, Injectable } from '@nestjs/common';
import { BACKEND_RUNTIME, type BackendRuntime } from '../runtime.ts';

@Injectable()
export class HealthService {
  constructor(
    @Inject(BACKEND_RUNTIME) private readonly runtime: BackendRuntime,
  ) {}
  async check() {
    let ok = false;
    try {
      await this.runtime.checkDatabase();
      ok = true;
    } catch {
      /* Indisponível. */
    }
    return {
      ok,
      db: ok ? 'ok' : 'down',
      uptimeSec: Math.round(process.uptime()),
      version: process.env.npm_package_version || '0.1.0',
    };
  }
}

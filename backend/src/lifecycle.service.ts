import {
  Inject,
  Injectable,
  type OnModuleInit,
  type OnApplicationBootstrap,
  type BeforeApplicationShutdown,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { BACKEND_RUNTIME, type BackendRuntime } from './runtime.js';

@Injectable()
export class LifecycleService
  implements
    OnModuleInit,
    OnApplicationBootstrap,
    BeforeApplicationShutdown,
    OnApplicationShutdown
{
  private timeout?: NodeJS.Timeout;
  constructor(
    @Inject(BACKEND_RUNTIME) private readonly runtime: BackendRuntime,
  ) {}
  async onModuleInit() {
    await this.runtime.initialize();
  }
  onApplicationBootstrap() {
    this.runtime.startAutomations();
  }
  async beforeApplicationShutdown() {
    this.timeout = setTimeout(() => {
      console.error('[shutdown] timeout — encerramento forçado');
      process.exit(1);
    }, 30000);
    this.timeout.unref();
    this.runtime.stopDevReload();
    await this.runtime.stopAutomations();
  }
  async onApplicationShutdown() {
    try {
      await this.runtime.closeSessionStores();
      await this.runtime.closeDatabase();
    } finally {
      clearTimeout(this.timeout);
    }
  }
}

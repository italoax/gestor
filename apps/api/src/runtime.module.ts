import { Global, Module, type DynamicModule } from '@nestjs/common';
import { BACKEND_RUNTIME, type BackendRuntime } from './runtime.ts';
@Global()
@Module({})
export class RuntimeModule {
  static register(runtime: BackendRuntime): DynamicModule {
    return {
      module: RuntimeModule,
      providers: [{ provide: BACKEND_RUNTIME, useValue: runtime }],
      exports: [BACKEND_RUNTIME],
    };
  }
}

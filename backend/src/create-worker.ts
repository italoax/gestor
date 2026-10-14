import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import { WorkerModule } from './worker.module.ts';
import type { BackendRuntime } from './runtime.ts';

export function createWorker(
  runtime: BackendRuntime,
  logger: false | undefined = undefined,
) {
  return NestFactory.create(
    WorkerModule.register(runtime),
    new ExpressAdapter(runtime.application),
    {
      bodyParser: false,
      abortOnError: false,
      logger,
    },
  );
}

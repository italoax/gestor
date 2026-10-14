import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';
import type { BackendRuntime } from './runtime.js';

export async function createBackend(
  runtime: BackendRuntime,
  logger: false | undefined = undefined,
) {
  // O parser atual conserva limites, formulários, multipart e webhooks.
  return NestFactory.create(
    AppModule.register(runtime),
    new ExpressAdapter(runtime.application),
    { bodyParser: false, abortOnError: false, logger },
  );
}

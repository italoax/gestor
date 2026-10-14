import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import { AppModule } from './app.module.ts';
import type { BackendRuntime } from './runtime.ts';
import type { LogLevel } from '@nestjs/common';

export async function createBackend(
  runtime: BackendRuntime,
  logger: false | LogLevel[] | undefined = process.env.LOG_VERBOSE === 'true'
    ? undefined
    : ['error', 'warn'],
) {
  // O parser atual conserva limites, formulários, multipart e webhooks.
  return NestFactory.create(
    AppModule.register(runtime),
    new ExpressAdapter(runtime.application),
    { bodyParser: false, abortOnError: false, logger },
  );
}

import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import { WorkerModule } from './worker.module.ts';
import type { BackendRuntime } from './runtime.ts';
import type { LogLevel } from '@nestjs/common';

export function createWorker(
  runtime: BackendRuntime,
  logger: false | LogLevel[] | undefined = process.env.LOG_VERBOSE === 'true'
    ? undefined
    : ['error', 'warn'],
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

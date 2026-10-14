import {
  Catch,
  Inject,
  UnauthorizedException,
  type ExceptionFilter,
  type ArgumentsHost,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { BACKEND_RUNTIME, type BackendRuntime } from '../runtime.js';
@Catch()
export class CatalogExceptionFilter implements ExceptionFilter {
  constructor(
    @Inject(BACKEND_RUNTIME) private readonly runtime: BackendRuntime,
  ) {}
  catch(error: unknown, host: ArgumentsHost) {
    const http = host.switchToHttp(),
      response = http.getResponse<Response>(),
      request = http.getRequest<Request>();
    if (response.headersSent) return;
    if (error instanceof UnauthorizedException) {
      response.redirect('/login');
      return;
    }
    if (this.runtime.handleError) {
      this.runtime.handleError(error, request, response, () => {});
      return;
    }
    response.status(500).json({
      ok: false,
      error: 'Não foi possível processar sua solicitação.',
    });
  }
}

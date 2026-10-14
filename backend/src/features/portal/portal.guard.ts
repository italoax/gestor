import {
  Inject,
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { PortalService } from './portal.service.js';
import { workflowInput, sendWorkflowResponse } from '../workflow.http.js';

@Injectable()
export class PortalAuthGuard implements CanActivate {
  constructor(@Inject(PortalService) private readonly service: PortalService) {}
  async canActivate(context: ExecutionContext) {
    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    const result = await this.service.authorize(
      workflowInput(request, response),
    );
    if (result.kind === 'continue') return true;
    sendWorkflowResponse(response, result);
    return false;
  }
}

import { Inject, Injectable } from '@nestjs/common';
import { BACKEND_RUNTIME, type BackendRuntime } from '../../runtime.js';
import type { WorkflowInput, WorkflowResponse } from '../workflow.types.js';
@Injectable()
export class WhatsappService {
  constructor(
    @Inject(BACKEND_RUNTIME) private readonly runtime: BackendRuntime,
  ) {}
  list(input: WorkflowInput): Promise<WorkflowResponse> {
    const action = this.runtime.features?.['whatsapp']?.list;
    if (!action) throw new Error('Whatsapp workflow unavailable.');
    return action(input);
  }
  change(input: WorkflowInput): Promise<WorkflowResponse> {
    const action = this.runtime.features?.['whatsapp']?.change;
    if (!action) throw new Error('Whatsapp workflow unavailable.');
    return action(input);
  }
  status(input: WorkflowInput): Promise<WorkflowResponse> {
    const action = this.runtime.features?.['whatsapp']?.status;
    if (!action) throw new Error('Whatsapp workflow unavailable.');
    return action(input);
  }
  device(input: WorkflowInput): Promise<WorkflowResponse> {
    const action = this.runtime.features?.['whatsapp']?.device;
    if (!action) throw new Error('Whatsapp workflow unavailable.');
    return action(input);
  }
}

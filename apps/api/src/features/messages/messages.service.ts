import { Inject, Injectable } from '@nestjs/common';
import { BACKEND_RUNTIME, type BackendRuntime } from '../../runtime.ts';
import type { WorkflowInput, WorkflowResponse } from '../workflow.types.ts';
@Injectable()
export class MessagesService {
  constructor(
    @Inject(BACKEND_RUNTIME) private readonly runtime: BackendRuntime,
  ) {}
  list(input: WorkflowInput): Promise<WorkflowResponse> {
    const action = this.runtime.features?.['messages']?.list;
    if (!action) throw new Error('Messages workflow unavailable.');
    return action(input);
  }
  change(input: WorkflowInput): Promise<WorkflowResponse> {
    const action = this.runtime.features?.['messages']?.change;
    if (!action) throw new Error('Messages workflow unavailable.');
    return action(input);
  }
}

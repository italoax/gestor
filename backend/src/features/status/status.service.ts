import { Inject, Injectable } from '@nestjs/common';
import { BACKEND_RUNTIME, type BackendRuntime } from '../../runtime.js';
import type { WorkflowInput, WorkflowResponse } from '../workflow.types.js';
@Injectable()
export class StatusService {
  constructor(
    @Inject(BACKEND_RUNTIME) private readonly runtime: BackendRuntime,
  ) {}
  image(input: WorkflowInput): Promise<WorkflowResponse> {
    const action = this.runtime.features?.['status']?.image;
    if (!action) throw new Error('Status workflow unavailable.');
    return action(input);
  }
  history(input: WorkflowInput): Promise<WorkflowResponse> {
    const action = this.runtime.features?.['status']?.history;
    if (!action) throw new Error('Status workflow unavailable.');
    return action(input);
  }
  list(input: WorkflowInput): Promise<WorkflowResponse> {
    const action = this.runtime.features?.['status']?.list;
    if (!action) throw new Error('Status workflow unavailable.');
    return action(input);
  }
  change(input: WorkflowInput): Promise<WorkflowResponse> {
    const action = this.runtime.features?.['status']?.change;
    if (!action) throw new Error('Status workflow unavailable.');
    return action(input);
  }
}

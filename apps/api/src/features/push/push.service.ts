import { Inject, Injectable } from '@nestjs/common';
import { BACKEND_RUNTIME, type BackendRuntime } from '../../runtime.ts';
import type { WorkflowInput, WorkflowResponse } from '../workflow.types.ts';
@Injectable()
export class PushService {
  constructor(
    @Inject(BACKEND_RUNTIME) private readonly runtime: BackendRuntime,
  ) {}
  publicKey(input: WorkflowInput): Promise<WorkflowResponse> {
    const action = this.runtime.features?.['push']?.publicKey;
    if (!action) throw new Error('Push workflow unavailable.');
    return action(input);
  }
  subscribe(input: WorkflowInput): Promise<WorkflowResponse> {
    const action = this.runtime.features?.['push']?.subscribe;
    if (!action) throw new Error('Push workflow unavailable.');
    return action(input);
  }
  unsubscribe(input: WorkflowInput): Promise<WorkflowResponse> {
    const action = this.runtime.features?.['push']?.unsubscribe;
    if (!action) throw new Error('Push workflow unavailable.');
    return action(input);
  }
}

import { Inject, Injectable } from '@nestjs/common';
import { BACKEND_RUNTIME, type BackendRuntime } from '../../runtime.ts';
import type { WorkflowInput, WorkflowResponse } from '../workflow.types.ts';
@Injectable()
export class LandingService {
  constructor(
    @Inject(BACKEND_RUNTIME) private readonly runtime: BackendRuntime,
  ) {}
  alias(input: WorkflowInput): Promise<WorkflowResponse> {
    const action = this.runtime.features?.['landing']?.alias;
    if (!action) throw new Error('Landing workflow unavailable.');
    return action(input);
  }
  home(input: WorkflowInput): Promise<WorkflowResponse> {
    const action = this.runtime.features?.['landing']?.home;
    if (!action) throw new Error('Landing workflow unavailable.');
    return action(input);
  }
}

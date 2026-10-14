import { Inject, Injectable } from '@nestjs/common';
import { BACKEND_RUNTIME, type BackendRuntime } from '../../runtime.js';
import type { WorkflowInput, WorkflowResponse } from '../workflow.types.js';
@Injectable()
export class DashboardService {
  constructor(
    @Inject(BACKEND_RUNTIME) private readonly runtime: BackendRuntime,
  ) {}
  overview(input: WorkflowInput): Promise<WorkflowResponse> {
    const action = this.runtime.features?.['dashboard']?.overview;
    if (!action) throw new Error('Dashboard workflow unavailable.');
    return action(input);
  }
}

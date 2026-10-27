import { Inject, Injectable } from '@nestjs/common';
import { BACKEND_RUNTIME, type BackendRuntime } from '../../runtime.ts';
import type { WorkflowInput, WorkflowResponse } from '../workflow.types.ts';
@Injectable()
export class AutomationService {
  constructor(
    @Inject(BACKEND_RUNTIME) private readonly runtime: BackendRuntime,
  ) {}
  status() {
    if (!this.runtime.schedulerStatus)
      throw new Error('Scheduler status unavailable.');
    return this.runtime.schedulerStatus();
  }
  list(input: WorkflowInput): Promise<WorkflowResponse> {
    const action = this.runtime.features?.['automation']?.list;
    if (!action) throw new Error('Automation workflow unavailable.');
    return action(input);
  }
  change(input: WorkflowInput): Promise<WorkflowResponse> {
    const action = this.runtime.features?.['automation']?.change;
    if (!action) throw new Error('Automation workflow unavailable.');
    return action(input);
  }
  recipients(input: WorkflowInput): Promise<WorkflowResponse> {
    const action = this.runtime.features?.['automation']?.recipients;
    if (!action) throw new Error('Automation workflow unavailable.');
    return action(input);
  }
  clients(input: WorkflowInput): Promise<WorkflowResponse> {
    const action = this.runtime.features?.['automation']?.clients;
    if (!action) throw new Error('Automation workflow unavailable.');
    return action(input);
  }
}

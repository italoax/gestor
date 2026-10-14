import { Inject, Injectable } from '@nestjs/common';
import { BACKEND_RUNTIME, type BackendRuntime } from '../../runtime.ts';
import type { WorkflowInput, WorkflowResponse } from '../workflow.types.ts';
@Injectable()
export class CronService {
  constructor(
    @Inject(BACKEND_RUNTIME) private readonly runtime: BackendRuntime,
  ) {}
  run(input: WorkflowInput): Promise<WorkflowResponse> {
    const action = this.runtime.features?.['cron']?.run;
    if (!action) throw new Error('Cron workflow unavailable.');
    return action(input);
  }
}

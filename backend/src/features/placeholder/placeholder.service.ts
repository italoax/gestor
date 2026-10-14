import { Inject, Injectable } from '@nestjs/common';
import { BACKEND_RUNTIME, type BackendRuntime } from '../../runtime.js';
import type { WorkflowInput, WorkflowResponse } from '../workflow.types.js';
@Injectable()
export class PlaceholderService {
  constructor(
    @Inject(BACKEND_RUNTIME) private readonly runtime: BackendRuntime,
  ) {}
  page(input: WorkflowInput): Promise<WorkflowResponse> {
    const action = this.runtime.features?.['placeholder']?.page;
    if (!action) throw new Error('Placeholder workflow unavailable.');
    return action(input);
  }
}

import { Inject, Injectable } from '@nestjs/common';
import { BACKEND_RUNTIME, type BackendRuntime } from '../../runtime.js';
import type { WorkflowInput, WorkflowResponse } from '../workflow.types.js';
@Injectable()
export class PaymentSettingsService {
  constructor(
    @Inject(BACKEND_RUNTIME) private readonly runtime: BackendRuntime,
  ) {}
  list(input: WorkflowInput): Promise<WorkflowResponse> {
    const action = this.runtime.features?.['payment-settings']?.list;
    if (!action) throw new Error('PaymentSettings workflow unavailable.');
    return action(input);
  }
  change(input: WorkflowInput): Promise<WorkflowResponse> {
    const action = this.runtime.features?.['payment-settings']?.change;
    if (!action) throw new Error('PaymentSettings workflow unavailable.');
    return action(input);
  }
}

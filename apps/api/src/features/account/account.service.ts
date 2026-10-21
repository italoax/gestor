import { Inject, Injectable } from '@nestjs/common';
import { BACKEND_RUNTIME, type BackendRuntime } from '../../runtime.ts';
import type { WorkflowInput, WorkflowResponse } from '../workflow.types.ts';
@Injectable()
export class AccountService {
  constructor(
    @Inject(BACKEND_RUNTIME) private readonly runtime: BackendRuntime,
  ) {}
  profile(input: WorkflowInput): Promise<WorkflowResponse> {
    const action = this.runtime.features?.['account']?.profile;
    if (!action) throw new Error('Account workflow unavailable.');
    return action(input);
  }
  savePix(input: WorkflowInput): Promise<WorkflowResponse> {
    const action = this.runtime.features?.['account']?.savePix;
    if (!action) throw new Error('Account workflow unavailable.');
    return action(input);
  }
  saveProfile(input: WorkflowInput): Promise<WorkflowResponse> {
    const action = this.runtime.features?.['account']?.saveProfile;
    if (!action) throw new Error('Account workflow unavailable.');
    return action(input);
  }
  backup(input: WorkflowInput): Promise<WorkflowResponse> {
    const action = this.runtime.features?.['account']?.backup;
    if (!action) throw new Error('Account workflow unavailable.');
    return action(input);
  }
}

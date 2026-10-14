import { Inject, Injectable } from '@nestjs/common';
import { BACKEND_RUNTIME, type BackendRuntime } from '../../runtime.js';
import type { WorkflowInput, WorkflowResponse } from '../workflow.types.js';
@Injectable()
export class PortalService {
  constructor(
    @Inject(BACKEND_RUNTIME) private readonly runtime: BackendRuntime,
  ) {}
  loginPage(input: WorkflowInput): Promise<WorkflowResponse> {
    const action = this.runtime.features?.['portal']?.loginPage;
    if (!action) throw new Error('Portal workflow unavailable.');
    return action(input);
  }
  login(input: WorkflowInput): Promise<WorkflowResponse> {
    const action = this.runtime.features?.['portal']?.login;
    if (!action) throw new Error('Portal workflow unavailable.');
    return action(input);
  }
  logout(input: WorkflowInput): Promise<WorkflowResponse> {
    const action = this.runtime.features?.['portal']?.logout;
    if (!action) throw new Error('Portal workflow unavailable.');
    return action(input);
  }
  authorize(input: WorkflowInput): Promise<WorkflowResponse> {
    const action = this.runtime.features?.['portal']?.authorize;
    if (!action) throw new Error('Portal workflow unavailable.');
    return action(input);
  }
  home(input: WorkflowInput): Promise<WorkflowResponse> {
    const action = this.runtime.features?.['portal']?.home;
    if (!action) throw new Error('Portal workflow unavailable.');
    return action(input);
  }
  renew(input: WorkflowInput): Promise<WorkflowResponse> {
    const action = this.runtime.features?.['portal']?.renew;
    if (!action) throw new Error('Portal workflow unavailable.');
    return action(input);
  }
  accesses(input: WorkflowInput): Promise<WorkflowResponse> {
    const action = this.runtime.features?.['portal']?.accesses;
    if (!action) throw new Error('Portal workflow unavailable.');
    return action(input);
  }
  changeAccess(input: WorkflowInput): Promise<WorkflowResponse> {
    const action = this.runtime.features?.['portal']?.changeAccess;
    if (!action) throw new Error('Portal workflow unavailable.');
    return action(input);
  }
}

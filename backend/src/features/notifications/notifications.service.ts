import { Inject, Injectable } from '@nestjs/common';
import { BACKEND_RUNTIME, type BackendRuntime } from '../../runtime.js';
import type { WorkflowInput, WorkflowResponse } from '../workflow.types.js';
@Injectable()
export class NotificationsService {
  constructor(
    @Inject(BACKEND_RUNTIME) private readonly runtime: BackendRuntime,
  ) {}
  overview(input: WorkflowInput): Promise<WorkflowResponse> {
    const action = this.runtime.features?.['notifications']?.overview;
    if (!action) throw new Error('Notifications workflow unavailable.');
    return action(input);
  }
  list(input: WorkflowInput): Promise<WorkflowResponse> {
    const action = this.runtime.features?.['notifications']?.list;
    if (!action) throw new Error('Notifications workflow unavailable.');
    return action(input);
  }
  readAll(input: WorkflowInput): Promise<WorkflowResponse> {
    const action = this.runtime.features?.['notifications']?.readAll;
    if (!action) throw new Error('Notifications workflow unavailable.');
    return action(input);
  }
  read(input: WorkflowInput): Promise<WorkflowResponse> {
    const action = this.runtime.features?.['notifications']?.read;
    if (!action) throw new Error('Notifications workflow unavailable.');
    return action(input);
  }
  remove(input: WorkflowInput): Promise<WorkflowResponse> {
    const action = this.runtime.features?.['notifications']?.remove;
    if (!action) throw new Error('Notifications workflow unavailable.');
    return action(input);
  }
  clear(input: WorkflowInput): Promise<WorkflowResponse> {
    const action = this.runtime.features?.['notifications']?.clear;
    if (!action) throw new Error('Notifications workflow unavailable.');
    return action(input);
  }
}

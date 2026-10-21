import { Inject, Injectable } from '@nestjs/common';
import { BACKEND_RUNTIME, type BackendRuntime } from '../runtime.ts';
@Injectable()
export class ClientMutationsService {
  constructor(
    @Inject(BACKEND_RUNTIME) private readonly runtime: BackendRuntime,
  ) {}
  async save(userId: number, body: Record<string, unknown>) {
    if (!this.runtime.clientMutations)
      throw new Error('Client mutations dependencies unavailable.');
    return this.runtime.clientMutations(userId, body);
  }
}

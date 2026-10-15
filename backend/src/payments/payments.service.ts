import { Inject, Injectable } from '@nestjs/common';
import { BACKEND_RUNTIME, type BackendRuntime } from '../runtime.ts';
@Injectable()
export class PaymentsService {
  constructor(
    @Inject(BACKEND_RUNTIME) private readonly runtime: BackendRuntime,
  ) {}
  private get workflow() {
    if (!this.runtime.payments)
      throw new Error('Payment dependencies unavailable.');
    return this.runtime.payments;
  }
  alias(alias: string) {
    return this.workflow.alias(alias);
  }
  page(token: string, short: boolean, query: Record<string, unknown>) {
    return this.workflow.page(token, short, query);
  }
  create(token: string, body: Record<string, unknown>) {
    return this.workflow.create(token, body);
  }
  status(token: string, paymentId: string) {
    return this.workflow.status(token, paymentId);
  }
  webhook(
    provider: string,
    body: Record<string, unknown>,
    request?: import('../../../src/security/paymentWebhooks.ts').WebhookRequest,
  ) {
    return this.workflow.webhook(provider, body, request);
  }
  confirm(userId: number, paymentId: string) {
    if (!this.runtime.confirmPayment)
      throw new Error('Payment confirmation dependencies unavailable.');
    return this.runtime.confirmPayment(userId, paymentId);
  }
}

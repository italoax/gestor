export type PaymentResponse =
  | { kind: 'json'; status: number; data: Record<string, unknown> }
  | {
      kind: 'view';
      status: number;
      view: string;
      data: Record<string, unknown>;
    }
  | { kind: 'redirect'; status: number; path: string };
export interface PaymentWorkflow {
  alias(alias: string): Promise<PaymentResponse>;
  page(
    token: string,
    short: boolean,
    query: Record<string, unknown>,
  ): Promise<PaymentResponse>;
  create(
    token: string,
    body: Record<string, unknown>,
  ): Promise<PaymentResponse>;
  status(token: string, paymentId: string): Promise<PaymentResponse>;
  webhook(provider: string, body: Record<string, unknown>): Promise<void>;
}

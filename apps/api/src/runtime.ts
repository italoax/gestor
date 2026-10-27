import type { Express, ErrorRequestHandler } from 'express';
import type { ClientsDependencies } from './clients/clients.types.ts';
import type { CatalogDependencies } from './catalogs/catalog.types.ts';
import type { AuthDependencies } from './auth/auth.types.ts';
import type { PaymentWorkflow } from './payments/payments.types.ts';
import type { FeatureWorkflows } from './features/workflow.types.ts';
import type { SchedulerHealth } from '../../../src/shared/schedulerHealth.ts';

export const BACKEND_RUNTIME = Symbol('BACKEND_RUNTIME');
export interface BackendRuntime {
  application: Express;
  features?: FeatureWorkflows;
  auth?: AuthDependencies;
  payments?: PaymentWorkflow;
  confirmPayment?: (
    userId: number,
    id: string,
  ) => Promise<{ status: number; data: Record<string, unknown> }>;
  catalogs?: CatalogDependencies;
  clients?: ClientsDependencies;
  clientMutations?: (
    userId: number,
    body: Record<string, unknown>,
  ) => Promise<{
    redirect: string;
    notices: { type: string; message: string }[];
  }>;
  plansServers?: Omit<CatalogDependencies, 'configs'>;
  handleError?: ErrorRequestHandler;
  initialize(): Promise<void>;
  checkDatabase(): Promise<unknown>;
  schedulerStatus?: () => Promise<SchedulerHealth>;
  startAutomations(): void;
  stopAutomations(): Promise<void>;
  stopDevReload(): void;
  closeSessionStores(): Promise<void>;
  closeDatabase(): Promise<void>;
}

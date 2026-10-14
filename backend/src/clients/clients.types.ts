import type { CatalogDependencies } from '../catalogs/catalog.types.js';
export interface ClientsDependencies extends Pick<
  CatalogDependencies,
  'queryRows' | 'queryOne' | 'execute'
> {
  listPendingRenewals(userId: number): Promise<unknown[]>;
  paymentUrl(clientId: number): Promise<string | null>;
}

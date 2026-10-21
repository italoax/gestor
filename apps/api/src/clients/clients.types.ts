import type { CatalogDependencies } from '../catalogs/catalog.types.ts';
export interface ClientsDependencies extends Pick<
  CatalogDependencies,
  'queryRows' | 'queryOne' | 'execute'
> {
  listPendingRenewals(userId: number): Promise<unknown[]>;
  paymentUrl(clientId: number): Promise<string | null>;
}

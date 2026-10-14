export type CatalogName = 'aplicativos' | 'dispositivos';
export interface CatalogConfig {
  singular: string;
  plural: string;
  titulo: string;
  subtitulo: string;
  padroes: readonly (readonly string[])[];
  comValorRenovacao?: boolean;
}
export interface CatalogDependencies {
  configs: Record<CatalogName, CatalogConfig>;
  queryRows(
    sql: string,
    params: Record<string, unknown>,
  ): Promise<Record<string, unknown>[]>;
  queryOne(
    sql: string,
    params: Record<string, unknown>,
  ): Promise<Record<string, unknown> | null>;
  execute(sql: string, params: Record<string, unknown>): Promise<unknown>;
  jaSemeou(userId: number, chave: string): Promise<boolean>;
  marcarSemeado(userId: number, chave: string): Promise<unknown>;
}

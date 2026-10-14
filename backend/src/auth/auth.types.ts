export interface PanelUser {
  id: number;
  name: string;
  username: string;
  email?: string;
  isAdmin: boolean;
}
export interface AuthDependencies {
  queryOne(
    sql: string,
    params: Record<string, unknown>,
  ): Promise<Record<string, unknown> | null>;
  comparePassword(password: string, hash: string): Promise<boolean>;
  logger?: Pick<Console, 'log' | 'warn'>;
}

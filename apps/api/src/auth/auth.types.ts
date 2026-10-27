export interface PanelUser {
  id: number;
  name: string;
  username: string;
  email?: string;
  isAdmin: boolean;
}
export interface AuthDependencies {
  twoFactor?: import('../../../../src/security/twoFactor.ts').TwoFactorService;
  queryOne(
    sql: string,
    params: Record<string, unknown>,
  ): Promise<Record<string, unknown> | null>;
  comparePassword(password: string, hash: string): Promise<boolean>;
  loginAttempts: {
    consume(userId: number): Promise<boolean>;
    reset(userId: number): Promise<void>;
  };
  logger?: Pick<Console, 'log' | 'warn'>;
  auditSecurity?: (event: string, input?: any) => Promise<void>;
}

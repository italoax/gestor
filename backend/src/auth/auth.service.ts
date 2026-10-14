import { Inject, Injectable } from '@nestjs/common';
import { BACKEND_RUNTIME, type BackendRuntime } from '../runtime.js';
import type { PanelUser } from './auth.types.js';
@Injectable()
export class AuthService {
  constructor(
    @Inject(BACKEND_RUNTIME) private readonly runtime: BackendRuntime,
  ) {}
  private get dependencies() {
    if (!this.runtime.auth)
      throw new Error('Authentication dependencies unavailable.');
    return this.runtime.auth;
  }
  async authenticate(
    username: string,
    password: string,
  ): Promise<PanelUser | null> {
    const user = await this.dependencies.queryOne(
      'SELECT id, name, username, email, password_hash AS passwordHash, is_admin AS isAdmin FROM users WHERE username = :username LIMIT 1',
      { username },
    );
    if (
      !user ||
      !(await this.dependencies.comparePassword(
        password,
        user.passwordHash as string,
      ))
    )
      return null;
    return {
      id: user.id as number,
      name: user.name as string,
      username: user.username as string,
      email: user.email as string | undefined,
      isAdmin: Boolean(user.isAdmin),
    };
  }
  cookieMaxAge(remember: unknown) {
    return ['1', 'true', 'on', 'yes', 'sim'].includes(
      String(remember ?? '').toLowerCase(),
    )
      ? 1000 * 60 * 60 * 24 * 30
      : undefined;
  }
  recordAttempt(
    username: string,
    user: PanelUser | null,
    ip: string | undefined,
    agent: string,
  ) {
    const logger = this.dependencies.logger ?? console;
    if (user)
      logger.log(`[login] OK user="${username}" id=${user.id} ip=${ip}`);
    else logger.warn(`[login] FALHA user="${username}" ip=${ip} ua="${agent}"`);
  }
}

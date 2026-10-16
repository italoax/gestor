import { Inject, Injectable } from '@nestjs/common';
import { BACKEND_RUNTIME, type BackendRuntime } from '../runtime.ts';
import type { PanelUser } from './auth.types.ts';
import { createHash } from 'node:crypto';
import { credentialRevision } from '../../../src/services/sessionSecurity.ts';
// Hash de comparação sem conta associada; evita o retorno rápido para usuário inexistente.
const DUMMY_HASH =
  '$2b$12$/2QObIbCdbYgQ262/oShoeRadHCpNQouzCtKPHQzCspuWm9SnWoty';
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
  ): Promise<(PanelUser & { credentialRevision: string }) | null> {
    if (
      !username ||
      username.length > 60 ||
      !password ||
      Buffer.byteLength(password, 'utf8') > 72
    )
      return null;
    const user = await this.dependencies.queryOne(
      'SELECT id, name, username, email, password_hash AS passwordHash, is_admin AS isAdmin, session_version AS sessionVersion FROM users WHERE username = :username LIMIT 1',
      { username },
    );
    const allowed =
      !user || (await this.dependencies.loginAttempts.consume(Number(user.id)));
    const valid = await this.dependencies.comparePassword(
      password,
      user && allowed ? (user.passwordHash as string) : DUMMY_HASH,
    );
    if (!user || !allowed || !valid) return null;
    await this.dependencies.loginAttempts.reset(Number(user.id));
    return {
      id: user.id as number,
      name: user.name as string,
      username: user.username as string,
      email: user.email as string | undefined,
      isAdmin: Boolean(Number(user.isAdmin)),
      credentialRevision: credentialRevision(user),
    };
  }
  recordAttempt(
    username: string,
    user: PanelUser | null,
    ip: string | undefined,
    agent: string,
  ) {
    const logger = this.dependencies.logger ?? console;
    const event = JSON.stringify({
      event: 'auth.login',
      at: new Date().toISOString(),
      outcome: user ? 'success' : 'failure',
      userId: user?.id,
      account: createHash('sha256')
        .update(username.trim().toLowerCase())
        .digest('hex'),
      sourceHash: ip
        ? createHash('sha256').update(ip).digest('hex')
        : undefined,
    });
    if (user) logger.log(event);
    else logger.warn(event);
    void this.dependencies
      .auditSecurity?.(user ? 'login.success' : 'login.failure', {
        userId: user?.id,
        ip,
      })
      .catch(() => {});
  }
}

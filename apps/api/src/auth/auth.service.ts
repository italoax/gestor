import { Inject, Injectable } from '@nestjs/common';
import { BACKEND_RUNTIME, type BackendRuntime } from '../runtime.ts';
import type { PanelUser } from './auth.types.ts';
import { createHash } from 'node:crypto';
import { credentialRevision } from '../../../../src/services/sessionSecurity.ts';
import { TwoFactorError } from '../../../../src/security/twoFactor.ts';
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
  get twoFactor() {
    if (!this.dependencies.twoFactor)
      throw new Error('Two-factor service unavailable.');
    return this.dependencies.twoFactor;
  }
  async audit(event: string, userId: number, reason: string) {
    await this.dependencies.auditSecurity?.(event, { userId, reason });
  }
  async authenticate(
    username: string,
    password: string,
  ): Promise<
    | (PanelUser & { credentialRevision: string; twoFactorRequired?: boolean })
    | null
  > {
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
    const twoFactorRequired = this.dependencies.twoFactor
      ? (await this.dependencies.twoFactor.status(Number(user.id))).enabled
      : false;
    if (!twoFactorRequired)
      await this.dependencies.loginAttempts.reset(Number(user.id));
    return {
      id: user.id as number,
      name: user.name as string,
      username: user.username as string,
      email: user.email as string | undefined,
      isAdmin: Boolean(Number(user.isAdmin)),
      credentialRevision: credentialRevision(user),
      ...(twoFactorRequired ? { twoFactorRequired: true } : {}),
    };
  }
  async findSessionUser(userId: number, revision: string) {
    const user = await this.dependencies.queryOne(
      'SELECT id, name, username, email, password_hash AS passwordHash, is_admin AS isAdmin, session_version AS sessionVersion FROM users WHERE id = :id LIMIT 1',
      { id: userId },
    );
    if (!user || credentialRevision(user) !== revision) return null;
    return user;
  }
  async completeTwoFactor(
    challenge: NonNullable<
      import('express-session').SessionData['twoFactorChallenge']
    >,
    code: unknown,
  ) {
    const user = await this.dependencies.queryOne(
      'SELECT id, name, username, email, password_hash AS passwordHash, is_admin AS isAdmin, session_version AS sessionVersion FROM users WHERE id = :id LIMIT 1',
      { id: challenge.userId },
    );
    if (
      !user ||
      credentialRevision(user) !== challenge.revision ||
      !(await this.dependencies.loginAttempts.consume(challenge.userId))
    )
      return null;
    try {
      if (
        !(await this.twoFactor.verify(
          challenge.userId,
          challenge.revision,
          code,
        ))
      )
        return null;
    } catch (error) {
      if (error instanceof TwoFactorError) return null;
      throw error;
    }
    await this.dependencies.loginAttempts.reset(challenge.userId);
    return {
      id: Number(user.id),
      name: String(user.name),
      username: String(user.username),
      email: user.email as string | undefined,
      isAdmin: Boolean(Number(user.isAdmin)),
      credentialRevision: challenge.revision,
    };
  }
  recordAttempt(
    username: string,
    user: PanelUser | null,
    ip: string | undefined,
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

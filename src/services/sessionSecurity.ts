import { createHash } from 'node:crypto';

export interface SessionSecurity {
  authenticatedAt: number;
  lastActiveAt: number;
  credentialRevision?: string;
  remember?: boolean;
  recentAuthAt?: number;
}

export function credentialRevision(user: {
  id?: unknown;
  username?: unknown;
  passwordHash?: unknown;
  isAdmin?: unknown;
  sessionVersion?: unknown;
}) {
  return createHash('sha256')
    .update(
      JSON.stringify([
        user.id,
        user.username,
        user.passwordHash,
        Boolean(Number(user.isAdmin)),
        Number(user.sessionVersion || 0),
      ]),
    )
    .digest('hex');
}

export function startSessionSecurity(
  credential?: string,
  remember = false,
): SessionSecurity {
  const now = Date.now();
  return {
    authenticatedAt: now,
    lastActiveAt: now,
    credentialRevision: credential,
    remember,
    recentAuthAt: now,
  };
}

export function sessionLimits(
  config: Record<string, any>,
  portal = false,
  remember = false,
  admin = false,
) {
  return {
    idle: admin
      ? (config.sessionAdminIdleMs ?? 15 * 60_000)
      : portal
        ? 30 * 60_000
        : remember
          ? (config.sessionRememberIdleMs ?? 7 * 86400_000)
          : (config.sessionIdleMs ?? 30 * 60_000),
    absolute: admin
      ? (config.sessionAdminAbsoluteMs ?? 8 * 3600_000)
      : portal
        ? 8 * 3600_000
        : remember
          ? (config.sessionRememberAbsoluteMs ?? 30 * 86400_000)
          : (config.sessionAbsoluteMs ?? 12 * 3600_000),
  };
}

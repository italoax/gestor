import { createHash, randomUUID } from 'node:crypto';

export const PANEL_SESSION_IDLE_MS = 60 * 60_000;

export interface SessionSecurity {
  authenticatedAt: number;
  lastActiveAt: number;
  credentialRevision?: string;
  loginNoticeId?: string;
  recentAuthAt?: number;
}

export function hasRecentAuthentication(
  security: SessionSecurity | undefined,
  now = Date.now(),
) {
  const at = security?.recentAuthAt ?? security?.authenticatedAt;
  return Number.isFinite(at) && now >= at && now - at <= 15 * 60_000;
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

export function startSessionSecurity(credential?: string): SessionSecurity {
  const now = Date.now();
  return {
    authenticatedAt: now,
    lastActiveAt: now,
    credentialRevision: credential,
    loginNoticeId: randomUUID(),
    recentAuthAt: now,
  };
}

export function sessionLimits(
  config: Record<string, any>,
  portal = false,
  admin = false,
) {
  return {
    idle: portal
      ? 30 * 60_000
      : Math.min(
          (admin ? config.sessionAdminIdleMs : config.sessionIdleMs) ??
            PANEL_SESSION_IDLE_MS,
          PANEL_SESSION_IDLE_MS,
        ),
    absolute: admin
      ? (config.sessionAdminAbsoluteMs ?? 8 * 3600_000)
      : portal
        ? 8 * 3600_000
        : (config.sessionAbsoluteMs ?? 12 * 3600_000),
  };
}

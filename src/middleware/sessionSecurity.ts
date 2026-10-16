import {
  credentialRevision,
  sessionLimits,
} from '../services/sessionSecurity.ts';

// Executado antes de qualquer controller, inclusive nas consultas do frontend Next.
export function createSessionSecurity(
  config,
  lookupUser,
  now = Date.now,
  audit = async (..._args: any[]) => {},
) {
  return async (req, res, next) => {
    try {
      const portal =
        req.path === '/area-cliente' || req.path.startsWith('/area-cliente/');
      const identity = portal ? req.session.cliente : req.session.user;
      if (!identity) return next();
      const security = req.session.security;
      const time = now();
      const limits = sessionLimits(
        config,
        portal,
        !portal && Boolean(identity.isAdmin),
      );
      const expire = async (reason: string) => {
        await audit(
          reason === 'credentials' ? 'session.revoked' : 'session.expired',
          { userId: portal ? undefined : identity.id, reason },
        );
        await new Promise<void>((resolve, reject) =>
          req.session.regenerate((error) =>
            error ? reject(error) : resolve(),
          ),
        );
        res.clearCookie(
          portal ? 'ixstreaming.cliente.sid' : 'ixstreaming.painel.sid',
          {
            path: portal ? '/area-cliente' : '/',
            httpOnly: true,
            sameSite: 'lax',
            secure: config.cookieSecure,
          },
        );
        // O middleware de autorização/CSRF fará a resposta própria de cada rota.
      };
      if (
        !security ||
        !Number.isFinite(security.authenticatedAt) ||
        !Number.isFinite(security.lastActiveAt) ||
        security.authenticatedAt > time ||
        security.lastActiveAt > time ||
        time - security.lastActiveAt >= limits.idle ||
        time - security.authenticatedAt >= limits.absolute
      ) {
        await expire('timeout');
        return next();
      }
      if (!portal) {
        const user = await lookupUser(
          'SELECT id, username, password_hash AS passwordHash, is_admin AS isAdmin, session_version AS sessionVersion FROM users WHERE id = :id LIMIT 1',
          { id: identity.id },
        );
        if (
          !user ||
          !security.credentialRevision ||
          credentialRevision(user) !== security.credentialRevision
        ) {
          if (
            user &&
            Boolean(Number(user.isAdmin)) !== Boolean(identity.isAdmin)
          )
            await audit('session.privileges_changed', {
              userId: identity.id,
              reason: 'role_changed',
            });
          await expire('credentials');
          return next();
        }
        req.session.user.isAdmin = Boolean(Number(user.isAdmin));
      }
      // Polling automático não prolonga indefinidamente uma sessão sem interação.
      const active =
        req.get('x-gestor-background') !== '1' &&
        (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) ||
          req.get('x-gestor-page') === '1' ||
          (req.get('accept') || '').includes('text/html'));
      if (active) security.lastActiveAt = time;
      if (!portal)
        req.session.cookie.maxAge = Math.min(
          limits.idle,
          limits.absolute - (time - security.authenticatedAt),
        );
      next();
    } catch (error) {
      // Uma falha de banco nunca libera uma identidade que não foi verificada.
      next(error);
    }
  };
}

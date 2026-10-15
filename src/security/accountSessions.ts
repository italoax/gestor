import type { Request, Response } from 'express';
export function createAccountSessionActions({
  queryOne,
  execute,
  comparePassword,
  audit,
}) {
  return async (req: Request, res: Response, next) => {
    try {
      const id = req.session.user.id,
        password = req.body?.current_password;
      const row = await queryOne(
        'SELECT password_hash AS passwordHash FROM users WHERE id = :id LIMIT 1',
        { id },
      );
      if (
        !row ||
        typeof password !== 'string' ||
        !password ||
        Buffer.byteLength(password) > 72 ||
        !(await comparePassword(password, row.passwordHash))
      ) {
        await audit('login.failure', {
          userId: id,
          ip: req.ip,
          reason: 'reauthentication',
        });
        req.flash('error', 'Não foi possível confirmar sua identidade.');
        return res.redirect('/minha-conta');
      }
      if (req.path.endsWith('/revogar')) {
        await execute(
          'UPDATE users SET session_version = session_version + 1 WHERE id = :id',
          { id },
        );
        await audit('session.revoked', {
          userId: id,
          reason: 'user_requested',
        });
        await new Promise<void>((resolve, reject) =>
          req.session.destroy((error) => (error ? reject(error) : resolve())),
        );
        res.clearCookie('ixstreaming.painel.sid', { path: '/' });
        return res.redirect('/login');
      }
      const identity = req.session.user,
        security = req.session.security,
        maxAge = req.session.cookie.originalMaxAge;
      if (!security) return res.redirect('/login');
      await new Promise<void>((resolve, reject) =>
        req.session.regenerate((error) => (error ? reject(error) : resolve())),
      );
      req.session.user = identity;
      req.session.security = { ...security, recentAuthAt: Date.now() };
      req.session.cookie.maxAge = maxAge;
      await new Promise<void>((resolve, reject) =>
        req.session.save((error) => (error ? reject(error) : resolve())),
      );
      req.flash(
        'success',
        'Identidade confirmada. Você pode realizar a operação.',
      );
      return res.redirect('/minha-conta');
    } catch (error) {
      next(error);
    }
  };
}

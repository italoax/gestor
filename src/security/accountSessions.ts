import type { Request, Response } from 'express';

export function createAccountSessionActions({ execute, audit }) {
  return async (req: Request, res: Response, next) => {
    try {
      const id = req.session.user?.id;
      if (!id) return res.redirect('/login');
      await execute(
        'UPDATE users SET session_version = session_version + 1 WHERE id = :id',
        { id },
      );
      await audit('session.revoked', { userId: id, reason: 'user_requested' });
      await new Promise<void>((resolve, reject) =>
        req.session.destroy((error) => (error ? reject(error) : resolve())),
      );
      res.clearCookie('ixstreaming.painel.sid', { path: '/' });
      return res.redirect('/login');
    } catch (error) {
      next(error);
    }
  };
}

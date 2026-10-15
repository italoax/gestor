import {
  Controller,
  Get,
  Post,
  Req,
  Res,
  Inject,
  UseFilters,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service.ts';
import type { PanelUser } from './auth.types.ts';
import { CatalogExceptionFilter } from '../catalogs/catalog.filter.ts';
import { startSessionSecurity } from '../../../src/services/sessionSecurity.ts';
interface AuthRequest extends Request {
  session: Request['session'] & {
    user?: PanelUser;
    csrfToken?: string;
    cookie: { maxAge?: number | null };
    regenerate(callback: (error?: unknown) => void): void;
    save(callback: (error?: unknown) => void): void;
    destroy(callback: (error?: unknown) => void): void;
  };
}
@Controller()
@UseFilters(CatalogExceptionFilter)
export class AuthController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}
  @Get('login')
  loginPage(@Req() request: AuthRequest, @Res() response: Response) {
    response.set('Cache-Control', 'no-store');
    if (request.session.user) return response.redirect('/dashboard');
    if (request.query.session_check === '1') {
      const valid =
        Boolean(request.session.csrfToken) &&
        request.get('x-csrf-token') === request.session.csrfToken;
      return response.status(valid ? 200 : 409).json({ ok: valid });
    }
    return response.render('pages/login', { title: 'Login' });
  }
  @Post('login')
  async login(@Req() request: AuthRequest, @Res() response: Response) {
    const username = String(request.body?.username ?? '').trim(),
      password = String(request.body?.password ?? '');
    const user = await this.auth.authenticate(username, password);
    if (!user) {
      this.auth.recordAttempt(username, null, request.ip, '');
      request.flash('error', 'Usuário ou senha inválidos.');
      return response.redirect('/login');
    }
    const maxAge = user.isAdmin
      ? 8 * 3600_000
      : this.auth.cookieMaxAge(request.body?.remember);
    await new Promise<void>((resolve, reject) =>
      request.session.regenerate((error) =>
        error ? reject(error) : resolve(),
      ),
    );
    const { credentialRevision, ...identity } = user;
    request.session.user = identity;
    request.session.security = startSessionSecurity(
      credentialRevision,
      !user.isAdmin && Boolean(maxAge),
    );
    request.session.cookie.maxAge = maxAge;
    await new Promise<void>((resolve, reject) =>
      request.session.save((error) => (error ? reject(error) : resolve())),
    );
    response.locals.loginSucceeded = true;
    this.auth.recordAttempt(username, user, request.ip, '');
    return response.redirect('/dashboard');
  }
  @Get('register')
  registerPage(@Res() response: Response) {
    return response.redirect('/login');
  }
  @Post('register')
  register(@Res() response: Response) {
    return response.status(403).send('Cadastro publico desativado.');
  }
  @Post('logout')
  async logout(@Req() request: AuthRequest, @Res() response: Response) {
    await new Promise<void>((resolve, reject) =>
      request.session.destroy((error) => (error ? reject(error) : resolve())),
    );
    response.clearCookie('ixstreaming.painel.sid', { path: '/' });
    return response.redirect('/login');
  }
}

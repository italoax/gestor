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
import {
  PANEL_SESSION_IDLE_MS,
  startSessionSecurity,
} from '../../../../src/services/sessionSecurity.ts';
import { TWO_FACTOR_CHALLENGE_MS } from '../../../../src/security/twoFactor.ts';
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
    const challenge = request.session.twoFactorChallenge;
    const twoFactorRequired = Boolean(
      challenge &&
      challenge.attempts < 5 &&
      Date.now() - challenge.createdAt < TWO_FACTOR_CHALLENGE_MS,
    );
    if (!twoFactorRequired) delete request.session.twoFactorChallenge;
    return response.render('pages/login', {
      title: 'Login',
      twoFactorRequired,
    });
  }
  @Post('login')
  async login(@Req() request: AuthRequest, @Res() response: Response) {
    delete request.session.twoFactorChallenge;
    const username = String(request.body?.username ?? '').trim(),
      password = String(request.body?.password ?? '');
    const user = await this.auth.authenticate(username, password);
    if (!user) {
      this.auth.recordAttempt(username, null, request.ip);
      request.flash('error', 'Usuário ou senha inválidos.');
      return response.redirect('/login');
    }
    await new Promise<void>((resolve, reject) =>
      request.session.regenerate((error) =>
        error ? reject(error) : resolve(),
      ),
    );
    if (user.twoFactorRequired) {
      request.session.twoFactorChallenge = {
        userId: user.id,
        revision: user.credentialRevision,
        createdAt: Date.now(),
        attempts: 0,
      };
      request.session.cookie.maxAge = TWO_FACTOR_CHALLENGE_MS;
      await new Promise<void>((resolve, reject) =>
        request.session.save((error) => (error ? reject(error) : resolve())),
      );
      response.locals.loginStepSucceeded = true;
      return response.redirect('/login');
    }
    return this.finishLogin(request, response, user);
  }
  @Post('login/segundo-fator')
  async secondFactor(@Req() request: AuthRequest, @Res() response: Response) {
    const challenge = request.session.twoFactorChallenge;
    if (
      !challenge ||
      challenge.attempts >= 5 ||
      Date.now() - challenge.createdAt >= TWO_FACTOR_CHALLENGE_MS
    ) {
      delete request.session.twoFactorChallenge;
      request.flash(
        'error',
        'A verificação expirou. Entre novamente com seu usuário e senha.',
      );
      return response.redirect('/login');
    }
    challenge.attempts++;
    const user = await this.auth.completeTwoFactor(
      challenge,
      request.body?.code,
    );
    if (!user) {
      this.auth.recordAttempt('second-factor', null, request.ip);
      if (challenge.attempts >= 5) delete request.session.twoFactorChallenge;
      request.flash(
        'error',
        challenge.attempts >= 5
          ? 'Limite de tentativas atingido. Entre novamente.'
          : 'Código inválido ou já utilizado. Confira o aplicativo ou use um código de recuperação.',
      );
      return response.redirect('/login');
    }
    await new Promise<void>((resolve, reject) =>
      request.session.regenerate((error) =>
        error ? reject(error) : resolve(),
      ),
    );
    return this.finishLogin(request, response, user);
  }
  @Post('login/cancelar')
  cancelSecondFactor(@Req() request: AuthRequest, @Res() response: Response) {
    delete request.session.twoFactorChallenge;
    return response.redirect('/login');
  }
  private async finishLogin(
    request: AuthRequest,
    response: Response,
    user: PanelUser & {
      credentialRevision: string;
      twoFactorRequired?: boolean;
    },
  ) {
    const {
      credentialRevision,
      twoFactorRequired: _required,
      ...identity
    } = user;
    request.session.user = identity;
    request.session.security = startSessionSecurity(credentialRevision);
    request.session.cookie.maxAge = PANEL_SESSION_IDLE_MS;
    await new Promise<void>((resolve, reject) =>
      request.session.save((error) => (error ? reject(error) : resolve())),
    );
    response.locals.loginSucceeded = true;
    this.auth.recordAttempt(user.username, user, request.ip);
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
  @Get('api/session/activity')
  activityStatus(@Req() request: AuthRequest, @Res() response: Response) {
    response.set('Cache-Control', 'no-store');
    if (!request.session.user || !request.session.security)
      return response.status(401).json({ ok: false });
    const expiresAt =
      response.locals.sessionExpiresAt ??
      request.session.security.lastActiveAt + PANEL_SESSION_IDLE_MS;
    return response.json({
      ok: true,
      expiresAt,
      remainingMs: Math.max(0, expiresAt - Date.now()),
    });
  }
  @Post('api/session/activity')
  async activity(@Req() request: AuthRequest, @Res() response: Response) {
    if (!request.session.user || !request.session.security)
      return response.status(401).json({ ok: false });
    const idleForMs = Number(request.body?.idleForMs);
    if (
      !Number.isSafeInteger(idleForMs) ||
      idleForMs < 0 ||
      idleForMs >= (response.locals.sessionIdleMs ?? PANEL_SESSION_IDLE_MS)
    )
      return response.status(400).json({ ok: false });
    const now = Date.now();
    request.session.security.lastActiveAt = Math.max(
      request.session.security.lastActiveAt,
      now - idleForMs,
    );
    response.locals.sessionExpiresAt = Math.min(
      request.session.security.lastActiveAt +
        (response.locals.sessionIdleMs ?? PANEL_SESSION_IDLE_MS),
      response.locals.sessionAbsoluteExpiresAt ?? Infinity,
    );
    request.session.cookie.maxAge = response.locals.sessionExpiresAt - now;
    await new Promise<void>((resolve, reject) =>
      request.session.save((error) => (error ? reject(error) : resolve())),
    );
    return this.activityStatus(request, response);
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

import {
  Controller,
  Get,
  Post,
  Req,
  Res,
  Inject,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service.ts';
import { ClientsAuthGuard } from '../clients/clients.guard.ts';
import { CatalogExceptionFilter } from '../catalogs/catalog.filter.ts';
import { hasRecentAuthentication } from '../../../../src/services/sessionSecurity.ts';

@Controller('api/session/confirm')
@UseFilters(CatalogExceptionFilter)
@UseGuards(ClientsAuthGuard)
export class SessionConfirmationController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  @Get()
  async status(@Req() request: Request, @Res() response: Response) {
    response.set('Cache-Control', 'private, no-store');
    const security = request.session.security;
    const user = security?.credentialRevision
      ? await this.auth.findSessionUser(
          request.session.user!.id,
          security.credentialRevision,
        )
      : null;
    if (!user)
      return response.status(401).json({
        ok: false,
        error: 'Sua sessão expirou. Entre novamente para continuar.',
      });
    const recent = hasRecentAuthentication(security);
    return response.json({
      ok: true,
      recent,
      twoFactorRequired:
        !recent && (await this.auth.twoFactor.status(Number(user.id))).enabled,
    });
  }

  @Post()
  async confirm(@Req() request: Request, @Res() response: Response) {
    response.status(200);
    response.set('Cache-Control', 'private, no-store');
    const security = request.session.security;
    if (!security?.credentialRevision)
      return response.status(401).json({
        ok: false,
        error: 'Sua sessão expirou. Entre novamente para continuar.',
      });
    const identity = request.session.user!;
    const user = await this.auth.authenticate(
      identity.username,
      String(request.body?.password ?? ''),
    );
    if (
      !user ||
      user.id !== identity.id ||
      user.credentialRevision !== security.credentialRevision
    ) {
      await this.auth.audit(
        'login.failure',
        identity.id,
        'session_confirmation',
      );
      return response.status(403).json({
        ok: false,
        error: 'Senha incorreta ou limite de tentativas atingido.',
      });
    }
    if (user.twoFactorRequired) {
      const verified = await this.auth.completeTwoFactor(
        {
          userId: identity.id,
          revision: user.credentialRevision,
          createdAt: Date.now(),
          attempts: 0,
        },
        request.body?.code,
      );
      if (!verified) {
        await this.auth.audit(
          'login.failure',
          identity.id,
          'session_confirmation_totp',
        );
        return response.status(403).json({
          ok: false,
          twoFactorRequired: true,
          error:
            'Confira o código do autenticador ou use um código de recuperação.',
        });
      }
    }
    const previous = security.recentAuthAt;
    security.recentAuthAt = Date.now();
    try {
      await new Promise<void>((resolve, reject) =>
        request.session.save((error) => (error ? reject(error) : resolve())),
      );
    } catch (error) {
      security.recentAuthAt = previous;
      throw error;
    }
    await this.auth.audit('login.success', identity.id, 'session_confirmation');
    return response.json({ ok: true });
  }
}

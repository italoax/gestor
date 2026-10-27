import {
  Controller,
  Get,
  Post,
  Param,
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
import {
  TWO_FACTOR_SETUP_MS,
  TwoFactorError,
} from '../../../../src/security/twoFactor.ts';
import { hasRecentAuthentication } from '../../../../src/services/sessionSecurity.ts';

@Controller('api/account/two-factor')
@UseFilters(CatalogExceptionFilter)
@UseGuards(ClientsAuthGuard)
export class TwoFactorController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  @Get()
  async status(@Req() request: Request, @Res() response: Response) {
    response.set('Cache-Control', 'private, no-store');
    return response.json({
      ok: true,
      ...(await this.auth.twoFactor.status(request.session.user!.id)),
    });
  }

  @Post(':action')
  async change(
    @Param('action') action: string,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    response.status(200);
    response.set('Cache-Control', 'private, no-store');
    response.set('Referrer-Policy', 'no-referrer');
    const userId = request.session.user!.id;
    if (!['setup', 'enable', 'disable', 'recovery', 'cancel'].includes(action))
      return response
        .status(404)
        .json({ ok: false, error: 'Operação não encontrada.' });
    if (action === 'cancel') {
      delete request.session.twoFactorSetup;
      return response.json({ ok: true });
    }
    const revision = request.session.security?.credentialRevision || '';
    const user = await this.auth.findSessionUser(userId, revision);
    if (!user) {
      return response.status(401).json({
        ok: false,
        error: 'Entre novamente para continuar.',
      });
    }
    if (
      ['setup', 'enable'].includes(action) &&
      !hasRecentAuthentication(request.session.security)
    )
      return response.status(403).json({
        ok: false,
        error:
          'Por segurança, saia e entre novamente antes de configurar o autenticador.',
      });
    try {
      if (action === 'setup') {
        const setup = await this.auth.twoFactor.setup(
          userId,
          String(user.username),
        );
        request.session.twoFactorSetup = {
          sealed: setup.sealed,
          createdAt: Date.now(),
          revision,
        };
        await new Promise<void>((resolve, reject) =>
          request.session.save((error) => (error ? reject(error) : resolve())),
        );
        return response.json({
          ok: true,
          secret: setup.secret,
          qrCode: setup.qrCode,
        });
      }
      let result: { revision: string; recoveryCodes: string[] };
      if (action === 'enable') {
        const setup = request.session.twoFactorSetup;
        if (
          !setup ||
          setup.revision !== revision ||
          Date.now() - setup.createdAt >= TWO_FACTOR_SETUP_MS
        )
          throw new TwoFactorError(
            'A configuração expirou. Comece novamente para gerar outro QR code.',
          );
        result = await this.auth.twoFactor.enable(
          userId,
          revision,
          setup.sealed,
          request.body?.code,
        );
      } else {
        result = await this.auth.twoFactor.change(
          userId,
          revision,
          request.body?.code,
          action as 'disable' | 'recovery',
        );
      }
      request.session.security!.credentialRevision = result.revision;
      request.session.security!.recentAuthAt = Date.now();
      delete request.session.twoFactorSetup;
      await new Promise<void>((resolve, reject) =>
        request.session.save((error) => (error ? reject(error) : resolve())),
      );
      await this.auth.audit('credentials.changed', userId, `totp_${action}`);
      return response.json({
        ok: true,
        enabled: action !== 'disable',
        recoveryCodes: result.recoveryCodes,
      });
    } catch (error) {
      if (!(error instanceof TwoFactorError)) throw error;
      await this.auth.audit('login.failure', userId, 'totp_configuration');
      return response.status(400).json({ ok: false, error: error.message });
    }
  }
}

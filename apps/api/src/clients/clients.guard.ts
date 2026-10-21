import {
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
@Injectable()
export class ClientsAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const http = context.switchToHttp(),
      request = http.getRequest(),
      response = http.getResponse();
    if (request.session?.user?.id) return true;
    if (request.path.startsWith('/api/'))
      response
        .status(401)
        .json({ ok: false, error: 'Faça login para continuar.' });
    else response.redirect('/login');
    return false;
  }
}
